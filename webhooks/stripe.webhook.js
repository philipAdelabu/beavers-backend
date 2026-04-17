const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { pool } = require('../config/database');
const { redis } = require('../config/redis');
const { logger } = require('../config/logger');
const NotificationService = require('../services/notification.service');
const EscrowService = require('../services/escrow.service');

class StripeWebhook {
  static async handleWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.error(`Stripe webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Check if event was already processed
    const eventKey = `stripe:webhook:${event.id}`;
    const processed = await redis.get(eventKey);
    
    if (processed) {
      logger.info(`Stripe webhook ${event.id} already processed, skipping`);
      return res.json({ received: true, alreadyProcessed: true });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      logger.info(`Processing Stripe webhook: ${event.type} (${event.id})`);
      
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object, client);
          break;
          
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object, client);
          break;
          
        case 'payment_intent.processing':
          await this.handlePaymentIntentProcessing(event.data.object, client);
          break;
          
        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object, client);
          break;
          
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object, client);
          break;
          
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object, client);
          break;
          
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object, client);
          break;
          
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object, client);
          break;
          
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object, client);
          break;
          
        default:
          logger.info(`Unhandled Stripe event type: ${event.type}`);
      }
      
      // Mark event as processed
      await redis.setex(eventKey, 86400, 'processed');
      await redis.setex(`webhook:stripe:last`, 3600, new Date().toISOString());
      
      await client.query('COMMIT');
      res.json({ received: true });
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Stripe webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    } finally {
      client.release();
    }
  }
  
  static async handlePaymentIntentSucceeded(paymentIntent, client) {
    const { metadata, id, amount, currency, payment_method_types } = paymentIntent;
    const { jobId, clientId, billingId } = metadata;
    
    logger.info(`Payment succeeded for job ${jobId}: ${amount / 100} ${currency.toUpperCase()}`);
    
    // Update payment intent status
    await client.query(`
      UPDATE payment_intents 
      SET status = 'succeeded', 
          paid_at = NOW(),
          payment_method_types = $1
      WHERE payment_intent_id = $2
    `, [payment_method_types, id]);
    
    // Move funds to escrow
    await client.query(`
      INSERT INTO escrow_transactions (job_id, client_id, amount, transaction_type, status, dispute_buffer_until)
      VALUES ($1, $2, $3, 'full_payment', 'held', NOW() + INTERVAL '3 days')
    `, [jobId, clientId, amount / 100]);
    
    // Release base fee immediately (non-refundable)
    await client.query(`
      UPDATE escrow_transactions 
      SET status = 'released', release_date = NOW()
      WHERE job_id = $1 AND transaction_type = 'base_fee'
    `, [jobId]);
    
    // Release materials cost immediately
    await client.query(`
      UPDATE escrow_transactions 
      SET status = 'released', release_date = NOW()
      WHERE job_id = $1 AND transaction_type = 'materials'
    `, [jobId]);
    
    // Update job billing status
    await client.query(`
      UPDATE job_billing 
      SET billing_status = 'paid', paid_at = NOW()
      WHERE job_id = $1
    `, [jobId]);
    
    // Get job details for notification
    const jobResult = await client.query(`
      SELECT j.*, 
             cp.email as client_email, 
             cp.full_legal_name as client_name,
             cp.phone as client_phone,
             ap.email as artisan_email, 
             ap.full_legal_name as artisan_name
      FROM jobs j
      JOIN client_profiles cp ON j.client_id = cp.user_id
      JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      WHERE j.id = $1
    `, [jobId]);
    
    const job = jobResult.rows[0];
    
    if (job) {
      // Send notifications
      await NotificationService.sendPaymentConfirmation(
        job.client_id,
        amount / 100,
        jobId
      );
      
      await NotificationService.sendEmail(
        job.client_email,
        'Payment Confirmed',
        `Your payment of ₦${(amount / 100).toLocaleString()} for job #${jobId.slice(0, 8)} has been confirmed.`,
        `<h2>Payment Confirmed</h2>
         <p>Dear ${job.client_name},</p>
         <p>Your payment of <strong>₦${(amount / 100).toLocaleString()}</strong> for job #${jobId.slice(0, 8)} has been confirmed.</p>
         <p>The funds are now held in escrow and will be released to the artisan upon job completion.</p>
         <p>Thank you for using BeaverWorks!</p>`
      );
      
