const crypto = require('crypto');
const { pool } = require('../config/database');
const { redis } = require('../config/redis');
const { logger } = require('../config/logger');
const NotificationService = require('../services/notification.service');

class PaystackWebhook {
  static async handleWebhook(req, res) {
    const signature = req.headers['x-paystack-signature'];
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    
    // Verify signature
    const hash = crypto.createHmac('sha512', secretKey)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (hash !== signature) {
      logger.error('Paystack webhook signature verification failed');
      return res.status(401).send('Unauthorized');
    }
    
    const event = req.body;
    
    // Check if event was already processed
    const eventKey = `paystack:webhook:${event.data?.id || event.event}`;
    const processed = await redis.get(eventKey);
    
    if (processed) {
      logger.info(`Paystack webhook ${event.event} already processed, skipping`);
      return res.json({ received: true, alreadyProcessed: true });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      logger.info(`Processing Paystack webhook: ${event.event}`);
      
      switch (event.event) {
        case 'charge.success':
          await this.handleChargeSuccess(event.data, client);
          break;
          
        case 'charge.dispute.create':
          await this.handleDisputeCreated(event.data, client);
          break;
          
        case 'charge.dispute.resolve':
          await this.handleDisputeResolved(event.data, client);
          break;
          
        case 'transfer.success':
          await this.handleTransferSuccess(event.data, client);
          break;
          
        case 'transfer.failed':
          await this.handleTransferFailed(event.data, client);
          break;
          
        case 'subscription.create':
          await this.handleSubscriptionCreated(event.data, client);
          break;
          
        case 'subscription.disable':
          await this.handleSubscriptionDisabled(event.data, client);
          break;
          
        default:
          logger.info(`Unhandled Paystack event type: ${event.event}`);
      }
      
      // Mark event as processed
      await redis.setex(eventKey, 86400, 'processed');
      await redis.setex(`webhook:paystack:last`, 3600, new Date().toISOString());
      
      await client.query('COMMIT');
      res.sendStatus(200);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Paystack webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    } finally {
      client.release();
    }
  }
  
  static async handleChargeSuccess(data, client) {
    const { reference, amount, currency, metadata, customer, status } = data;
    const { jobId, clientId } = metadata || {};
    
    if (!jobId || !clientId) {
      logger.warn('Paystack charge success missing metadata', { reference });
      return;
    }
    
    logger.info(`Paystack charge successful for job ${jobId}: ${amount / 100} ${currency}`);
    
    // Update payment intent status
    await client.query(`
      UPDATE payment_intents 
      SET status = 'succeeded', 
          paid_at = NOW(),
          paystack_reference = $1
      WHERE job_id = $2 AND client_id = $3 AND status = 'pending'
    `, [reference, jobId, clientId]);
    
    // Move funds to escrow
    await client.query(`
      INSERT INTO escrow_transactions (job_id, client_id, amount, transaction_type, status, dispute_buffer_until)
      VALUES ($1, $2, $3, 'full_payment', 'held', NOW() + INTERVAL '3 days')
    `, [jobId, clientId, amount / 100]);
    
    // Release base fee immediately
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
    
    // Update job billing
    await client.query(`
      UPDATE job_billing 
      SET billing_status = 'paid', paid_at = NOW()
      WHERE job_id = $1
    `, [jobId]);
    
    // Send notifications
    const jobResult = await client.query(`
      SELECT j.*, cp.email as client_email, cp.full_legal_name as client_name,
             cp.phone as client_phone
      FROM jobs j
      JOIN client_profiles cp ON j.client_id = cp.user_id
      WHERE j.id = $1
    `, [jobId]);
    
    if (jobResult.rows[0]) {
      const job = jobResult.rows[0];
      
      await NotificationService.sendEmail(
        job.client_email,
        'Payment Confirmed',
        `Your payment of ₦${(amount / 100).toLocaleString()} for job #${jobId.slice(0, 8)} has been confirmed.`,
        `<h2>Payment Confirmed</h2>
         <p>Dear ${job.client_name},</p>
         <p>Your payment of <strong>₦${(amount / 100).toLocaleString()}</strong> for job #${jobId.slice(0, 8)} has been confirmed.</p>
         <p>Thank you for using BeaverWorks!</p>`
      );
    }
  }
  
  static async handleDisputeCreated(data, client) {
    const { transaction, reason, id } = data;
    const { reference } = transaction;
    
    logger.info(`Paystack dispute created for transaction ${reference}: ${reason}`);
    
    const paymentResult = await client.query(`
      SELECT job_id, client_id FROM payment_intents WHERE paystack_reference = $1
    `, [reference]);
    
    if (paymentResult.rows[0]) {
      const { job_id, client_id } = paymentResult.rows[0];
      
      // Create dispute record
      await client.query(`
        INSERT INTO disputes (job_id, client_id, reason, description, status, external_reference)
        VALUES ($1, $2, $3, $4, 'pending', $5)
      `, [job_id, client_id, 'payment_dispute', `Paystack dispute created: ${reason}`, id]);
      
      // Freeze escrow funds
      await client.query(`
        UPDATE escrow_transactions 
        SET status = 'frozen', frozen_at = NOW(), freeze_reason = 'payment_dispute'
        WHERE job_id = $1 AND status = 'held'
      `, [job_id]);
      
      logger.info(`Dispute ${id} created for job ${job_id}`);
    }
  }
  
