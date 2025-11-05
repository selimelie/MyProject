import { Resend } from 'resend';

let cachedClient: Resend | null = null;

function getResendConfiguration() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    throw new Error('RESEND_API_KEY and RESEND_FROM_EMAIL must be configured');
  }

  if (!cachedClient) {
    cachedClient = new Resend(apiKey);
  }

  return { client: cachedClient, fromEmail };
}

function getAppBaseUrl(): string {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    throw new Error('APP_BASE_URL must be configured to generate links in transactional emails');
  }

  return baseUrl.replace(/\/$/, '');
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const { client, fromEmail } = getResendConfiguration();

    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.error('[Email] Failed to send email:', error);
      return false;
    }

    console.log('[Email] Email sent successfully:', data?.id);
    return true;
  } catch (error) {
    console.error('[Email] Error sending email:', error);
    return false;
  }
}

export async function sendSubscriptionExpirationWarning(
  email: string,
  businessName: string,
  expiryDate: Date,
  plan: string
): Promise<boolean> {
  const formattedDate = expiryDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subscriptionUrl = `${getAppBaseUrl()}/subscription`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Subscription Expiring Soon</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .content {
          background: #f9fafb;
          padding: 30px;
          border-radius: 0 0 8px 8px;
        }
        .alert-box {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .button {
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: 600;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6b7280;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0;">Subscription Expiring Soon</h1>
      </div>
      <div class="content">
        <p>Hello <strong>${businessName}</strong>,</p>
        
        <div class="alert-box">
          <strong>⚠️ Your ${plan.toUpperCase()} subscription will expire on ${formattedDate}</strong>
        </div>
        
        <p>Your subscription is set to expire in approximately 7 days. To ensure uninterrupted access to your AI automation platform, please renew your subscription.</p>
        
        <h3>What happens when your subscription expires?</h3>
        <ul>
          <li>Your AI agents will stop responding to customer messages</li>
          <li>You won't be able to process new orders or appointments</li>
          <li>Access to your dashboard and analytics will be limited</li>
          <li>Your data will be preserved for 30 days</li>
        </ul>

        <p style="text-align: center;">
          <a href="${subscriptionUrl}" class="button">
            Renew Subscription Now
          </a>
        </p>
        
        <p>If you've already renewed your subscription or have set up automatic renewal, you can safely ignore this email.</p>
        
        <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
        
        <p>Best regards,<br>
        <strong>Your AI SaaS Platform Team</strong></p>
      </div>
      <div class="footer">
        <p>This is an automated notification. Please do not reply to this email.</p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `⚠️ Your ${plan.toUpperCase()} subscription expires on ${formattedDate}`,
    html,
  });
}

export async function sendSubscriptionExpiredNotification(
  email: string,
  businessName: string,
  plan: string
): Promise<boolean> {
  const subscriptionUrl = `${getAppBaseUrl()}/subscription`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Subscription Expired</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: #dc2626;
          color: white;
          padding: 30px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .content {
          background: #f9fafb;
          padding: 30px;
          border-radius: 0 0 8px 8px;
        }
        .alert-box {
          background: #fee2e2;
          border-left: 4px solid #dc2626;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .button {
          display: inline-block;
          background: #dc2626;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: 600;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6b7280;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0;">Subscription Expired</h1>
      </div>
      <div class="content">
        <p>Hello <strong>${businessName}</strong>,</p>
        
        <div class="alert-box">
          <strong>🚫 Your ${plan.toUpperCase()} subscription has expired</strong>
        </div>
        
        <p>Your subscription has expired and your account has been temporarily suspended. Your AI agents are no longer responding to customer messages.</p>
        
        <h3>To restore your service:</h3>
        <ol>
          <li>Log in to your dashboard</li>
          <li>Navigate to the Subscription page</li>
          <li>Choose a plan and complete payment</li>
          <li>Your service will be restored immediately</li>
        </ol>
        
        <p style="text-align: center;">
          <a href="${subscriptionUrl}" class="button">
            Reactivate Your Account
          </a>
        </p>
        
        <p><strong>Important:</strong> Your data is safe and will be preserved for 30 days. After 30 days of inactivity, your data may be permanently deleted.</p>
        
        <p>If you believe this is an error or need assistance, please contact our support team immediately.</p>
        
        <p>Best regards,<br>
        <strong>Your AI SaaS Platform Team</strong></p>
      </div>
      <div class="footer">
        <p>This is an automated notification. Please do not reply to this email.</p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `🚫 Your ${plan.toUpperCase()} subscription has expired`,
    html,
  });
}

export async function sendPaymentFailedNotification(
  email: string,
  businessName: string,
  plan: string
): Promise<boolean> {
  const subscriptionUrl = `${getAppBaseUrl()}/subscription`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Failed</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: #f59e0b;
          color: white;
          padding: 30px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .content {
          background: #f9fafb;
          padding: 30px;
          border-radius: 0 0 8px 8px;
        }
        .alert-box {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .button {
          display: inline-block;
          background: #f59e0b;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: 600;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #6b7280;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0;">Payment Failed</h1>
      </div>
      <div class="content">
        <p>Hello <strong>${businessName}</strong>,</p>
        
        <div class="alert-box">
          <strong>⚠️ We couldn't process your payment for the ${plan.toUpperCase()} subscription</strong>
        </div>
        
        <p>We attempted to charge your payment method for your subscription renewal, but the payment was declined.</p>
        
        <h3>Common reasons for payment failures:</h3>
        <ul>
          <li>Insufficient funds in your account</li>
          <li>Expired or invalid payment method</li>
          <li>Card security settings or fraud prevention</li>
          <li>Incorrect billing information</li>
        </ul>
        
        <p style="text-align: center;">
          <a href="${subscriptionUrl}" class="button">
            Update Payment Method
          </a>
        </p>
        
        <p>Please update your payment information or try a different payment method. We'll automatically retry the payment, but to avoid service interruption, we recommend updating your payment details as soon as possible.</p>
        
        <p>If you continue to experience issues, please contact your bank or our support team for assistance.</p>
        
        <p>Best regards,<br>
        <strong>Your AI SaaS Platform Team</strong></p>
      </div>
      <div class="footer">
        <p>This is an automated notification. Please do not reply to this email.</p>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `⚠️ Payment failed for your ${plan.toUpperCase()} subscription`,
    html,
  });
}
