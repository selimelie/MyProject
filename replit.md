# AI SaaS Multi-Tenant Automation Platform

## Overview
A full-stack multi-tenant AI SaaS platform that enables businesses to automate customer interactions across multiple messaging channels (WhatsApp, Instagram, Messenger) using AI agents powered by Google Gemini. The platform handles customer inquiries, processes orders, schedules appointments, manages inventory, and processes payments through Stripe subscriptions.

## Project Status: Production-Ready MVP

### Completed Features

#### 1. Authentication & Multi-Tenancy
- **User registration** with business setup (owner account creation)
- **Passport.js authentication** with session management
- **Role-based access control** (Owner, Order Manager, Accountant)
- **Multi-tenant architecture** with shop-level data isolation
- Secure session storage with PostgreSQL

#### 2. Product & Service Management
- **Product catalog** with inventory tracking (stock management)
- **Service catalog** with duration-based pricing
- CRUD operations for products and services
- Active/inactive status management
- Cost tracking for profit calculations

#### 3. AI Agent (Google Gemini)
- **Conversational AI** for customer support
- **Intent detection** (orders, appointments, human handoff)
- **Context-aware responses** with conversation history
- **Product/service recommendations**
- **Automatic order creation** from chat conversations
- **Appointment booking** through natural conversation
- **Human handoff detection** (keywords: "human", "support", "talk to someone")

#### 4. Multi-Channel Messaging
- **Meta Graph API integration** (WhatsApp, Instagram, Messenger)
- **Webhook verification** with token validation
- **HMAC signature verification** for security
- **Bidirectional messaging** (receive & send)
- **Platform tracking** in conversations
- **Real-time message processing**

#### 5. Order Management
- **Order creation** via AI chat or manual entry
- **Inventory deduction** on order confirmation
- **Order status tracking** (pending, confirmed, completed, cancelled)
- **Revenue and profit tracking**
- **Multi-product orders** with quantity support

#### 6. Appointment Scheduling
- **Google Calendar integration** for availability checking
- **Real-time slot availability** via Google Calendar API
- **Automatic calendar event creation** on booking
- **Service duration calculation**
- **Appointment status management**
- **Conflict detection** and prevention

#### 7. Stripe Payment Integration
- **Subscription tiers** (Starter: $29/mo, Pro: $79/mo, Business: $149/mo)
- **Stripe Checkout** session creation
- **Webhook handling** for payment events
- **Automatic subscription updates** in database
- **Customer portal** for managing subscriptions
- **Secure payment processing**

#### 8. Subscription Automation
- **Daily cron job** (runs at 2:00 AM)
- **7-day expiration warnings** via email
- **Automatic renewal** via Stripe API sync
- **Failed payment handling** with notifications
- **Account suspension** on expiration
- **Resend email integration** with HTML templates
- **Manual trigger** for testing (owner-only endpoint)

#### 9. Human Handoff Workflow
- **Automatic detection** of support requests
- **Conversation pausing** for human agents
- **Support Queue UI** for viewing paused conversations
- **Live chat interface** for human responses
- **Resume AI** functionality
- **Role-based access** (owner & order manager only)
- **Real-time updates** via WebSocket

#### 10. Real-Time Updates (WebSocket)
- **Persistent WebSocket connections** with session authentication
- **Shop-scoped broadcasting** for multi-tenant isolation
- **Live events**: ORDER_CREATED, APPOINTMENT_CREATED, MESSAGE_RECEIVED, PAYMENT_COMPLETED
- **Automatic reconnection** with exponential backoff
- **Health monitoring** with ping/pong heartbeats
- **Dashboard live updates**

#### 11. Role-Based Dashboards
- **Owner**: Full access to all features and analytics
- **Order Manager**: Operations (orders, appointments, products, services, chat, support)
- **Accountant**: Financial data only (revenue, orders, appointments - no costs visible)
- **Filtered analytics** based on role permissions
- **Dynamic navigation** based on user role

#### 12. Analytics & Reporting
- **Revenue tracking** with trend analysis
- **Profit margins** (owner-only)
- **Top products** by revenue and quantity
- **Top services** by revenue and bookings
- **7-day revenue charts**
- **Order and appointment statistics**
- **Real-time dashboard** with WebSocket updates

#### 13. Logging & Audit Trail
- **Winston structured logging** with daily rotation
- **Audit logs** for critical actions (orders, payments, subscriptions, user actions)
- **Request/response logging** for debugging
- **Error tracking** with stack traces
- **IP address and user agent** tracking
- **Separate error logs** with 30-day retention

## Technology Stack

### Backend
- **Node.js + Express** - Server framework
- **TypeScript** - Type safety
- **PostgreSQL (Neon)** - Database
- **Drizzle ORM** - Type-safe database queries
- **Passport.js** - Authentication
- **WebSocket (ws)** - Real-time updates
- **Stripe** - Payment processing
- **Google Gemini** - AI agent
- **Google Calendar API** - Appointment scheduling
- **Meta Graph API** - Messaging channels
- **Resend** - Email service
- **Winston** - Logging
- **node-cron** - Scheduled tasks

### Frontend
- **React** - UI library
- **Wouter** - Routing
- **TanStack Query** - Data fetching
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **Lucide Icons** - Icons
- **Recharts** - Charts and analytics

## Architecture

### Multi-Tenant Design
- Each business is a "shop" (tenant)
- Users belong to shops
- All data is shop-scoped
- Row-level isolation in queries
- Shop ID in JWT session

### Security
- **Session-based authentication** with secure cookies
- **HMAC signature verification** for webhooks
- **Role-based access control** middleware
- **SQL injection prevention** via Drizzle ORM
- **HTTPS enforced** in production
- **Environment secrets** managed via Replit

