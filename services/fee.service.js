const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');
const FeePaymentService = require('./fee.payment.service');
const { v4: uuidv4 } = require('uuid');
const { PRICING } = require('../config/constants');
const SysConfig = require('../config/syst-config');
const SystemWalletService = require('./system-wallet.service');

class FeeService {
  // ==================== Fee Configuration ====================
  
  /**
   * Get current fee configuration
   */
  static async getFeeConfiguration() {
    const cacheKey = 'fee:configuration';
    let config = await cacheGet(cacheKey);
    
    if (!config) {
      const result = await pool.query(
        `SELECT * FROM fee_configuration WHERE is_active = true ORDER BY fee_type`
      );
      
      config = {};
      for (const row of result.rows) {
        config[row.fee_type] = {
          amount: parseFloat(row.amount),
          currency: row.currency,
          gracePeriodDays: row.grace_period_days,
          description: row.description
        };
      }
      
      await cacheSet(cacheKey, config, 3600);
    }
    
    return config;
  }
  
  /**
   * Update fee configuration (Admin only)
   */
  static async updateFeeConfiguration(feeType, amount, gracePeriodDays, adminId) {
    const result = await pool.query(
      `UPDATE fee_configuration 
       SET amount = $1, 
           grace_period_days = $2,
           updated_by = $3,
           updated_at = NOW()
       WHERE fee_type = $4
       RETURNING *`,
      [amount, gracePeriodDays, adminId, feeType]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Fee configuration not found');
    }
    
   await SysConfig.updateConfigValue();
    
    return result.rows[0];
  }
  
  // ==================== Onboarding Fee ====================
  
