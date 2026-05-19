const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class PaymentService {
  static async initializePayment(jobId, clientId, paymentMethodId = null) {
    const client = await pool.connect();
    
    try {
      // Get job billing details
      const billingResult = await client.query(
        `SELECT jb.*, j.client_id, j.artisan_id, j.category
         FROM job_billing jb
         JOIN jobs j ON jb.job_id = j.id
         WHERE jb.job_id = $1 AND j.client_id = $2`,
        [jobId, clientId]
      );
      
      if (billingResult.rows.length === 0) {
        throw new AppError(404, 'Job billing not found');
      }
      
      const billing = billingResult.rows[0];
      const totalAmount = (billing.base_fee || 0) + 
                         (billing.diagnostics_fee || 0) + 
                         (billing.execution_fee || 0) + 
                         (billing.materials_cost || 0) + 
                         (billing.workmanship_cost || 0);
      
      if (totalAmount <= 0) {
        throw new AppError(400, 'Invalid payment amount');
      }
      
      // Get or create Stripe customer
      let customerId = await cacheGet(`stripe:customer:${clientId}`);
      
      if (!customerId) {
        const customerResult = await client.query(
          `SELECT stripe_customer_id FROM client_profiles WHERE user_id = $1`,
          [clientId]
        );
        
        customerId = customerResult.rows[0]?.stripe_customer_id;
        
        if (!customerId) {
          const userResult = await client.query(
            `SELECT email, phone FROM users WHERE id = $1`,
            [clientId]
          );
          
          const customer = await stripe.customers.create({
            email: userResult.rows[0].email,
            phone: userResult.rows[0].phone,
            metadata: { clientId }
          });
          
          customerId = customer.id;
          
          await client.query(
            `UPDATE client_profiles SET stripe_customer_id = $1 WHERE user_id = $2`,
            [customerId, clientId]
          );
        }
        
        await cacheSet(`stripe:customer:${clientId}`, customerId, 86400);
      }
      
      // Create payment intent
      const paymentIntentData = {
        amount: Math.round(totalAmount * 100), // Convert to kobo/cents
        currency: 'ngn',
        customer: customerId,
        metadata: {
          jobId,
          clientId,
          billingId: billing.id
        },
        payment_method_types: ['card', 'bank_transfer', 'mobile_money'],
        statement_descriptor: `BeaverWorks Job ${jobId.slice(0, 7)}`
      };
      
      if (paymentMethodId) {
        paymentIntentData.payment_method = paymentMethodId;
        paymentIntentData.off_session = true;
        paymentIntentData.confirm = true;
      }
      
      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
      
      // Store payment intent in database
      await client.query(
        `INSERT INTO payment_intents (job_id, client_id, payment_intent_id, client_secret, amount, currency, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [jobId, clientId, paymentIntent.id, paymentIntent.client_secret, totalAmount, 'ngn']
      );
      
      logger.info(`Payment initialized for job ${jobId}: ₦${totalAmount}`);
      
      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: totalAmount,
        requiresAction: paymentIntent.status === 'requires_action',
        nextAction: paymentIntent.next_action
      };
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async confirmPayment(paymentIntentId, clientId) {
    const result = await pool.query(
      `SELECT * FROM payment_intents 
       WHERE payment_intent_id = $1 AND client_id = $2`,
      [paymentIntentId, clientId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Payment intent not found');
    }
    
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    return {
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency
    };
  }
  
  static async processWebhook(event) {
    const client = await pool.connect();
    
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handleSuccessfulPayment(event.data.object, client);
          break;
          
        case 'payment_intent.payment_failed':
          await this.handleFailedPayment(event.data.object, client);
          break;
          
        case 'charge.refunded':
          await this.handleRefund(event.data.object, client);
          break;
      }
    } catch (error) {
      logger.error('Webhook processing error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async handleSuccessfulPayment(paymentIntent, client) {
    const { metadata, id, amount } = paymentIntent;
    const { jobId, clientId, billingId } = metadata;
    
    await client.query('BEGIN');
    
    // Update payment intent status
    await client.query(
      `UPDATE payment_intents 
       SET status = 'succeeded', paid_at = NOW()
       WHERE payment_intent_id = $1`,
      [id]
    );
    
    // Move funds to escrow
    await client.query(
      `INSERT INTO escrow_transactions (job_id, client_id, amount, transaction_type, status, dispute_buffer_until)
       VALUES ($1, $2, $3, 'full_payment', 'held', NOW() + INTERVAL '3 days')`,
      [jobId, clientId, amount / 100]
    );
    
    // Release base fee immediately (non-refundable)
    await client.query(
      `UPDATE escrow_transactions 
       SET status = 'released', release_date = NOW()
       WHERE job_id = $1 AND transaction_type = 'base_fee'`,
      [jobId]
    );
    
    // Release materials cost immediately
    await client.query(
      `UPDATE escrow_transactions 
       SET status = 'released', release_date = NOW()
       WHERE job_id = $1 AND transaction_type = 'materials'`,
      [jobId]
    );
    
    // Update job billing status
    await client.query(
      `UPDATE job_billing 
       SET billing_status = 'paid', paid_at = NOW()
       WHERE job_id = $1`,
      [jobId]
    );
    
    // Send confirmation email
    const jobResult = await client.query(
      `SELECT j.*, cp.email as client_email, cp.full_legal_name as client_name,
              ap.email as artisan_email, ap.full_legal_name as artisan_name
       FROM jobs j
       JOIN client_profiles cp ON j.client_id = cp.user_id
       JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
       WHERE j.id = $1`,
      [jobId]
    );
    
    const job = jobResult.rows[0];
    
    await NotificationService.sendPaymentConfirmation(job.client_email, amount / 100, jobId);
    await NotificationService.sendPaymentConfirmation(job.artisan_email, amount / 100, jobId);
    
    await client.query('COMMIT');
    
    logger.info(`Payment succeeded for job ${jobId}: ₦${amount / 100}`);
  }
  
  static async handleFailedPayment(paymentIntent, client) {
    const { metadata, id, last_payment_error } = paymentIntent;
    const { jobId, clientId } = metadata;
    
    await client.query(
      `UPDATE payment_intents 
       SET status = 'failed', failure_reason = $1, failed_at = NOW()
       WHERE payment_intent_id = $2`,
      [last_payment_error?.message, id]
    );
    
    // Notify client
    const clientResult = await client.query(
      `SELECT email FROM users WHERE id = $1`,
      [clientId]
    );
    
    if (clientResult.rows[0]) {
      await NotificationService.sendEmail(
        clientResult.rows[0].email,
        'Payment Failed',
        `Your payment for job ${jobId} failed. Please try again or use a different payment method.`
      );
    }
    
    logger.warn(`Payment failed for job ${jobId}: ${last_payment_error?.message}`);
  }
  
  static async handleRefund(charge, client) {
    const { payment_intent, amount_refunded, id } = charge;
    
    await client.query(
      `UPDATE refunds 
       SET status = 'completed', 
           transaction_id = $1,
           completed_at = NOW()
       WHERE payment_intent_id = $2`,
      [id, payment_intent]
    );
    
    logger.info(`Refund processed: ${id} for amount ₦${amount_refunded / 100}`);
  }
  
  static async createRefund(jobId, clientId, amount, reason) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if payment exists
      const paymentResult = await client.query(
        `SELECT payment_intent_id, amount 
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
        `INSERT INTO refunds (job_id, payment_intent_id, amount, reason, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *`,
        [jobId, payment.payment_intent_id, amount, reason]
      );
      
      // Process refund with Stripe
      const refund = await stripe.refunds.create({
        payment_intent: payment.payment_intent_id,
        amount: Math.round(amount * 100),
        reason: 'requested_by_customer',
        metadata: { jobId, refundId: refundResult.rows[0].id }
      });
      
      await client.query(
        `UPDATE refunds 
         SET transaction_id = $1, status = 'processing'
         WHERE id = $2`,
        [refund.id, refundResult.rows[0].id]
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
      throw error;
    } finally {
      client.release();
    }
  }
  
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
      throw error;
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
      
      // Attach to customer
      const customerResult = await client.query(
        `SELECT stripe_customer_id FROM client_profiles WHERE user_id = $1`,
        [clientId]
      );
      
      if (customerResult.rows[0]?.stripe_customer_id) {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerResult.rows[0].stripe_customer_id
        });
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
    
    // Detach from Stripe
    await stripe.paymentMethods.detach(result.rows[0].payment_method_id);
    
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

  
  
  static async getTransactionHistory(userId, userType, filters = {}) {
    const { page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query;
    let params;
    
    if (userType === 'client') {
      query = `
        SELECT pi.*, j.category, j.service_type, j.job_status
        FROM payment_intents pi
        JOIN jobs j ON pi.job_id = j.id
        WHERE j.client_id = $1
        ORDER BY pi.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [userId, limit, offset];
    } else {
      query = `
        SELECT ap.*, j.category, j.service_type, j.job_status
        FROM artisan_payouts ap
        JOIN jobs j ON ap.job_id = j.id
        WHERE j.artisan_id = $1
        ORDER BY ap.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [userId, limit, offset];
    }
    
    const result = await pool.query(query, params);
    
    const countQuery = userType === 'client'
      ? `SELECT COUNT(*) FROM payment_intents pi JOIN jobs j ON pi.job_id = j.id WHERE j.client_id = $1`
      : `SELECT COUNT(*) FROM artisan_payouts ap JOIN jobs j ON ap.job_id = j.id WHERE j.artisan_id = $1`;
    
    const countResult = await pool.query(countQuery, [userId]);
    
    return {
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async getBalance(clientId) {
    const result = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END), 0) as held_balance,
         COALESCE(SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END), 0) as released_balance,
         COALESCE(SUM(CASE WHEN status = 'frozen' THEN amount ELSE 0 END), 0) as frozen_balance
       FROM escrow_transactions
       WHERE client_id = $1`,
      [clientId]
    );
    
    return result.rows[0];
  }
}

module.exports = PaymentService;