      await NotificationService.sendSMS(
        job.client_phone,
        `BeaverWorks: Payment of ₦${(amount / 100).toLocaleString()} confirmed for job #${jobId.slice(0, 8)}.`
      );
    }
  }
  
  static async handlePaymentIntentFailed(paymentIntent, client) {
    const { metadata, id, last_payment_error } = paymentIntent;
    const { jobId, clientId } = metadata;
    
    logger.warn(`Payment failed for job ${jobId}: ${last_payment_error?.message}`);
    
    await client.query(`
      UPDATE payment_intents 
      SET status = 'failed', 
          failure_reason = $1,
          failed_at = NOW()
      WHERE payment_intent_id = $2
    `, [last_payment_error?.message, id]);
    
    // Get client details for notification
    const clientResult = await client.query(`
      SELECT email, phone, full_legal_name 
      FROM users u
      JOIN client_profiles cp ON u.id = cp.user_id
      WHERE u.id = $1
    `, [clientId]);
    
    if (clientResult.rows[0]) {
      const client = clientResult.rows[0];
      
      await NotificationService.sendEmail(
        client.email,
        'Payment Failed',
        `Your payment for job #${jobId.slice(0, 8)} failed. Please update your payment method and try again.`,
        `<h2>Payment Failed</h2>
         <p>Dear ${client.full_legal_name},</p>
         <p>Your payment for job #${jobId.slice(0, 8)} failed.</p>
         <p>Error: ${last_payment_error?.message}</p>
         <p>Please update your payment method and try again.</p>
         <p><a href="${process.env.APP_FRONTEND_URL}/jobs/${jobId}/payment">Retry Payment</a></p>
         <p>Thank you for using BeaverWorks!</p>`
      );
      
      await NotificationService.sendSMS(
        client.phone,
        `BeaverWorks: Payment for job #${jobId.slice(0, 8)} failed. Please check your payment method.`
      );
    }
  }
  
  static async handlePaymentIntentProcessing(paymentIntent, client) {
    const { metadata, id } = paymentIntent;
    const { jobId, clientId } = metadata;
    
    logger.info(`Payment processing for job ${jobId}`);
    
    await client.query(`
      UPDATE payment_intents 
      SET status = 'processing'
      WHERE payment_intent_id = $1
    `, [id]);
  }
  
  static async handleChargeRefunded(charge, client) {
    const { payment_intent, amount_refunded, id } = charge;
    
    logger.info(`Refund processed for payment intent ${payment_intent}: ${amount_refunded / 100}`);
    
    await client.query(`
      UPDATE refunds 
      SET status = 'completed', 
          transaction_id = $1,
          completed_at = NOW()
      WHERE payment_intent_id = $2 AND status = 'pending'
    `, [id, payment_intent]);
    
    // Update escrow transactions for the job
    const paymentResult = await client.query(`
      SELECT job_id, client_id FROM payment_intents WHERE payment_intent_id = $1
    `, [payment_intent]);
    
    if (paymentResult.rows[0]) {
      const { job_id, client_id } = paymentResult.rows[0];
      
      await client.query(`
        UPDATE escrow_transactions 
        SET status = 'refunded', refunded_at = NOW(), refund_reason = 'charge_refunded'
        WHERE job_id = $1 AND status IN ('held', 'frozen')
      `, [job_id]);
      
      // Notify client
      const clientResult = await client.query(`
        SELECT email, phone, full_legal_name 
        FROM users u
        JOIN client_profiles cp ON u.id = cp.user_id
        WHERE u.id = $1
      `, [client_id]);
      
      if (clientResult.rows[0]) {
        const client = clientResult.rows[0];
        
        await NotificationService.sendEmail(
          client.email,
          'Refund Processed',
          `A refund of ₦${(amount_refunded / 100).toLocaleString()} has been processed for your job.`,
          `<h2>Refund Processed</h2>
           <p>Dear ${client.full_legal_name},</p>
           <p>A refund of <strong>₦${(amount_refunded / 100).toLocaleString()}</strong> has been processed.</p>
           <p>The funds should appear in your account within 5-7 business days.</p>
           <p>Thank you for using BeaverWorks!</p>`
        );
      }
    }
  }
  
  static async handleSubscriptionCreated(subscription, client) {
    const { customer, items, status, id } = subscription;
    const plan = items.data[0]?.plan;
    
    logger.info(`Subscription created for customer ${customer}: ${id}`);
    
    // Find artisan by stripe customer ID
    const artisanResult = await client.query(`
      SELECT user_id FROM artisan_profiles WHERE stripe_customer_id = $1
    `, [customer]);
    
    if (artisanResult.rows[0]) {
      const artisanId = artisanResult.rows[0].user_id;
      
      await client.query(`
        UPDATE artisan_profiles 
        SET monthly_fee_status = 'paid',
            stripe_subscription_id = $1,
            subscription_status = $2,
            last_fee_payment = NOW()
        WHERE user_id = $3
      `, [id, status, artisanId]);
      
      logger.info(`Subscription activated for artisan ${artisanId}`);
    }
  }
  
  static async handleSubscriptionUpdated(subscription, client) {
    const { customer, status, id } = subscription;
    
    logger.info(`Subscription updated for customer ${customer}: ${status}`);
    
    const artisanResult = await client.query(`
      SELECT user_id FROM artisan_profiles WHERE stripe_customer_id = $1
    `, [customer]);
    
    if (artisanResult.rows[0]) {
      const artisanId = artisanResult.rows[0].user_id;
      
      await client.query(`
        UPDATE artisan_profiles 
        SET subscription_status = $1
        WHERE user_id = $2
      `, [status, artisanId]);
      
      if (status === 'past_due' || status === 'unpaid') {
        await client.query(`
          UPDATE artisan_profiles 
          SET monthly_fee_status = 'pending'
          WHERE user_id = $1
        `, [artisanId]);
        
        // Notify artisan
        const artisanUser = await client.query(`
          SELECT email, phone, full_legal_name 
          FROM users u
          JOIN artisan_profiles ap ON u.id = ap.user_id
          WHERE u.id = $1
        `, [artisanId]);
        
        if (artisanUser.rows[0]) {
          const artisan = artisanUser.rows[0];
          
          await NotificationService.sendEmail(
            artisan.email,
            'Subscription Payment Failed',
            `Your monthly technology fee payment failed. Please update your payment method to avoid service interruption.`,
            `<h2>Subscription Payment Failed</h2>
             <p>Dear ${artisan.full_legal_name},</p>
             <p>Your monthly technology fee payment has failed.</p>
             <p>Please update your payment method to avoid service interruption.</p>
             <p><a href="${process.env.APP_FRONTEND_URL}/artisan/subscription">Update Payment Method</a></p>
             <p>Thank you for using BeaverWorks!</p>`
          );
        }
      }
    }
  }
  
  static async handleSubscriptionDeleted(subscription, client) {
    const { customer } = subscription;
    
    logger.info(`Subscription deleted for customer ${customer}`);
    
    const artisanResult = await client.query(`
      SELECT user_id FROM artisan_profiles WHERE stripe_customer_id = $1
    `, [customer]);
    
    if (artisanResult.rows[0]) {
      const artisanId = artisanResult.rows[0].user_id;
      
      await client.query(`
        UPDATE artisan_profiles 
        SET monthly_fee_status = 'pending',
            subscription_status = 'cancelled',
            is_available = false
        WHERE user_id = $1
      `, [artisanId]);
      
      logger.info(`Subscription cancelled for artisan ${artisanId}`);
    }
  }
  
  static async handleInvoicePaymentSucceeded(invoice, client) {
    const { customer, subscription, amount_paid, currency } = invoice;
    
    logger.info(`Invoice payment succeeded for customer ${customer}: ${amount_paid / 100} ${currency.toUpperCase()}`);
    
    const artisanResult = await client.query(`
      SELECT user_id FROM artisan_profiles WHERE stripe_customer_id = $1
    `, [customer]);
    
    if (artisanResult.rows[0]) {
      const artisanId = artisanResult.rows[0].user_id;
      
      await client.query(`
        UPDATE artisan_profiles 
        SET monthly_fee_status = 'paid',
            last_fee_payment = NOW()
        WHERE user_id = $1
      `, [artisanId]);
      
      // Record transaction
      await client.query(`
        INSERT INTO escrow_transactions (artisan_id, amount, transaction_type, status)
        VALUES ($1, $2, 'monthly_fee', 'released')
      `, [artisanId, amount_paid / 100]);
    }
  }
  
  static async handleInvoicePaymentFailed(invoice, client) {
    const { customer, subscription } = invoice;
    
    logger.warn(`Invoice payment failed for customer ${customer}`);
    
    const artisanResult = await client.query(`
      SELECT user_id FROM artisan_profiles WHERE stripe_customer_id = $1
    `, [customer]);
    
    if (artisanResult.rows[0]) {
      const artisanId = artisanResult.rows[0].user_id;
      
      await client.query(`
        UPDATE artisan_profiles 
        SET monthly_fee_status = 'pending'
        WHERE user_id = $1
      `, [artisanId]);
    }
  }
}

module.exports = StripeWebhook;