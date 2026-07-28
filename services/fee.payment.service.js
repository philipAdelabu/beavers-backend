const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');

// Paystack API configuration
let PAYSTACK_SECRET_KEY; 
let PAYSTACK_BASE_URL;
if(process.env.NODE_ENV === 'production'){
    PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    PAYSTACK_BASE_URL = 'https://api.paystack.co';

}else{
    PAYSTACK_SECRET_KEY = process.env.PAYSTACK_TEST_SECRET_KEY;
    PAYSTACK_BASE_URL = 'https://api.paystack.co';
}
const paystackAxios = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

class PaymentService {
  /**
   * Initialize payment for a job
   * @param {string} jobId - Job ID
   * @param {string} clientId - Client ID
   * @param {string} email - Client email
   * @returns {Promise<Object>} Payment authorization URL
   */
  static async initializePayment(refId, amount, userId, email, customFields) {
     
    try {
      // Get job billing details
       const totalAmount = parseFloat(amount).toFixed(2);
      if (totalAmount <= 0) {
        throw new AppError(400, 'Invalid payment amount');
       }

      // Create unique reference
      const reference = this.generateReference(refId);

      // Prepare Paystack initialization data
      const paystackData = {
        amount: Math.round(totalAmount * 100), // Convert to kobo
        currency: 'NGN',
        email,
        reference,
        metadata: {
          ref_id: refId,
          custom_fields: customFields,
        },
        callback_url: `${process.env.APP_FRONTEND_URL}/payment/verify?refId=${refId}`,
        channels: ['card', 'bank_transfer', 'ussd', 'qr', 'mobile_money', 'bank']
      };
      
      // Call Paystack API
      const response = await paystackAxios.post('/transaction/initialize', paystackData);
      
      if (!response.data.status) {
        throw new AppError(400, response.data.message || 'Failed to initialize payment');
      }
      
      // Store payment intent in database
      const metadata = response.data.data;
      logger.info(`Paystack initialization response for ref_id ${refId}:`, response.data);

      return {
        authorizationUrl: metadata.authorization_url,
        reference: metadata.reference,
        payment_intent_id: metadata.reference,
        access_code: metadata.access_code,
        amount: totalAmount,
        currency: 'NGN',
        metadata,
      };
    } catch (error) {
      throw new AppError(500, error.response?.data?.message || error.message || 'Failed to initialize payment');
    }
  }

   static async verifyPayment(reference, userId) {
    const client = await pool.connect();
    
    try {
      // Verify with Paystack
      const response = await paystackAxios.get(`/transaction/verify/${reference}`);
      
      if (!response.data.status) {
        throw new AppError(400, response.data.message || 'Verification failed');
      }
      
      const transaction = response.data.data;
      
      if (transaction.status === 'success') {
            await client.query(
             `UPDATE fee_payment_intents 
               SET status = 'succeeded', 
               paid_at = NOW(),
               metadata = $1 
           WHERE payment_intent_id = $2`,
          [transaction, reference]
        );
    
        logger.info(`Payment verified successfully for ref. ${reference}: ₦${transaction.amount / 100}`);
        
        return {
          status: 'succeeded',
          amount: transaction.amount / 100,
          reference,
          message: 'Payment verified successfully',
          user_id: userId,
        };
      } else {

            await client.query(
             `UPDATE fee_payment_intents 
               SET status = 'failed', 
               failure_reason = $1
              WHERE payment_intent_id = $2`,
          [transaction.gateway.response, reference]
        );
       
        return {
          status: 'failed',
          message: transaction.gateway_response || 'Payment failed'
        };
      }
    } catch (error) {
  
      logger.error('Payment verification error:', error);
      throw new AppError(500, error.response?.data?.message || error.message || 'Failed to verify payment');
    } finally {
      client.release();
    }
  }