  /**
   * Pay onboarding fee for artisan
   */
  static async payOnboardingFee(artisanId, onboardingAmount, paymentMethodId = null) {
    const client = await pool.connect();
    
    try {
      
        // Check if already paid
       const existingPayment = await client.query(
        `SELECT * FROM artisan_fee_payments 
         WHERE artisan_id = $1 AND fee_type = 'onboarding' `,
        [artisanId]
      );
       var exist = null;
      if (existingPayment.rows.length === 1) {
         exist = existingPayment.rows[0];
         if(exist.status === 'pending') throw new AppError(400, 'Onboarding Fee payment still pending');
         if(exist.status === 'onboarding') throw new AppError(400, 'Onboarding fee already paid');

         await client.query(`DELETE FROM artisan_fee_payments WHERE artisan_id = $1 `, [artisanId]);
      }

  
      const sys_config = await SysConfig.getSysConfig();

      const amount = sys_config.onboarding_fee || process.env.ARTISAN_ONBOARDING_FEE;
      if(parseFloat(amount).toFixed(2) !== parseFloat(onboardingAmount).toFixed(2)) {
          throw new AppError(403, `The required Onboarding Fee is : ${amount}`)
      }
      
       const artisanResult = await client.query(
        `SELECT u.email, u.phone, ap.full_legal_name
         FROM users u
         JOIN artisan_profiles ap ON u.id = ap.user_id
         WHERE u.id = $1`,
        [artisanId]
      );
      const artisan = artisanResult.rows[0];
      const initPay = await this.initializePayment(artisanId, amount, 'onboarding', artisan.email, paymentMethodId);

   
      return initPay;

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

   static async initializePayment(artisanId, amount, feeType, artisanEmail, paymentMethodId = null){
       
        const client =  await pool.connect();

        try{
          await client.query('BEGIN');

         const paymentReference = `ONB-${Date.now()}-${artisanId.slice(0, 8)}`;

         const customFields = [
         {
           paymentMethod: paymentMethodId || 'online card',
           feeType,
           value: amount,
         },
      ];
  
      const initPay = await FeePaymentService.initializePayment(paymentReference, amount, artisanId, artisanEmail, customFields);

      const client_secret = `${paymentReference}_${artisanId}`;

      await client.query(
        `INSERT INTO fee_payment_intents (payment_reference, artisan_id, payment_intent_id, 
        client_secret,  amount, currency, status, metadata, fee_type, payment_method_type, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, 'online_payment', NOW())`,
        [paymentReference, artisanId, initPay.metadata.reference,
         client_secret, amount, 'NGN', initPay.metadata, feeType],
      );
    
      await client.query(
        `INSERT INTO artisan_fee_payments (status, payment_date, payment_gateway, artisan_id, amount, 
        payment_reference, transaction_id,  metadata, fee_type)
        VALUES ('pending', NOW(), 'paystack', $1, $2, $3, $4, $5, $6)`,
        [artisanId, amount, paymentReference, initPay.metadata.reference, initPay.metadata, feeType]
      );

      await client.query('COMMIT');

      return initPay;

    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{
      client.release();
    }
      
   }

  static async getPaymentIntents(artisanId, status = null){
   

     try{
  
       let query = `
       SELECT id, artisan_id, fee_type, amount, currency, status, payment_reference, 
       payment_intent_id, client_secret, metadata, gateway, payment_method_type, payment_method_id, gateway_transaction_id, gateway_reference, paid_at, failed_at, failure_reason, expires_at, refunded_at, created_at, updated_at 
       FROM fee_payment_intents WHERE artisan_id = $1 `;
       const params = [artisanId];
       let paramIndex = 2;

       if(status){
        query += ` AND status = $${paramIndex}`;
        params.push(status);
       }
      
       const payInts = await pool.query(query, params);
       return payInts.rows;

     }catch(error){
       throw error;
     }
  }

  static async confirmPayment(reference, userId) {
    const client = await pool.connect();
     try{
         await client.query('BEGIN');
           // Check if already processed
            const existingPayment = await client.query(
              `SELECT * FROM fee_payment_intents WHERE payment_intent_id = $1 AND artisan_id = $2`,
              [reference, userId]
            );
            
            if (existingPayment.rows.length === 0) {
              throw new AppError(404, 'Payment record not found');
            }
            
            const payment = existingPayment.rows[0];

          
            
            if (payment.status === 'succeeded') {
              return {
                status: 'already_verified',
                amount: payment.amount,
                message: 'Payment already verified'
              };
            } 
       
      const verify = await FeePaymentService.verifyPayment(reference, userId);
       logger.info(`payment.fee_type: ${payment.fee_type}`)
       if(verify.status === 'succeeded'){

         await client.query(
          `UPDATE artisan_fee_payments 
            SET status = 'completed' WHERE artisan_id = $1 AND transaction_id = $2
          `, [userId, reference]
         );

      
             // Credit system wallet
              await SystemWalletService.processOnboardingFee(
                userId,
                payment.amount,
                reference
              );

         if(payment.fee_type === 'monthly'){
            await this.monthlyFeeConfirmed(userId, reference);
              // Update artisan profile monthly fee status
        await client.query(
          `UPDATE artisan_profiles 
           SET monthly_fee_status = 'paid',
               last_fee_payment = NOW(),
               updated_at = NOW()
           WHERE user_id = $1`,
          [userId]
        );
           
         }
         
       }else{

         await client.query(
          `UPDATE artisan_fee_payments 
           SET status = $1 WHERE artisan_id = $2 AND transaction_id = $3
          `, [verify.status, userId, reference]);
       }
      
       await client.query('COMMIT');
      return verify;

     }catch(error){
      await client.query('ROLLBACK');
       throw error;
     }finally{
       client.release();
     }
  }
  
  /**
   * Check if artisan has paid onboarding fee
   */
  static async hasPaidOnboardingFee(artisanId) {
    const result = await pool.query(
      `SELECT status FROM artisan_fee_payments 
       WHERE artisan_id = $1 AND fee_type = 'onboarding' 
       ORDER BY created_at DESC LIMIT 1`,
      [artisanId]
    );
    
    if (result.rows.length === 0) return false;
    return result.rows[0].status === 'completed';
  }
  
  // ==================== Monthly Fee ====================
  
  /**
   * Pay monthly fee
   */
  static async payMonthlyFee(artisanId, monthlyFee, artisanEmail, paymentMethodId = null) {
  
    
   try {
         // Get fee amount
      const sys_config = await SysConfig.getSysConfig();

      const amount = sys_config.monthly_technology_fee ||  PRICING.MONTHLY_TECHNOLOGY_FEE;

      if(parseFloat(amount).toFixed(2) !== parseFloat(monthlyFee).toFixed(2)) {
          throw new AppError(403, `The required monthly Fee is : ${amount}`)
      }
    
      const paymentResult = await this.initializePayment(artisanId, amount, 'monthly', artisanEmail,  paymentMethodId);
      return paymentResult;
      }catch(error){
          throw error;
     }  
  }

  static async monthlyFeeConfirmed(artisanId){
     
     const client = await pool.connect();

        try{

      // Check subscription status
      const subscription = await this.getArtisanSubscription(artisanId);
     
      // Calculate period
      const now = new Date();
      const periodStart = subscription?.current_period_end || now;
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

        // Update or create subscription
        await this.updateArtisanSubscription(artisanId, {
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          lastPaymentDate: now,
          nextPaymentDate: periodEnd,
        }, client);
        
   return;
      
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get artisan subscription details
   */
  static async getArtisanSubscription(artisanId) {
    const result = await pool.query(
      `SELECT * FROM artisan_subscriptions WHERE artisan_id = $1`,
      [artisanId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const subscription = result.rows[0];
    
    // Check if subscription is expired
    if (subscription.subscription_status === 'active' && 
        subscription.current_period_end < new Date()) {
      subscription.subscription_status = 'expired';
      await this.updateSubscriptionStatus(artisanId, 'expired');
    }
    
    return subscription;
  }
  
  /**
   * Update artisan subscription
   */
  static async updateArtisanSubscription(artisanId, data, client = null) {
    const dbClient = client || (await pool.connect());
    const shouldRelease = !client;
    
    try {
      const result = await dbClient.query(
        `INSERT INTO artisan_subscriptions 
         (artisan_id, subscription_status, current_period_start, current_period_end, 
          last_payment_date, next_payment_date, payment_method_id, auto_renew)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (artisan_id) 
         DO UPDATE SET 
           subscription_status = EXCLUDED.subscription_status,
           current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end,
           last_payment_date = EXCLUDED.last_payment_date,
           next_payment_date = EXCLUDED.next_payment_date,
           payment_method_id = COALESCE(EXCLUDED.payment_method_id, artisan_subscriptions.payment_method_id),
           updated_at = NOW()
         RETURNING *`,
        [
          artisanId,
          data.status,
          data.currentPeriodStart,
          data.currentPeriodEnd,
          data.lastPaymentDate,
          data.nextPaymentDate,
          data.paymentMethodId || null,
          data.autoRenew !== false
        ]
      );
      
      return result.rows[0];
    } finally {
      if (shouldRelease && dbClient.release) {
        dbClient.release();
      }
    }
  }
  
  /**
   * Update subscription status
   */
  static async updateSubscriptionStatus(artisanId, status) {
    await pool.query(
      `UPDATE artisan_subscriptions 
       SET subscription_status = $1, updated_at = NOW()
       WHERE artisan_id = $2`,
      [status, artisanId]
    );
    
    // Update artisan profile
    await pool.query(
      `UPDATE artisan_profiles 
       SET monthly_fee_status = $1
       WHERE user_id = $2`,
      [status === 'active' ? 'paid' : 'pending', artisanId]
    );
  }
  
  /**
   * Process automatic monthly fee renewal
   * This should be run by a cron job daily
   */
  static async processAutoRenewals() {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Find subscriptions that need renewal
      const dueSubscriptions = await client.query(
        `SELECT asub.*, ap.email, ap.full_legal_name
         FROM artisan_subscriptions asub
         JOIN artisan_profiles ap ON asub.artisan_id = ap.user_id
         WHERE asub.subscription_status = 'active'
           AND asub.auto_renew = true
           AND asub.next_payment_date <= NOW()
           AND asub.next_payment_date > NOW() - INTERVAL '7 days'`,
        []
      );
      
      const results = [];
      for (const sub of dueSubscriptions.rows) {
        try {
          // Process auto-renewal payment
          const paymentResult = await this.payMonthlyFee(
            sub.artisan_id,
            sub.payment_method_id
          );
          
          results.push({
            artisanId: sub.artisan_id,
            success: true,
            amount: paymentResult.amount
          });
          
        } catch (error) {
          results.push({
            artisanId: sub.artisan_id,
            success: false,
            error: error.message
          });
          
          // If payment fails, mark as past_due
          await client.query(
            `UPDATE artisan_subscriptions 
             SET subscription_status = 'past_due'
             WHERE artisan_id = $1`,
            [sub.artisan_id]
          );
        }
      }
      
      await client.query('COMMIT');
      
      logger.info(`Processed ${results.length} auto-renewals. Successful: ${results.filter(r => r.success).length}`);
      
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Auto-renewal processing error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Cancel subscription
   */
  static async cancelSubscription(artisanId) {
    const result = await pool.query(
      `UPDATE artisan_subscriptions 
       SET subscription_status = 'cancelled',
           auto_renew = false,
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE artisan_id = $1
       RETURNING *`,
      [artisanId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Subscription not found');
    }
    
    // Update artisan profile
    await pool.query(
      `UPDATE artisan_profiles 
       SET monthly_fee_status = 'pending'
       WHERE user_id = $1`,
      [artisanId]
    );
    
    return result.rows[0];
  }
  
  /**
   * Get payment history for artisan
   */
  static async getPaymentHistory(artisanId, filters = {}) {
    const { feeType, status, page = 1, limit = 20, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM artisan_fee_payments
      WHERE artisan_id = $1
    `;
    const params = [artisanId];
    let paramIndex = 2;
    
    if (feeType) {
      query += ` AND fee_type = $${paramIndex}`;
      params.push(feeType);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM artisan_fee_payments
      WHERE artisan_id = $1
      ${feeType ? `AND fee_type = '${feeType}'` : ''}
      ${status ? `AND status = '${status}'` : ''}
    `;
    const countParams = [artisanId];
    const countResult = await pool.query(countQuery, countParams);
    
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN fee_type = 'onboarding' AND status = 'completed' THEN amount ELSE 0 END) as total_onboarding_paid,
        SUM(CASE WHEN fee_type = 'monthly' AND status = 'completed' THEN amount ELSE 0 END) as total_monthly_paid,
        COUNT(CASE WHEN fee_type = 'monthly' AND status = 'completed' THEN 1 END) as months_paid
      FROM artisan_fee_payments
      WHERE artisan_id = $1
    `, [artisanId]);
    
    return {
      payments: result.rows,
      statistics: stats.rows[0],
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  /**
   * Process fee payment via payment gateway
   */
  static async processFeePayment(artisanId, amount, refId, feeType, paymentMethodId = null) {
    
    try {
      // Get artisan email
      const artisanResult = await pool.query(
        `SELECT u.email, u.phone, ap.full_legal_name
         FROM users u
         JOIN artisan_profiles ap ON u.id = ap.user_id
         WHERE u.id = $1`,
        [artisanId]
      );
      
      const artisan = artisanResult.rows[0]; 
      
  
      const customFields = [
         {
           paymentMethod: paymentMethodId || 'online card',
           feeType,
           value: amount,
         }
      ,]

      const initPay = await FeePaymentService.initializePayment(refId, amount, artisanId, artisan.email, customFields);
 
     if(initPay.reference){

      const verifyPay = await FeePaymentService.verifyPayment(initPay.reference, artisanId);
      
      if(verifyPay.status === 'succeeded'){
          return {
            success: true,
            transactionId: initPay.reference,
            amount: initPay.amount / 100,
            paymentMethod: paymentMethodId || 'online',
            message: 'Payment was successfull',
            artisan_id: artisanId,
            gateway: 'paystack'
          };
      }
    }
    
    return {
          success: false,
          amount,
          paymentMethod: paymentMethodId || 'online',
          message: 'Payment failed',
          artisan_id: artisanId,

         }
      
    } catch (error) {
      logger.error('Fee payment processing error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Log fee payment activity
   */
  static async logFeePayment(artisanId, feePaymentId, action, details = {}, ipAddress = null, userAgent = null) {
    await pool.query(
      `INSERT INTO fee_payment_logs (artisan_id, fee_payment_id, action, status, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [artisanId, feePaymentId, action, 'completed', details, ipAddress, userAgent]
    );
  }
  
  /**
   * Get artisan email helper
   */
  static async getArtisanEmail(artisanId) {
    const result = await pool.query(
      `SELECT email FROM users WHERE id = $1`,
      [artisanId]
    );
    return result.rows[0]?.email;
  }
  
  /**
   * Check if artisan has active monthly subscription
   */
  static async hasActiveSubscription(artisanId) {
    const subscription = await this.getArtisanSubscription(artisanId);
    
    if (!subscription) return false;
    
    return subscription.subscription_status === 'active' && 
           subscription.current_period_end > new Date();
  }
  
  /**
   * Get all artisans with expired subscriptions (for admin)
   */
  static async getExpiredSubscriptions(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const result = await pool.query(`
      SELECT asub.*, 
             ap.full_legal_name, ap.email, ap.phone,
             u.is_active
      FROM artisan_subscriptions asub
      JOIN artisan_profiles ap ON asub.artisan_id = ap.user_id
      JOIN users u ON asub.artisan_id = u.id
      WHERE asub.subscription_status IN ('expired', 'past_due')
         OR (asub.subscription_status = 'active' AND asub.current_period_end < NOW())
      ORDER BY asub.current_period_end ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM artisan_subscriptions
      WHERE subscription_status IN ('expired', 'past_due')
         OR (subscription_status = 'active' AND current_period_end < NOW())
    `);
    
    return {
      subscriptions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  /**
   * Get fee payment statistics for admin dashboard
   */
  static async getFeeStatistics() {
    const stats = await pool.query(`
      SELECT 
        COUNT(CASE WHEN fee_type = 'onboarding' AND status = 'completed' THEN 1 END) as total_onboarding_paid,
        SUM(CASE WHEN fee_type = 'onboarding' AND status = 'completed' THEN amount ELSE 0 END) as total_onboarding_revenue,
        COUNT(CASE WHEN fee_type = 'monthly' AND status = 'completed' THEN 1 END) as total_monthly_paid,
        SUM(CASE WHEN fee_type = 'monthly' AND status = 'completed' THEN amount ELSE 0 END) as total_monthly_revenue,
        COUNT(CASE WHEN fee_type = 'monthly' AND status = 'pending' THEN 1 END) as pending_monthly_payments,
        COUNT(DISTINCT CASE WHEN fee_type = 'monthly' AND status = 'completed' AND payment_date > NOW() - INTERVAL '30 days' THEN artisan_id END) as active_subscribers
      FROM artisan_fee_payments
      WHERE created_at > NOW() - INTERVAL '90 days'
    `);
    
    const monthlyTrend = await pool.query(`
      SELECT 
        DATE_TRUNC('month', payment_date) as month,
        COUNT(*) as payments_count,
        SUM(amount) as total_amount
      FROM artisan_fee_payments
      WHERE status = 'completed' AND payment_date IS NOT NULL
        AND payment_date > NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', payment_date)
      ORDER BY month DESC
    `);
    
    return {
      summary: stats.rows[0],
      monthlyTrend: monthlyTrend.rows
    };
  }

  static async getOnboardingAndMonthlyFee(){
     const fee = await pool.query(`
         SELECT * FROM fees_settings WHERE name = 'fee_configuration'
      `);
      return fee.rows[0];
  }

    static async getChargesRateFee(){
     const fee = await pool.query(`
         SELECT * charges_rete_settings WHERE name = 'charges_fee_rate_configuration'
      `);
      return fee.rows[0];
  }




}

module.exports = FeeService;