### Real-Time Architecture
- **WebSocket server** in noServer mode
- **Session authentication** during upgrade
- **Shop-scoped broadcasts** for multi-tenancy
- **Automatic reconnection** on client
- **Health monitoring** with heartbeats

### Data Flow
1. **Customer → Meta Platform → Webhook → AI Agent → Response**
2. **AI Agent → Intent Detection → Action (Order/Appointment/Human)**
3. **Action → Database → WebSocket → Dashboard Update**
4. **Payment → Stripe → Webhook → Database → Email Notification**

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new business
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - List products (shop-scoped)
- `POST /api/products` - Create product
- `PATCH /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Services
- `GET /api/services` - List services (shop-scoped)
- `POST /api/services` - Create service
- `PATCH /api/services/:id` - Update service
- `DELETE /api/services/:id` - Delete service

### Orders
- `GET /api/orders` - List orders (shop-scoped)
- `POST /api/orders` - Create order
- `PATCH /api/orders/:id` - Update order status

### Appointments
- `GET /api/appointments` - List appointments (shop-scoped)
- `POST /api/appointments` - Create appointment
- `PATCH /api/appointments/:id` - Update appointment
- `POST /api/appointments/check-availability` - Check calendar availability
- `POST /api/appointments/available-slots` - Get available time slots

### Conversations & Chat
- `GET /api/conversations` - List conversations (shop-scoped)
- `POST /api/conversations` - Create conversation
- `GET /api/conversations/:id/messages` - Get messages
- `POST /api/conversations/:id/messages` - Send message (AI response)

### Support Queue (Owner & Order Manager only)
- `GET /api/support/queue` - Get paused conversations
- `POST /api/support/:id/pause` - Pause conversation for human
- `POST /api/support/:id/resume` - Resume AI handling
- `POST /api/support/:id/send-message` - Send human message

### Subscriptions
- `GET /api/subscription` - Get subscription details
- `POST /api/subscription/create-checkout` - Create Stripe checkout
- `POST /api/subscription/portal` - Create customer portal session
- `POST /api/webhooks/stripe` - Stripe webhook handler

### Meta Webhooks
- `GET /api/webhooks/meta` - Webhook verification
- `POST /api/webhooks/meta` - Message handler

### Admin (Owner only)
- `POST /api/admin/run-subscription-checks` - Manual subscription automation trigger

### Analytics
- `GET /api/dashboard` - Get dashboard analytics (role-filtered)

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...
PGHOST=...
PGPORT=5432
PGUSER=...
PGPASSWORD=...
PGDATABASE=...

# Authentication
SESSION_SECRET=...

# Stripe
STRIPE_SECRET_KEY=sk_...
VITE_STRIPE_PUBLIC_KEY=pk_...

# Google Gemini AI
GEMINI_API_KEY=...

# Meta Graph API (Optional - for messaging)
META_APP_SECRET=...
META_ACCESS_TOKEN=...

# Resend Email (Optional - for subscription emails)
# Managed via Replit connector

# Google Calendar (Optional - for appointments)
# Managed via Replit connector

# Logging
LOG_LEVEL=info # (debug, info, warn, error)
NODE_ENV=development # or production
```

## Database Schema

### shops
- id, name, ownerEmail, businessType (product/service)
- plan (starter/pro/business), status (active/inactive/suspended)
- stripeCustomerId, stripeSubscriptionId, expiryDate

### users
- id, shopId, username, email, password, role

### products
- id, shopId, name, description, price, cost, stock, active

### services
- id, shopId, name, description, price, duration, active

### orders
- id, shopId, productId, customerName, customerPhone, quantity, totalPrice, status

### appointments
- id, shopId, serviceId, customerName, customerPhone, scheduledAt, status, calendarEventId

### conversations
- id, shopId, customerId, customerName, platform, status, pausedForHuman, lastMessageAt

### messages
- id, conversationId, role (user/assistant), content

### subscriptions
- id, shopId, plan, status, expiryDate, paymentMethod

## Deployment

### Prerequisites
- PostgreSQL database (Neon)
- Stripe account with API keys
- Google Gemini API key
- (Optional) Meta Developer account for messaging
- (Optional) Google Cloud project for Calendar API
- (Optional) Resend account for emails

### Setup
1. Install dependencies: `npm install`
2. Set environment variables
3. Push database schema: `npm run db:push`
4. Start server: `npm run dev`

### Production
- Server runs on port 5000 (REPLIT requirement)
- Subscription automation runs daily at 2:00 AM
- WebSocket server on /ws path
- Logs stored in logs/ directory with daily rotation

## Testing Checklist

- [ ] Business registration
- [ ] User authentication (login/logout)
- [ ] Role-based access (Owner, Order Manager, Accountant)
- [ ] Product/Service CRUD
- [ ] AI chat conversations
- [ ] Order creation via chat
- [ ] Appointment booking via chat
- [ ] Google Calendar integration
- [ ] Stripe payment flow
- [ ] Subscription upgrades
- [ ] Meta webhook integration
- [ ] WebSocket real-time updates
- [ ] Human handoff workflow
- [ ] Support queue management
- [ ] Subscription automation
- [ ] Email notifications

## Known Limitations

1. **Google Calendar**: Requires OAuth setup for production
2. **Meta Webhooks**: Requires public HTTPS endpoint
3. **Email**: Requires Resend account setup
4. **Stripe**: Test mode in development, production keys required for live payments

## Future Enhancements

- SMS notifications (Twilio)
- Advanced analytics and reporting
- Custom AI training per business
- Multi-language support
- Mobile app
- Advanced inventory management
- Webhook retry logic
- Redis caching for sessions
- BullMQ for background jobs
