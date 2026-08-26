const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { redis, cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');
const BillingService = require('./billing.service');
const EscrowService = require('./escrow.service');
const {PRICING, TIMEOUTS, GEOFENCE, SYSTEM_FEES } = require('../config/constants');
const SysConfig = require('../config/syst-config');
const SystemWalletService = require('./system-wallet.service');




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






    static async getJobBilling(jobId){
      try{
      const jobBilling = await BillingService.calculateJobCost(jobId);
      return jobBilling;
      }catch(error){
        throw error;
      }
    }

  /**
   * Initialize payment for a job
   * @param {string} jobId - Job ID
   * @param {string} clientId - Client ID
   * @param {string} email - Client email
   * @returns {Promise<Object>} Payment authorization URL
   */
  static async initializePayment(jobId, amount, clientId, email) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      // Get job billing details
      const billingResult = await client.query(
        `SELECT jb.*, j.client_id, j.artisan_id, j.category, j.description, j.billing_mode
         FROM job_billing jb
         JOIN jobs j ON jb.job_id = j.id
         WHERE jb.job_id = $1 AND j.client_id = $2`,
        [jobId, clientId]
      ); 
      
      if (billingResult.rows.length === 0) {
        throw new AppError(404, 'Job billing not found');
      }
      
      const billing = billingResult.rows[0];

      if(billing.billing_status === 'paid' || billing.billing_status === 'settled')
          throw new AppError(400, 'Billing already paid to escrow');

      const totalAmount = Number(billing.total_amount);

      if(Number(amount) !== totalAmount){
        throw new AppError(400, `Invalid payment amount. Amount required is: ${totalAmount}`);
      }
    
      if (!totalAmount || totalAmount <= 0) {
        throw new AppError(400, 'Invalid payment amount');
      }

      // Create unique reference
      const reference = this.generateReference(jobId);
      

      // Prepare Paystack initialization data
      const paystackData = {
        amount: Math.round(totalAmount * 100), // Convert to kobo
        currency: 'NGN',
        email,
        reference,
        metadata: {
          job_id: jobId,
          client_id: clientId,
          billing_id: billing.id,
          custom_fields: [
            {
              display_name: 'Job Category',
              variable_name: 'category',
              value: billing.category
            },
            {
              display_name: "Job ID",
              variable_name: "job_id",
              value: jobId
            }
          ]
        },
        callback_url: `${process.env.APP_FRONTEND_URL}/payment/verify?jobId=${jobId}`,
        channels: ['card', 'bank_transfer', 'ussd', 'qr', 'mobile_money', 'bank']
      };
      
      // Call Paystack API
      const response = await paystackAxios.post('/transaction/initialize', paystackData);
      
      if (!response.data.status) {
        throw new AppError(400, response.data.message || 'Failed to initialize payment');
      }
      
      // Store payment intent in database
      const metadata = response.data.data;
      logger.info(`Paystack initialization response for job ${jobId}:`, response.data);
  
       const client_secret = `${jobId}_${clientId}`;
      await client.query(
        `INSERT INTO payment_intents (job_id, client_id, payment_intent_id, 
        client_secret,  amount, currency, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
        [jobId, clientId, metadata.reference, client_secret, totalAmount, 'NGN', metadata],
      );
      
      logger.info(`Payment initialized for job ${jobId}: ₦${totalAmount}, Reference: ${metadata.reference}`);
      await client.query('COMMIT');
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
      await client.query('ROLLBACK');
      throw new AppError(500, error.response?.data?.message || error.message || 'Failed to initialize payment');
    } finally {
      client.release();
    }
  }

  static async getPaymentIntent(jobId, clientId) {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `SELECT job_id, client_id, payment_intent_id, client_secret, amount, currency, status, metadata, status, failure_reason, paid_at, failed_at, created_at, updated_at  FROM payment_intents WHERE job_id = $1 AND client_id = $2`,
        [jobId, clientId]
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

    static async getPendingPaymentIntent(clientId) {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `SELECT job_id, 
        client_id, payment_intent_id, client_secret, amount, 
        currency, status, metadata, status, failure_reason, paid_at, 
        failed_at, created_at, updated_at  FROM payment_intents WHERE status <> 'succeeded' AND client_id = $1`,
        [clientId]
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
        `SELECT job_id, status, amount, currency, metadata  FROM payment_intents WHERE payment_intent_id = $1`,
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
   * Verify payment after callback
   * @param {string} reference - Paystack transaction reference
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} Payment verification result
   */
  static async verifyPayment(reference, clientId) {
    const client = await pool.connect();
    
    try {
      // Check if already processed
      const existingPayment = await client.query(
        `SELECT * FROM payment_intents WHERE payment_intent_id = $1 AND client_id = $2`,
        [reference, clientId]
      );
      
      if (existingPayment.rows.length === 0) {
        throw new AppError(404, 'Payment record not found');
      }
      
      const payment = existingPayment.rows[0];
      
      if (payment.status === 'succeeded') {
        return {
          status: 'succeeded',
          amount: payment.amount,
          message: 'Payment already verified'
        };
      }
      
      // Verify with Paystack
      const response = await paystackAxios.get(`/transaction/verify/${reference}`);
      
      if (!response.data.status) {
        throw new AppError(400, response.data.message || 'Verification failed');
      }
      
      const transaction = response.data.data;
      
      if (transaction.status === 'success') {
        await client.query('BEGIN');
        const metadata = payment.metadata;
          metadata.transaction = transaction;
        // Update payment intent status
        await client.query(
          `UPDATE payment_intents 
           SET status = 'succeeded', 
               paid_at = NOW(),
               metadata = $1 
           WHERE payment_intent_id = $2`,
          [metadata, reference]
        );
    
         await this.processEscrow(payment.job_id, clientId, payment.amount);

        // Send notifications
        if(process.env.NODE_ENV === 'production'){
        await this.sendPaymentSuccessNotifications(payment.job_id, clientId, transaction.amount / 100);
        }else{
        logger.info(`Payment verified successfully for job ${payment.job_id}: ₦${transaction.amount / 100}`);
        }

        await client.query('COMMIT');
        return {
          status: 'succeeded',
          amount: transaction.amount / 100,
          reference: reference,
          message: 'Payment verified successfully',
        };

      } else {
        await client.query(
          `UPDATE payment_intents 
           SET status = 'failed', 
               failure_reason = $1,
               failed_at = NOW()
           WHERE payment_intent_id = $2`,
          [transaction.gateway_response || 'Payment failed', reference]
        );
        await client.query('COMMIT');
        return {
          status: 'failed',
          message: transaction.gateway_response || 'Payment failed'
        };
      }
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Payment verification error:', error);
      throw new AppError(500, error.response?.data?.message || error.message || 'Failed to verify payment');
    } finally {
      client.release();
    }
  }


  static async processEscrow(jobId, clientId, amount = null){
       const client = await pool.connect();
       try{
        await client.query('BEGIN');

        const jobResult = await client.query(
          `SELECT j.client_id, j.artisan_id, jb.job_id, jb.base_fee, jb.materials_cost, jb.diagnostics_fee, jb.execution_fee,
          jb.workmanship_cost, jb.total_amount, jb.platform_fee  
           FROM jobs j JOIN job_billing jb ON j.id = jb.job_id 
           WHERE j.id = $1`, [jobId]);

        if(jobResult.rows.length !== 1){
          throw AppError(404, 'The job reference could not be found');
        }

        const job = jobResult.rows[0];
        const sys_config = await SysConfig.getSysConfig();
      
        const dispute_buffer = sys_config.job_setting_timeouts.dispute_buffer || TIMEOUTS.DISPUTE_BUFFER;

        const escrowData = {
           jobId: job.job_id,
           clientId,
           artisanId: job.artisan_id,
        };

      

        escrowData.transactionType = 'base_fee';
        escrowData.status  = 'released';
        escrowData.disputeBufferDays = 0;
        escrowData.amount = job.base_fee;
        // Release base fee immediately (non-refundable)
        await EscrowService.createHold(escrowData);
 
        if(job.materials_cost > 0){
             // release materials cost immediately
              escrowData.transactionType = 'materials';
              escrowData.amount = job.materials_cost;
             await EscrowService.createHold(escrowData); 
        }

         if(job.platform_fee > 0){
             // release materials cost immediately
              escrowData.transactionType = 'platform_fee';
              escrowData.amount = job.platform_fee;
             await EscrowService.createHold(escrowData); 
              // Credit system wallet with commission
                await SystemWalletService.processCommission(
                  jobId,
                  job.artisan_id,
                  job.client_id,
                  job.platform_fee,
                  { totalAmount: amount, commissionPercent: job.platform_fee }
                );
              
        }
       
        if(job.diagnostics_fee > 0){
             // release materials cost immediately
              escrowData.transactionType = 'diagnotics';
               escrowData.amount = job.diagnostics_fee;
             await EscrowService.createHold(escrowData); 
        }

        if(job.execution_fee > 0){
               escrowData.transactionType = 'execution';
               escrowData.status = 'held',
               escrowData.disputeBufferDays = dispute_buffer,
                escrowData.amount = job.execution_fee;
             await EscrowService.createHold(escrowData); 
        }


        if(job.workmanship_cost > 0){
              escrowData.transactionType = 'workmanship';
              escrowData.amount = job.workmanship_cost;
              escrowData.status = 'held',
             await EscrowService.createHold(escrowData); 
        }
    
        // Update job billing status
        await client.query(
          `UPDATE job_billing 
           SET billing_status = 'paid', paid_at = NOW()
           WHERE job_id = $1`,
          [jobId]
        );
         
         await client.query('COMMIT');
       }catch(error){
        await client.query('ROLLBACK');
        throw error;
       }
  }
  
  /**
   * Generate unique transaction reference
   * @param {string} jobId - Job ID
   * @returns {string} Unique reference
   */
  static generateReference(jobId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `BW-${jobId.slice(0, 8)}-${timestamp}-${random}`;
  }
  
  /**
   * Send payment success notifications
   * @param {string} jobId - Job ID
   * @param {string} clientId - Client ID
   * @param {number} amount - Payment amount
   * @returns {Promise<void>}
   */
  static async sendPaymentSuccessNotifications(jobId, clientId, amount) {
    const client = await pool.connect();
    
    try {
      const jobResult = await client.query(
        `SELECT j.*, 
                uc.email as client_email, cp.full_legal_name as client_name, uc.phone as client_phone,
                ua.email as artisan_email, ap.full_legal_name as artisan_name, ua.phone as artisan_phone
         FROM jobs j
         JOIN client_profiles cp ON j.client_id = cp.user_id
         JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
         JOIN users uc ON uc.id = cp.user_id 
         JOIN users ua ON ua.id = ap.user_id
         WHERE j.id = $1`,
        [jobId]
      );
      
      const job = jobResult.rows[0];
      
      if (job) {
        // Send email to client
        await NotificationService.sendEmail(
          job.client_email,
          'Payment Confirmed',
          `Your payment of ₦${amount.toLocaleString()} for job #${jobId.slice(0, 8)} has been confirmed.`,
          `<h2>Payment Confirmed</h2>
           <p>Dear ${job.client_name},</p>
           <p>Your payment of <strong>₦${amount.toLocaleString()}</strong> for job #${jobId.slice(0, 8)} has been confirmed.</p>
           <p>The funds are now held in escrow and will be released to the artisan upon job completion.</p>
           <p>Thank you for using BeaverWorks!</p>`
        );
        
        // Send SMS to client
        if (job.client_phone) {
          await NotificationService.sendSMS(
            job.client_phone,
            `BeaverWorks: Payment of ₦${amount.toLocaleString()} confirmed for job #${jobId.slice(0, 8)}.`
          );
        }
        
        // Send email to artisan (optional)
        await NotificationService.sendEmail(
          job.artisan_email,
          'Payment Received for Job',
          `Payment of ₦${amount.toLocaleString()} has been confirmed for job #${jobId.slice(0, 8)}. Funds will be released upon job completion.`,
          `<h2>Payment Received</h2>
           <p>Dear ${job.artisan_name},</p>
           <p>Payment of <strong>₦${amount.toLocaleString()}</strong> has been confirmed for job #${jobId.slice(0, 8)}.</p>
           <p>Funds will be released to your wallet after job completion and client confirmation.</p>
           <p>Thank you for using BeaverWorks!</p>`
        );

      }
    } finally {
      client.release();
    }
  }
  
  /**
   * Process refund
   * @param {string} jobId - Job ID
   * @param {string} clientId - Client ID
   * @param {number} amount - Refund amount
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refund result
   */
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

  static async getTransactionDetails(transactionId){
       const result = await pool.query(`
            SELECT pi.*, jb.* FROM payment_intents pi
            LEFT JOIN job_billing jb on jb.job_id = pi.job_id
             WHERE payment_intent_id = $1
        `, [transactionId]);

        if(result.rows.length < 1){
            throw new AppError(404, 'The transaction you are looking for is not found');
        }
        return result.rows
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
    
    static async addPaymentMethod(clientId, paymentMethod) {

      const { isDefault } = paymentMethod;
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Retrieve payment method from Stripe
        
        
        if (isDefault) {
          await client.query(
            `UPDATE payment_methods SET is_default = false WHERE client_id = $1`,
            [clientId]
          );
        }
        const paymentMethodId = uuidv4();

        const result = await client.query(
          `INSERT INTO payment_methods 
           (client_id, payment_method_id, type, last4, expiry_month, expiry_year, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            clientId, 
            paymentMethodId, 
            paymentMethod.type,
            paymentMethod?.last4,
            paymentMethod?.expiryMonth,
            paymentMethod?.expiryYear,
            isDefault || false
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
         WHERE payment_method_id = $1 AND client_id = $2
         RETURNING *`,
        [methodId, clientId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Payment method not found');
      }
      

      await cacheDel(`payment:methods:${clientId}`);
      
      return result.rows[0];
    }
    
    static async setDefaultPaymentMethod(methodId, isDefault, clientId) {
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
           WHERE payment_method_id = $1 AND client_id = $2
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