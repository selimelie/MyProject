# Meta Platforms Setup Guide
## Connecting WhatsApp, Instagram, and Messenger to Your AI SaaS Platform

This guide will help you connect your customers' messaging platforms (WhatsApp, Instagram, Messenger) to your AI automation platform.

## Prerequisites

1. A Meta Developer Account (https://developers.facebook.com/)
2. A Facebook Business Account
3. Your Replit app URL (e.g., `https://your-app-name.replit.app`)

## Step 1: Create a Meta App

1. Go to https://developers.facebook.com/apps
2. Click "Create App"
3. Select "Business" as the app type
4. Fill in your app details:
   - App Name: "Your Business AI Assistant"
   - Contact Email: Your email
   - Business Account: Select your business

## Step 2: Add WhatsApp Product

1. In your app dashboard, click "Add Product"
2. Find "WhatsApp" and click "Set Up"
3. Select or create a Business Account
4. Add a phone number for WhatsApp Business API

### Configure WhatsApp Webhooks

1. Go to WhatsApp > Configuration
2. Click "Edit" next to Webhook
3. Set Callback URL: `https://your-app-name.replit.app/api/webhooks/meta`
4. Set Verify Token: Create a random string (e.g., "my_verify_token_12345")
5. Add this token as an environment secret in Replit:
   ```
   META_VERIFY_TOKEN=my_verify_token_12345
   ```
6. Click "Verify and Save"
7. Subscribe to webhook fields: `messages`

## Step 3: Add Messenger Product

1. In your app dashboard, click "Add Product"
2. Find "Messenger" and click "Set Up"
3. Connect a Facebook Page to your app

### Configure Messenger Webhooks

1. Go to Messenger > Settings
2. In "Webhooks" section, click "Add Callback URL"
3. Callback URL: `https://your-app-name.replit.app/api/webhooks/meta`
4. Verify Token: (same as WhatsApp) `my_verify_token_12345`
5. Click "Verify and Save"
6. Subscribe to webhook fields:
   - `messages`
   - `messaging_postbacks`

## Step 4: Add Instagram Product

1. In your app dashboard, click "Add Product"
2. Find "Instagram" and click "Set Up"
3. Connect your Instagram Business Account

### Configure Instagram Webhooks

1. Go to Instagram > Configuration
2. Click "Edit" next to Webhook
3. Callback URL: `https://your-app-name.replit.app/api/webhooks/meta`
4. Verify Token: (same as above) `my_verify_token_12345`
5. Subscribe to webhook fields: `messages`

## Step 5: Get Your Access Tokens

### WhatsApp Access Token

1. Go to WhatsApp > API Setup
2. Copy your temporary access token
3. Generate a permanent access token (recommended for production):
   - Go to "System Users" in Business Settings
   - Create a system user
   - Generate a permanent token with `whatsapp_business_messaging` permission

### Messenger & Instagram Access Token

1. Go to Messenger > Settings (or Instagram > Settings)
2. Under "Access Tokens", generate a Page Access Token
3. For permanent token:
   - Go to Facebook Business Manager
   - System Users > Add new system user
   - Assign assets and generate token

## Step 6: Configure Environment Secrets in Replit

Add these secrets to your Replit project (do not share these):

```bash
# Meta App Secret (found in App Settings > Basic)
META_APP_SECRET=your_app_secret_here

# Access Token (from Step 5)
META_ACCESS_TOKEN=your_permanent_access_token_here

# Verify Token (from Step 2)
META_VERIFY_TOKEN=my_verify_token_12345

# Phone Number ID (WhatsApp only - found in WhatsApp > API Setup)
META_PHONE_NUMBER_ID=your_phone_number_id
```

## Step 7: Update Webhook Code

The webhook endpoint at `/api/webhooks/meta` is already set up in your app. It:

1. **Verifies webhook** using the verify token
2. **Validates signatures** using HMAC-SHA256 with app secret
3. **Processes messages** from WhatsApp, Instagram, and Messenger
4. **Routes to AI agent** for automated responses
5. **Sends replies** back through the appropriate channel

## Step 8: Test Your Setup

### Test Webhook Verification

1. When you add the callback URL in Meta Developer Dashboard, Meta will send a GET request
2. Your app will verify the token and respond
3. You should see "Webhook verified successfully" in Meta

### Test Message Flow

1. Send a test message on WhatsApp/Instagram/Messenger
2. Check your Replit logs - you should see:
   ```
   [Meta Webhook] Received message from platform: whatsapp
   [AI Agent] Processing message for customer: +1234567890
   ```
3. The AI should respond automatically
4. Check the Conversations page in your dashboard to see the chat

## Step 9: Send Messages (API)

To send messages programmatically, the webhook handler uses:

```javascript
// WhatsApp
POST https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
Headers: Authorization: Bearer {ACCESS_TOKEN}
Body: {
  messaging_product: "whatsapp",
  to: "{customer_phone}",
  text: { body: "{message}" }
}

// Messenger
POST https://graph.facebook.com/v18.0/me/messages
Headers: Authorization: Bearer {PAGE_ACCESS_TOKEN}
Body: {
  recipient: { id: "{customer_id}" },
  message: { text: "{message}" }
}

// Instagram
POST https://graph.facebook.com/v18.0/me/messages
Headers: Authorization: Bearer {PAGE_ACCESS_TOKEN}  
Body: {
  recipient: { id: "{customer_id}" },
  message: { text: "{message}" }
}
```

## Troubleshooting

### Webhook Not Receiving Messages

1. **Check webhook subscription**: Ensure you subscribed to `messages` field
2. **Verify callback URL**: Must be HTTPS (Replit provides this automatically)
3. **Check app status**: App must be in "Live" mode, not "Development"
4. **Review permissions**: Ensure proper permissions are granted

### Signature Verification Failed

1. **Check APP_SECRET**: Ensure `META_APP_SECRET` in Replit matches App Secret in Meta Dashboard
2. **Check raw body**: The signature is calculated on the raw request body - ensure your code doesn't parse it before verification

### Messages Not Sending

1. **Check access token**: Ensure `META_ACCESS_TOKEN` is valid and not expired
2. **Check permissions**: Token must have messaging permissions
3. **Check rate limits**: Meta has rate limits on message sending
4. **Review logs**: Check Replit logs for error messages

### Rate Limits

- **WhatsApp**: 1000 messages/day for new numbers (increases with usage)
- **Messenger**: Varies by page tier
- **Instagram**: 10-20 messages/second

## Going Live

Before going live:

1. **Submit for App Review**: Get `pages_messaging` and `instagram_manage_messages` permissions approved
2. **Add Privacy Policy**: Required by Meta
3. **Add Terms of Service**: Required by Meta
4. **Test thoroughly**: Send various message types
5. **Monitor logs**: Watch for errors in production
6. **Set up alerts**: Get notified of webhook failures

## Security Best Practices

1. **Never expose tokens**: Keep `META_APP_SECRET` and `META_ACCESS_TOKEN` secret
2. **Validate signatures**: Always verify HMAC signature on webhooks (already implemented)
3. **Use HTTPS**: Replit provides this automatically
4. **Rotate tokens**: Regularly update access tokens
5. **Monitor usage**: Watch for unusual activity

## Support Resources

- **Meta Developer Docs**: https://developers.facebook.com/docs
- **WhatsApp Business API**: https://developers.facebook.com/docs/whatsapp
- **Messenger Platform**: https://developers.facebook.com/docs/messenger-platform
- **Instagram Messaging**: https://developers.facebook.com/docs/messenger-platform/instagram
- **Meta Business Help Center**: https://www.facebook.com/business/help

## Current Implementation Status

✅ **Webhook endpoint configured** at `/api/webhooks/meta`
✅ **HMAC signature verification** implemented
✅ **Multi-platform support** (WhatsApp, Instagram, Messenger)
✅ **AI agent integration** with automatic responses
✅ **Conversation tracking** in database
✅ **Human handoff** support for complex queries

⚠️ **Required Setup** (You need to do):
- Create Meta Developer App
- Configure webhooks
- Add environment secrets (`META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_VERIFY_TOKEN`)
- Get app approved for production use
- Test message flow

---

**Need Help?** Check the Replit logs for detailed error messages and debugging information.
