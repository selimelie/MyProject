import cron from 'node-cron';
import { db } from './db';
import { subscriptions, shops } from '@shared/schema';
import { sql, lt, and, eq, gte } from 'drizzle-orm';
import Stripe from 'stripe';
import { 
  sendSubscriptionExpirationWarning, 
  sendSubscriptionExpiredNotification,
  sendPaymentFailedNotification 
} from './email';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY not set. Subscription automation will not work.');
}
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

interface SubscriptionCheckResult {
  expiring: number;
  expired: number;
  renewed: number;
  failed: number;
}

export class SubscriptionAutomation {
  private isRunning = false;

  /**
   * Check for subscriptions expiring in 7 days and send warning emails
   */
  async checkExpiringSubscriptions(): Promise<number> {
    // Calculate start and end of 7 days from now (entire day)
    const sevenDaysStart = new Date();
    sevenDaysStart.setDate(sevenDaysStart.getDate() + 7);
    sevenDaysStart.setHours(0, 0, 0, 0);
    
    const sevenDaysEnd = new Date(sevenDaysStart);
    sevenDaysEnd.setHours(23, 59, 59, 999);

    const expiringSubscriptions = await db
      .select({
        subscription: subscriptions,
        shop: shops,
      })
      .from(subscriptions)
      .innerJoin(shops, eq(subscriptions.shopId, shops.id))
      .where(
        and(
          eq(subscriptions.status, 'active'),
          gte(subscriptions.expiryDate, sevenDaysStart),
          lt(subscriptions.expiryDate, sevenDaysEnd)
        )
      );

    console.log(`[Subscription Automation] Found ${expiringSubscriptions.length} subscriptions expiring in ~7 days`);

    for (const { subscription, shop } of expiringSubscriptions) {
      try {
        const sent = await sendSubscriptionExpirationWarning(
          shop.ownerEmail,
          shop.name,
          subscription.expiryDate!,
          subscription.plan
        );
        if (sent) {
          console.log(`[Subscription Automation] Warning email sent to ${shop.ownerEmail}`);
        } else {
          console.error(`[Subscription Automation] Failed to send warning email for shop ${shop.id}`);
        }
      } catch (error) {
        console.error(`[Subscription Automation] Failed to send warning email for shop ${shop.id}:`, error);
      }
    }

    return expiringSubscriptions.length;
  }

  /**
   * Check for expired subscriptions and update their status
   */
  async checkExpiredSubscriptions(): Promise<number> {
    const now = new Date();

    const expiredSubscriptions = await db
      .select({
        subscription: subscriptions,
        shop: shops,
      })
      .from(subscriptions)
      .innerJoin(shops, eq(subscriptions.shopId, shops.id))
      .where(
        and(
          eq(subscriptions.status, 'active'),
          lt(subscriptions.expiryDate, now)
        )
      );

    console.log(`[Subscription Automation] Found ${expiredSubscriptions.length} expired subscriptions`);

    for (const { subscription, shop } of expiredSubscriptions) {
      try {
        // Update subscription status to inactive
        await db
          .update(subscriptions)
          .set({
            status: 'inactive',
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, subscription.id));

        // Also update shop status
        await db
          .update(shops)
          .set({
            status: 'suspended',
          })
          .where(eq(shops.id, shop.id));

        console.log(`[Subscription Automation] Marked shop ${shop.id} as suspended due to expired subscription`);

        // Send expiration notification
        await sendSubscriptionExpiredNotification(
          shop.ownerEmail,
          shop.name,
          subscription.plan
        );
      } catch (error) {
        console.error(`[Subscription Automation] Failed to update expired subscription for shop ${shop.id}:`, error);
      }
    }

    return expiredSubscriptions.length;
  }

