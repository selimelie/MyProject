import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGoogleCalendarClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Check availability for a specific time slot
export async function checkAvailability(
  date: Date,
  durationMinutes: number
): Promise<boolean> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    const endTime = new Date(date.getTime() + durationMinutes * 60000);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: date.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const busySlots = response.data.calendars?.primary?.busy || [];
    return busySlots.length === 0;
  } catch (error) {
    console.error('Error checking calendar availability:', error);
    // If calendar fails, allow booking (graceful degradation)
    return true;
  }
}

// Get available time slots for a given day
export async function getAvailableSlots(
  date: Date,
  durationMinutes: number,
  startHour: number = 9,
  endHour: number = 17
): Promise<Date[]> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    const dayStart = new Date(date);
    dayStart.setHours(startHour, 0, 0, 0);
    
    const dayEnd = new Date(date);
    dayEnd.setHours(endHour, 0, 0, 0);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const busySlots = response.data.calendars?.primary?.busy || [];
    
    // Generate potential time slots
    const slots: Date[] = [];
    const slotStart = new Date(dayStart);
    
    while (slotStart < dayEnd) {
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
      
      // Check if this slot conflicts with any busy periods
      const isAvailable = !busySlots.some((busy: any) => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return slotStart < busyEnd && slotEnd > busyStart;
      });
      
      if (isAvailable && slotEnd <= dayEnd) {
        slots.push(new Date(slotStart));
      }
      
      // Move to next slot (30 min intervals)
      slotStart.setMinutes(slotStart.getMinutes() + 30);
    }
    
    return slots;
  } catch (error) {
    console.error('Error getting available slots:', error);
    // If calendar fails, return empty array
    return [];
  }
}

// Create calendar event for appointment
export async function createCalendarEvent(
  customerName: string,
  serviceName: string,
  date: Date,
  durationMinutes: number,
  customerPhone?: string
): Promise<string | null> {
  try {
    const calendar = await getUncachableGoogleCalendarClient();
    
    const endTime = new Date(date.getTime() + durationMinutes * 60000);

    const event = {
      summary: `${serviceName} - ${customerName}`,
      description: `Appointment for ${serviceName}${customerPhone ? `\nContact: ${customerPhone}` : ''}`,
      start: {
        dateTime: date.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC',
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    return response.data.id || null;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return null;
  }
}