  static async getPaymentIntent(refId, userId) {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `SELECT payment_reference as ref_id, artisan_id as user_id, payment_intent_id, 
        client_secret as user_secret, amount, currency, status, metadata, 
        status, failure_reason, paid_at, failed_at, created_at, updated_at  
        FROM fee_payment_intents WHERE payment_reference = $1 AND client_id = $2`,
        [refId, userId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Payment intent not found');
      }
      
      return result.rows;
    } catch (error) {
      throw new AppError(500, error.message || 'Failed to retrieve payment intent');
    } finally {
      client.release();
    }
  }

  static async getPaymentStatus(paymentIntentId) { 
    const client = await pool.connect();
      try {
      const result = await client.query(
        `SELECT payment_reference as ref_id, status, amount, 
        currency, metadata  FROM fee_payment_intents WHERE payment_intent_id = $1`,
        [paymentIntentId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Payment intent not found');
      }
      
      return result.rows[0];
    } catch (error) {
      throw new AppError(500, error.message || 'Failed to retrieve payment status');
    } finally {
      client.release();
    }
  }
 

 
  
  /**
   * Generate unique transaction reference
   * @param {string} jobId - Job ID
   * @returns {string} Unique reference
   */
  static generateReference(refId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `BW-${refId.slice(0, 8)}-${timestamp}-${random}`;
  }
  

  static async createRefund(jobId, clientId, amount, reason) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get payment intent
      const paymentResult = await client.query(
        `SELECT paystack_reference, amount, paystack_transaction_id
         FROM payment_intents 
         WHERE job_id = $1 AND client_id = $2 AND status = 'succeeded'`,
        [jobId, clientId]
      );
      
      if (paymentResult.rows.length === 0) {
        throw new AppError(404, 'Payment not found');
      }
      
      const payment = paymentResult.rows[0];
      
      if (amount > payment.amount) {
        throw new AppError(400, 'Refund amount exceeds payment amount');
      }
      
      // Create refund record
      const refundResult = await client.query(
        `INSERT INTO refunds (job_id, paystack_reference, amount, reason, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *`,
        [jobId, payment.paystack_reference, amount, reason]
      );
      
      // Process refund with Paystack
      const refundData = {
        transaction: payment.paystack_reference,
        amount: Math.round(amount * 100),
        currency: 'NGN',
        merchant_note: reason,
        customer_note: `Refund for job ${jobId}: ${reason}`
      };
      
      const response = await paystackAxios.post('/refund', refundData);
      
      if (!response.data.status) {
        throw new AppError(400, response.data.message || 'Refund failed');
      }
      
      await client.query(
        `UPDATE refunds 
         SET refund_id = $1, status = 'processing'
         WHERE id = $2`,
        [response.data.data.id, refundResult.rows[0].id]
      );
      
      // Update escrow
      await client.query(
        `UPDATE escrow_transactions 
         SET status = 'refunded', refunded_at = NOW()
         WHERE job_id = $1 AND status = 'held'`,
        [jobId]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Refund created for job ${jobId}: ₦${amount}`);
      
      return refundResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Refund error:', error);
      throw new AppError(500, error.response?.data?.message || error.message || 'Failed to process refund');
    } finally {
      client.release();
    }
  }
  
  /**
   * Get transaction history
   * @param {string} userId - User ID
   * @param {string} userType - User type (client/artisan)
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Transaction history
   */
  static async getTransactionHistory(userId, userType, filters = {}) {
    const { page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query;
    let params;
    
    if (userType === 'client') {
      query = `
        SELECT pi.amount, pi.status, pi.created_at, pi.payment_intent_id, pi.client_id,
        pi.currency, j.category, j.service_type, j.job_status, j.artisan_id
        FROM payment_intents pi
        JOIN jobs j ON pi.job_id = j.id
        WHERE j.client_id = $1
        ORDER BY pi.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [userId, limit, offset];
    } else if (userType === 'artisan') {
      query = `
        SELECT ap.*,
         j.category, j.service_type, j.job_status
        FROM artisan_payouts ap
        JOIN jobs j ON ap.job_id = j.id
        WHERE j.artisan_id = $1
        ORDER BY ap.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [userId, limit, offset];
    } else {
      query = `
        SELECT pi.*, j.category, j.service_type
        FROM payment_intents pi
        JOIN jobs j ON pi.job_id = j.id
        ORDER BY pi.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }
    
    const result = await pool.query(query, params);
    
    const countQuery = userType === 'client'
      ? `SELECT COUNT(*) FROM payment_intents pi JOIN jobs j ON pi.job_id = j.id WHERE j.client_id = $1`
      : userType === 'artisan'
        ? `SELECT COUNT(*) FROM artisan_payouts ap JOIN jobs j ON ap.job_id = j.id WHERE j.artisan_id = $1`
        : `SELECT COUNT(*) FROM payment_intents`;
    
    const countParams = userType !== 'admin' ? [userId] : [];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  /**
   * Get payment summary for user
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @returns {Promise<Object>} Payment summary
   */
  static async getPaymentSummary(userId, userType) {
    if (userType === 'client') {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_payments,
          SUM(amount) as total_amount,
          AVG(amount) as average_amount,
          COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as successful_payments,
          SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as total_successful_amount
        FROM payment_intents pi
        JOIN jobs j ON pi.job_id = j.id
        WHERE j.client_id = $1
      `, [userId]);
      
      return result.rows[0];
    } else if (userType === 'artisan') {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_payouts,
          SUM(amount) as total_earned,
          AVG(amount) as average_payout,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payouts
        FROM artisan_payouts ap
        JOIN jobs j ON ap.job_id = j.id
        WHERE j.artisan_id = $1
      `, [userId]);
      
      return result.rows[0];
    }
    
    return null;
  }
  
  /**
   * Webhook handler for Paystack events
   * @param {Object} payload - Webhook payload
   * @param {string} signature - Paystack signature header
   * @returns {Promise<void>}
   */
  static async handleWebhook(payload, signature) {
    // Verify signature
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    if (hash !== signature) {
      throw new AppError(401, 'Invalid webhook signature');
    }
    
    const event = payload;
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
          
        case 'refund.processed':
          await this.handleRefundProcessed(event.data, client);
          break;
          
        case 'transfer.success':
          await this.handleTransferSuccess(event.data, client);
          break;
          
        case 'transfer.failed':
          await this.handleTransferFailed(event.data, client);
          break;
          
        default:
          logger.info(`Unhandled Paystack event type: ${event.event}`);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Paystack webhook processing error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Handle successful charge webhook
   * @param {Object} data - Webhook data
   * @param {Object} client - Database client
   * @returns {Promise<void>}
   */
  static async handleChargeSuccess(data, client) {
    const { reference, amount, currency, metadata } = data;
    const { job_id, client_id } = metadata;
    
    // Update payment intent status
    await client.query(
      `UPDATE payment_intents 
       SET status = 'succeeded', 
           paid_at = NOW(),
           paystack_transaction_id = $1
       WHERE paystack_reference = $2`,
      [data.id, reference]
    );
    
    // Move funds to escrow
    await client.query(
      `INSERT INTO escrow_transactions (job_id, client_id, amount, transaction_type, status, dispute_buffer_until)
       VALUES ($1, $2, $3, 'full_payment', 'held', NOW() + INTERVAL '3 days')`,
      [job_id, client_id, amount / 100]
    );
    
    // Release base fee immediately
    await client.query(
      `UPDATE escrow_transactions 
       SET status = 'released', release_date = NOW()
       WHERE job_id = $1 AND transaction_type = 'base_fee'`,
      [job_id]
    );
    
    // Release materials cost immediately
    await client.query(
      `UPDATE escrow_transactions 
       SET status = 'released', release_date = NOW()
       WHERE job_id = $1 AND transaction_type = 'materials'`,
      [job_id]
    );
    
    // Update job billing
    await client.query(
      `UPDATE job_billing 
       SET billing_status = 'paid', paid_at = NOW()
       WHERE job_id = $1`,
      [job_id]
    );
    
    logger.info(`Charge success webhook processed for job ${job_id}: ₦${amount / 100}`);
  }
  
  /**
   * Handle dispute created webhook
   * @param {Object} data - Webhook data
   * @param {Object} client - Database client
   * @returns {Promise<void>}
   */
  static async handleDisputeCreated(data, client) {
    const { transaction, reason, id } = data;
    const { reference } = transaction;
    
    const paymentResult = await client.query(
      `SELECT job_id, client_id FROM payment_intents WHERE paystack_reference = $1`,
      [reference]
    );
    
    if (paymentResult.rows[0]) {
      const { job_id, client_id } = paymentResult.rows[0];
      
      await client.query(
        `INSERT INTO disputes (job_id, client_id, reason, description, status, external_reference)
         VALUES ($1, $2, $3, $4, 'pending', $5)`,
        [job_id, client_id, 'payment_dispute', `Paystack dispute created: ${reason}`, id]
      );
      
      // Freeze escrow funds
      await client.query(
        `UPDATE escrow_transactions 
         SET status = 'frozen', frozen_at = NOW(), freeze_reason = 'payment_dispute'
         WHERE job_id = $1 AND status = 'held'`,
        [job_id]
      );
      
      logger.info(`Dispute created for job ${job_id}: ${reason}`);
    }
  }
  
  /**
   * Handle dispute resolved webhook
   * @param {Object} data - Webhook data
   * @param {Object} client - Database client
   * @returns {Promise<void>}
   */
  static async handleDisputeResolved(data, client) {
    const { transaction, resolution, id } = data;
    const { reference } = transaction;
    
    const paymentResult = await client.query(
      `SELECT job_id FROM payment_intents WHERE paystack_reference = $1`,
      [reference]
    );
    
    if (paymentResult.rows[0]) {
      const { job_id } = paymentResult.rows[0];
      
      await client.query(
        `UPDATE disputes 
         SET status = 'resolved', 
             resolution = $1, 
             resolved_at = NOW(),
             external_resolution = $2
         WHERE job_id = $3 AND status = 'pending'`,
        [resolution, id, job_id]
      );
      
      if (resolution === 'merchant_credited') {
        // Release funds to artisan
        await client.query(
          `UPDATE escrow_transactions 
           SET status = 'released', release_date = NOW(), release_reason = 'dispute_resolved'
           WHERE job_id = $1 AND status = 'frozen'`,
          [job_id]
        );
      } else if (resolution === 'customer_credited') {
        // Refund client
        await client.query(
          `UPDATE escrow_transactions 
           SET status = 'refunded', refunded_at = NOW(), refund_reason = 'dispute_resolved'
           WHERE job_id = $1 AND status = 'frozen'`,
          [job_id]
        );
      }
      
      logger.info(`Dispute resolved for job ${job_id}: ${resolution}`);
    }
  }
  
  /**
   * Handle refund processed webhook
   * @param {Object} data - Webhook data
   * @param {Object} client - Database client
   * @returns {Promise<void>}
   */
  static async handleRefundProcessed(data, client) {
    const { transaction, amount, id } = data;
    const { reference } = transaction;
    
    await client.query(
      `UPDATE refunds 
       SET status = 'completed', 
           refund_id = $1,
           completed_at = NOW()
       WHERE paystack_reference = $2 AND status = 'processing'`,
      [id, reference]
    );
    
    logger.info(`Refund processed: ${id} for amount ₦${amount / 100}`);
  }
  
  /**
   * Handle transfer success webhook
   * @param {Object} data - Webhook data
   * @param {Object} client - Database client
   * @returns {Promise<void>}
   */
  static async handleTransferSuccess(data, client) {
    const { reference, amount, currency, recipient } = data;
    
    await client.query(
      `UPDATE artisan_payouts 
       SET status = 'completed', 
           transfer_reference = $1,
           completed_at = NOW()
       WHERE transfer_reference = $2 AND status = 'processing'`,
      [reference, reference]
    );
    
    // Update withdrawal status
    await client.query(
      `UPDATE withdrawals 
       SET status = 'completed', 
           transfer_reference = $1,
           completed_at = NOW()
       WHERE transfer_reference = $2`,
      [reference, reference]
    );
    
    logger.info(`Transfer successful: ${reference} for amount ₦${amount / 100}`);
  }
  
  /**
   * Handle transfer failed webhook
   * @param {Object} data - Webhook data
   * @param {Object} client - Database client
   * @returns {Promise<void>}
   */
  static async handleTransferFailed(data, client) {
    const { reference, reason } = data;
    
    await client.query(
      `UPDATE artisan_payouts 
       SET status = 'failed', 
           failure_reason = $1,
           failed_at = NOW()
       WHERE transfer_reference = $2 AND status = 'processing'`,
      [reason, reference]
    );
    
    // Update withdrawal status
    await client.query(
      `UPDATE withdrawals 
       SET status = 'failed', 
           failure_reason = $1,
           failed_at = NOW()
       WHERE transfer_reference = $2`,
      [reason, reference]
    );
    
    logger.error(`Transfer failed: ${reference} - ${reason}`);
  }
  
  /**
   * Release funds to artisan
   * @param {string} jobId - Job ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Payout result
   */
  static async releaseFundsToArtisan(jobId, adminId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if dispute buffer has passed
      const bufferCheck = await client.query(
        `SELECT COUNT(*) as held_count
         FROM escrow_transactions
         WHERE job_id = $1 AND status = 'held' AND dispute_buffer_until > NOW()`,
        [jobId]
      );
      
      if (parseInt(bufferCheck.rows[0].held_count) > 0) {
        throw new AppError(400, 'Cannot release funds: Dispute buffer still active');
      }
      
      // Get workmanship amount
      const billingResult = await client.query(
        `SELECT workmanship_cost FROM job_billing WHERE job_id = $1`,
        [jobId]
      );
      
      const workmanshipAmount = billingResult.rows[0]?.workmanship_cost || 0;
      
      if (workmanshipAmount <= 0) {
        throw new AppError(400, 'No workmanship funds to release');
      }
      
      // Release workmanship payment
      await client.query(
        `UPDATE escrow_transactions 
         SET status = 'released', release_date = NOW(), released_by_admin = $1
         WHERE job_id = $2 AND transaction_type IN ('workmanship', 'execution_fee')`,
        [adminId, jobId]
      );
      
      // Create payout record
      const payoutResult = await client.query(
        `INSERT INTO artisan_payouts (job_id, artisan_id, amount, status)
         SELECT $1, artisan_id, workmanship_cost, 'pending'
         FROM jobs j
         JOIN job_billing jb ON j.id = jb.job_id
         WHERE j.id = $1
         RETURNING *`,
        [jobId]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Funds released to artisan for job ${jobId}: ₦${workmanshipAmount}`);
      
      return payoutResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Release funds error:', error);
      throw new AppError(500, error.message || 'Failed to release funds');
    } finally {
      client.release();
    }
  }


  static async getPaymentMethods(clientId) {
      const cacheKey = `payment:methods:${clientId}`;
      let methods = await cacheGet(cacheKey);
      
      if (!methods) {
        const result = await pool.query(
          `SELECT * FROM payment_methods 
           WHERE client_id = $1 
           ORDER BY is_default DESC, created_at DESC`,
          [clientId]
        );
        
        methods = result.rows;
        await cacheSet(cacheKey, methods, 3600);
      }
      
      return methods;
    }
    
    static async addPaymentMethod(clientId, paymentMethodId, setAsDefault = false) {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Retrieve payment method from Stripe
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        
        if (setAsDefault) {
          await client.query(
            `UPDATE payment_methods SET is_default = false WHERE client_id = $1`,
            [clientId]
          );
        }
        
        const result = await client.query(
          `INSERT INTO payment_methods 
           (client_id, payment_method_id, type, last4, expiry_month, expiry_year, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            clientId, 
            paymentMethodId, 
            paymentMethod.type,
            paymentMethod.card?.last4,
            paymentMethod.card?.exp_month,
            paymentMethod.card?.exp_year,
            setAsDefault
          ]
        );
        
      
        
        await client.query('COMMIT');
        
        await cacheDel(`payment:methods:${clientId}`);
        
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    
    static async deletePaymentMethod(methodId, clientId) {
      const result = await pool.query(
        `DELETE FROM payment_methods 
         WHERE id = $1 AND client_id = $2
         RETURNING *`,
        [methodId, clientId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Payment method not found');
      }
      

      await cacheDel(`payment:methods:${clientId}`);
      
      return result.rows[0];
    }
    
    static async setDefaultPaymentMethod(methodId, clientId) {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        await client.query(
          `UPDATE payment_methods SET is_default = false WHERE client_id = $1`,
          [clientId]
        );
        
        const result = await client.query(
          `UPDATE payment_methods 
           SET is_default = true 
           WHERE id = $1 AND client_id = $2
           RETURNING *`,
          [methodId, clientId]
        );
        
        if (result.rows.length === 0) {
          throw new AppError(404, 'Payment method not found');
        }
        
        await client.query('COMMIT');
        
        await cacheDel(`payment:methods:${clientId}`);
        
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  
    


}

module.exports = PaymentService;