  /**
   * Attempt to renew subscriptions via Stripe
   */
  async processSubscriptionRenewals(): Promise<{ renewed: number; failed: number }> {
    if (!stripe) {
      console.warn('[Subscription Automation] Stripe not configured, skipping renewals');
      return { renewed: 0, failed: 0 };
    }

    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // Get subscriptions expiring in the next 3 days that are active
    const renewalCandidates = await db
      .select({
        subscription: subscriptions,
        shop: shops,
      })
      .from(subscriptions)
      .innerJoin(shops, eq(subscriptions.shopId, shops.id))
      .where(
        and(
          eq(subscriptions.status, 'active'),
          gte(subscriptions.expiryDate, now),
          lt(subscriptions.expiryDate, threeDaysFromNow)
        )
      );

    console.log(`[Subscription Automation] Found ${renewalCandidates.length} subscriptions for renewal`);

    let renewed = 0;
    let failed = 0;

    for (const { subscription, shop } of renewalCandidates) {
      try {
        if (!shop.stripeCustomerId || !shop.stripeSubscriptionId) {
          console.log(`[Subscription Automation] Shop ${shop.id} missing Stripe info, skipping renewal`);
          continue;
        }

        // Retrieve the Stripe subscription
        const stripeSubscription = await stripe.subscriptions.retrieve(shop.stripeSubscriptionId);

        if (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing') {
          // Stripe subscription is active, extend expiry date
          const newExpiryDate = new Date(stripeSubscription.current_period_end * 1000);

          await db
            .update(subscriptions)
            .set({
              expiryDate: newExpiryDate,
              status: 'active',
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.id, subscription.id));

          await db
            .update(shops)
            .set({
              expiryDate: newExpiryDate,
              status: 'active',
            })
            .where(eq(shops.id, shop.id));

          console.log(`[Subscription Automation] Successfully renewed subscription for shop ${shop.id}`);
          renewed++;
        } else if (stripeSubscription.status === 'past_due' || stripeSubscription.status === 'unpaid') {
          // Payment failed, mark as past_due
          await db
            .update(subscriptions)
            .set({
              status: 'past_due',
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.id, subscription.id));

          console.log(`[Subscription Automation] Subscription for shop ${shop.id} is past due`);
          
          // Send payment failed notification
          await sendPaymentFailedNotification(
            shop.ownerEmail,
            shop.name,
            subscription.plan
          );
          
          failed++;
        } else {
          console.log(`[Subscription Automation] Unexpected Stripe status ${stripeSubscription.status} for shop ${shop.id}`);
        }
      } catch (error: any) {
        console.error(`[Subscription Automation] Failed to renew subscription for shop ${shop.id}:`, error.message);
        failed++;
      }
    }

    return { renewed, failed };
  }

  /**
   * Run all subscription checks
   */
  async runDailyChecks(): Promise<SubscriptionCheckResult> {
    if (this.isRunning) {
      console.log('[Subscription Automation] Daily checks already running, skipping');
      return { expiring: 0, expired: 0, renewed: 0, failed: 0 };
    }

    this.isRunning = true;
    console.log('[Subscription Automation] Starting daily subscription checks');

    try {
      const expiring = await this.checkExpiringSubscriptions();
      const expired = await this.checkExpiredSubscriptions();
      const { renewed, failed } = await this.processSubscriptionRenewals();

      console.log('[Subscription Automation] Daily checks completed:', {
        expiring,
        expired,
        renewed,
        failed,
      });

      return { expiring, expired, renewed, failed };
    } catch (error) {
      console.error('[Subscription Automation] Error during daily checks:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the cron job (runs daily at 2 AM)
   */
  start() {
    console.log('[Subscription Automation] Starting cron job (daily at 2:00 AM)');
    
    // Run daily at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('[Subscription Automation] Cron job triggered');
      await this.runDailyChecks();
    });

    // Also run on startup after 1 minute (for testing/immediate check)
    setTimeout(async () => {
      console.log('[Subscription Automation] Running initial check on startup');
      await this.runDailyChecks();
    }, 60000);
  }
}

export const subscriptionAutomation = new SubscriptionAutomation();
