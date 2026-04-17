const crypto = require('crypto');
const { pool } = require('../config/database');
const { redis } = require('../config/redis');
const { logger } = require('../config/logger');
const NotificationService = require('../services/notification.service');

class FlutterwaveWebhook {
  static async handleWebhook(req, res) {
    const signature = req.headers['verif-hash'];
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
    
    if (signature !== secretHash) {
      logger.error('Flutterwave webhook signature verification failed');
      return res.status(401).send('Unauthorized');
    }
    
    const event = req.body;
    
    // Check if event was already processed
    const eventKey = `flutterwave:webhook:${event.id || event.event}`;
    const processed = await redis.get(eventKey);
    
    if (processed) {
      logger.info(`Flutterwave webhook ${event.event} already processed, skipping`);
      return res.json({ received: true, alreadyProcessed: true });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      logger.info(`Processing Flutterwave webhook: ${event.event}`);
      
      switch (event.event) {
        case 'charge.completed':
          await this.handleChargeCompleted(event.data, client);
          break;
          
        case 'transfer.completed':
          await this.handleTransferCompleted(event.data, client);
          break;
          
        case 'subscription.charged':
          await this.handleSubscriptionCharged(event.data, client);
          break;
          
        case 'subscription.cancelled':
          await this.handleSubscriptionCancelled(event.data, client);
          break;
          
        case 'refund.completed':
          await this.handleRefundCompleted(event.data, client);
          break;
          
        default:
          logger.info(`Unhandled Flutterwave event type: ${event.event}`);
      }
      
      // Mark event as processed
      await redis.setex(eventKey, 86400, 'processed');
      await redis.setex(`webhook:flutterwave:last`, 3600, new Date().toISOString());
      
      await client.query('COMMIT');
      res.sendStatus(200);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Flutterwave webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    } finally {
      client.release();
    }
  }
  
  static async handleChargeCompleted(data, client) {
    const { tx_ref, flw_ref, amount, currency, status, customer, meta } = data;
    
    if (status !== 'successful') {
      logger.info(`Flutterwave charge not successful: ${tx_ref} - ${status}`);
      return;
    }
    
    const { jobId, clientId } = meta || {};
    
    if (!jobId || !clientId) {
      logger.warn('Flutterwave charge completed missing metadata', { tx_ref });
      return;
    }
    
    logger.info(`Flutterwave charge successful for job ${jobId}: ${amount} ${currency}`);
    
    // Update payment intent status
    await client.query(`
      UPDATE payment_intents 
      SET status = 'succeeded', 
          paid_at = NOW(),
          flutterwave_reference = $1,
          flutterwave_transaction_id = $2
      WHERE job_id = $3 AND client_id = $4 AND status = 'pending'
    `, [tx_ref, flw_ref, jobId, clientId]);
    
    // Move funds to escrow
    await client.query(`
      INSERT INTO escrow_transactions (job_id, client_id, amount, transaction_type, status, dispute_buffer_until)
      VALUES ($1, $2, $3, 'full_payment', 'held', NOW() + INTERVAL '3 days')
    `, [jobId, clientId, amount]);
    
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
      SELECT j.*, cp.email as client_email, cp.full_legal_name as client_name
      FROM jobs j
      JOIN client_profiles cp ON j.client_id = cp.user_id
      WHERE j.id = $1
    `, [jobId]);
    
    if (jobResult.rows[0]) {
      const job = jobResult.rows[0];
      
      await NotificationService.sendEmail(
        job.client_email,
        'Payment Confirmed',
        `Your payment of ₦${amount.toLocaleString()} for job #${jobId.slice(0, 8)} has been confirmed.`,
        `<h2>Payment Confirmed</h2>
         <p>Dear ${job.client_name},</p>
         <p>Your payment of <strong>₦${amount.toLocaleString()}</strong> for job #${jobId.slice(0, 8)} has been confirmed.</p>
         <p>Thank you for using BeaverWorks!</p>`
      );
    }
  }
  
  static async handleTransferCompleted(data, client) {
    const { reference, amount, currency, status, destination } = data;
    
    if (status !== 'successful') {
      logger.warn(`Flutterwave transfer not successful: ${reference} - ${status}`);
      return;
    }
    
    logger.info(`Flutterwave transfer completed: ${reference} for amount ${amount} ${currency}`);
    
    await client.query(`
      UPDATE artisan_payouts 
      SET status = 'completed', 
          flutterwave_reference = $1,
          completed_at = NOW()
      WHERE transfer_reference = $2 AND status = 'processing'
    `, [reference, reference]);
    
    // Update withdrawal status
    await client.query(`
      UPDATE withdrawals 
      SET status = 'completed', 
          flutterwave_reference = $1,
          completed_at = NOW()
      WHERE transfer_reference = $2
    `, [reference, reference]);
  }
  
  static async handleSubscriptionCharged(data, client) {
    const { id, amount, currency, customer, status } = data;
    
    logger.info(`Flutterwave subscription charged: ${id} for amount ${amount} ${currency}`);
    
    if (status === 'successful') {
      // Find artisan by flutterwave customer ID
      const artisanResult = await client.query(`
        SELECT user_id FROM artisan_profiles WHERE flutterwave_customer_id = $1
      `, [customer.id]);
      
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
        `, [artisanId, amount]);
        
        logger.info(`Monthly fee paid for artisan ${artisanId}: ₦${amount}`);
      }
    } else {
      logger.warn(`Flutterwave subscription charge failed: ${id} - ${status}`);
      
      // Find artisan by flutterwave customer ID
      const artisanResult = await client.query(`
        SELECT user_id FROM artisan_profiles WHERE flutterwave_customer_id = $1
      `, [customer.id]);
      
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
  
  static async handleSubscriptionCancelled(data, client) {
    const { id, customer } = data;
    
    logger.info(`Flutterwave subscription cancelled: ${id}`);
    
    const artisanResult = await client.query(`
      SELECT user_id FROM artisan_profiles WHERE flutterwave_customer_id = $1
    `, [customer.id]);
    
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
  
  static async handleRefundCompleted(data, client) {
    const { id, transaction_id, amount, currency, status } = data;
    
    logger.info(`Flutterwave refund completed: ${id} for amount ${amount} ${currency}`);
    
    await client.query(`
      UPDATE refunds 
      SET status = 'completed', 
          flutterwave_reference = $1,
          completed_at = NOW()
      WHERE flutterwave_transaction_id = $2 AND status = 'pending'
    `, [id, transaction_id]);
    
    // Update escrow transactions
    const refundResult = await client.query(`
      SELECT job_id FROM refunds WHERE flutterwave_reference = $1
    `, [id]);
    
    if (refundResult.rows[0]) {
      const { job_id } = refundResult.rows[0];
      
      await client.query(`
        UPDATE escrow_transactions 
        SET status = 'refunded', refunded_at = NOW(), refund_reason = 'flutterwave_refund'
        WHERE job_id = $1 AND status IN ('held', 'frozen')
      `, [job_id]);
    }
  }
}

module.exports = FlutterwaveWebhook;