  static async handleDisputeResolved(data, client) {
    const { transaction, resolution, id } = data;
    const { reference } = transaction;
    
    logger.info(`Paystack dispute resolved for transaction ${reference}: ${resolution}`);
    
    const paymentResult = await client.query(`
      SELECT job_id FROM payment_intents WHERE paystack_reference = $1
    `, [reference]);
    
    if (paymentResult.rows[0]) {
      const { job_id } = paymentResult.rows[0];
      
      await client.query(`
        UPDATE disputes 
        SET status = 'resolved', 
            resolution = $1, 
            resolved_at = NOW(),
            external_resolution = $2
        WHERE job_id = $3 AND status = 'pending'
      `, [resolution, id, job_id]);
      
      if (resolution === 'merchant_credited') {
        // Release funds to artisan
        await client.query(`
          UPDATE escrow_transactions 
          SET status = 'released', release_date = NOW(), release_reason = 'dispute_resolved'
          WHERE job_id = $1 AND status = 'frozen'
        `, [job_id]);
        
        logger.info(`Funds released for job ${job_id} after dispute resolution`);
      } else if (resolution === 'customer_credited') {
        // Refund client
        await client.query(`
          UPDATE escrow_transactions 
          SET status = 'refunded', refunded_at = NOW(), refund_reason = 'dispute_resolved'
          WHERE job_id = $1 AND status = 'frozen'
        `, [job_id]);
        
        logger.info(`Refund processed for job ${job_id} after dispute resolution`);
      }
    }
  }
  
  static async handleTransferSuccess(data, client) {
    const { reference, amount, currency, recipient, transfer_code } = data;
    
    logger.info(`Paystack transfer successful: ${reference} for amount ${amount / 100} ${currency}`);
    
    await client.query(`
      UPDATE artisan_payouts 
      SET status = 'completed', 
          transfer_reference = $1,
          completed_at = NOW()
      WHERE transfer_reference = $2 AND status = 'processing'
    `, [transfer_code, reference]);
    
    // Update withdrawal status
    await client.query(`
      UPDATE withdrawals 
      SET status = 'completed', 
          transfer_reference = $1,
          completed_at = NOW()
      WHERE transfer_reference = $2
    `, [transfer_code, reference]);
  }
  
  static async handleTransferFailed(data, client) {
    const { reference, reason, transfer_code } = data;
    
    logger.error(`Paystack transfer failed: ${reference} - ${reason}`);
    
    await client.query(`
      UPDATE artisan_payouts 
      SET status = 'failed', 
          failure_reason = $1,
          failed_at = NOW()
      WHERE transfer_reference = $2 AND status = 'processing'
    `, [reason, reference]);
    
    // Update withdrawal status
    await client.query(`
      UPDATE withdrawals 
      SET status = 'failed', 
          failure_reason = $1,
          failed_at = NOW()
      WHERE transfer_reference = $2
    `, [reason, reference]);
    
    // Get artisan details for notification
    const payoutResult = await client.query(`
      SELECT artisan_id, amount FROM artisan_payouts WHERE transfer_reference = $1
    `, [reference]);
    
    if (payoutResult.rows[0]) {
      const { artisan_id, amount } = payoutResult.rows[0];
      
      const artisanResult = await client.query(`
        SELECT email, phone, full_legal_name 
        FROM users u
        JOIN artisan_profiles ap ON u.id = ap.user_id
        WHERE u.id = $1
      `, [artisan_id]);
      
      if (artisanResult.rows[0]) {
        const artisan = artisanResult.rows[0];
        
        await NotificationService.sendEmail(
          artisan.email,
          'Withdrawal Failed',
          `Your withdrawal of ₦${(amount / 100).toLocaleString()} failed. Please check your bank details.`,
          `<h2>Withdrawal Failed</h2>
           <p>Dear ${artisan.full_legal_name},</p>
           <p>Your withdrawal of <strong>₦${(amount / 100).toLocaleString()}</strong> failed.</p>
           <p>Reason: ${reason}</p>
           <p>Please update your bank details and try again.</p>
           <p><a href="${process.env.APP_FRONTEND_URL}/artisan/bank-details">Update Bank Details</a></p>
           <p>Thank you for using BeaverWorks!</p>`
        );
      }
    }
  }
  
  static async handleSubscriptionCreated(data, client) {
    const { customer, subscription_code, plan } = data;
    
    logger.info(`Paystack subscription created for customer ${customer}: ${subscription_code}`);
    
    // Find artisan by paystack customer code
    const artisanResult = await client.query(`
      SELECT user_id FROM artisan_profiles WHERE paystack_customer_code = $1
    `, [customer]);
    
    if (artisanResult.rows[0]) {
      const artisanId = artisanResult.rows[0].user_id;
      
      await client.query(`
        UPDATE artisan_profiles 
        SET monthly_fee_status = 'paid',
            paystack_subscription_code = $1,
            subscription_status = 'active',
            last_fee_payment = NOW()
        WHERE user_id = $2
      `, [subscription_code, artisanId]);
      
      logger.info(`Subscription activated for artisan ${artisanId}`);
    }
  }
  
  static async handleSubscriptionDisabled(data, client) {
    const { subscription_code } = data;
    
    logger.info(`Paystack subscription disabled: ${subscription_code}`);
    
    const artisanResult = await client.query(`
      SELECT user_id FROM artisan_profiles WHERE paystack_subscription_code = $1
    `, [subscription_code]);
    
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
}

module.exports = PaystackWebhook;