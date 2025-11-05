import { google, type calendar_v3 } from 'googleapis';

const calendarScopes = ['https://www.googleapis.com/auth/calendar'];
let calendarClient: calendar_v3.Calendar | null = null;

function getCalendarResources() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar service account credentials are not configured');
  }

  if (!calendarClient) {
    const normalizedKey = privateKey.replace(/\\n/g, '\n');
    const auth = new google.auth.JWT(clientEmail, undefined, normalizedKey, calendarScopes);
    calendarClient = google.calendar({ version: 'v3', auth });
  }

  return { calendar: calendarClient, calendarId };
}

// Check availability for a specific time slot
export async function checkAvailability(
  date: Date,
  durationMinutes: number
): Promise<boolean> {
  try {
    const { calendar, calendarId } = getCalendarResources();

    const endTime = new Date(date.getTime() + durationMinutes * 60000);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: date.toISOString(),
        timeMax: endTime.toISOString(),
        items: [{ id: calendarId }],
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
    const { calendar, calendarId } = getCalendarResources();
    
    const dayStart = new Date(date);
    dayStart.setHours(startHour, 0, 0, 0);
    
    const dayEnd = new Date(date);
    dayEnd.setHours(endHour, 0, 0, 0);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: calendarId }],
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
    const { calendar, calendarId } = getCalendarResources();
    
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
      calendarId,
      requestBody: event,
    });

    return response.data.id || null;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return null;
  }
}
