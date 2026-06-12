const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');
const PaymentService = require('./payment.service');
const { v4: uuidv4 } = require('uuid');

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
    
    await cacheDel('fee:configuration');
    
    return result.rows[0];
  }
  
  // ==================== Onboarding Fee ====================
  
  /**
   * Pay onboarding fee for artisan
   */
  static async payOnboardingFee(artisanId, paymentMethodId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if already paid
      const existingPayment = await client.query(
        `SELECT * FROM artisan_fee_payments 
         WHERE artisan_id = $1 AND fee_type = 'onboarding' AND status = 'completed'`,
        [artisanId]
      );
      
      if (existingPayment.rows.length > 0) {
        throw new AppError(400, 'Onboarding fee already paid');
      }
      
      // Get fee amount
      const feeConfig = await this.getFeeConfiguration();
      const amount = feeConfig.onboarding.amount;
      
      // Create payment record
      const paymentReference = `ONB-${Date.now()}-${artisanId.slice(0, 8)}`;
      const paymentRecord = await client.query(
        `INSERT INTO artisan_fee_payments 
         (artisan_id, fee_type, amount, payment_reference, status, currency)
         VALUES ($1, 'onboarding', $2, $3, 'pending', $4)
         RETURNING *`,
        [artisanId, amount, paymentReference, 'NGN']
      );
      
      // Process payment (integrate with Paystack/Stripe)
      const paymentResult = await this.processFeePayment(
        artisanId, 
        amount, 
        paymentReference, 
        'onboarding',
        paymentMethodId
      );
      
      if (paymentResult.success) {
        await client.query(
          `UPDATE artisan_fee_payments 
           SET status = 'completed', 
               payment_date = NOW(),
               payment_method = $1,
               transaction_id = $2,
               payment_gateway = $3
           WHERE id = $4`,
          [paymentResult.paymentMethod, paymentResult.transactionId, paymentResult.gateway, paymentRecord.rows[0].id]
        );
        
        // Update artisan profile
        await client.query(
          `UPDATE artisan_profiles 
           SET onboarding_fee_paid = true,
               updated_at = NOW()
           WHERE user_id = $1`,
          [artisanId]
        );
        
        // Log payment
        await this.logFeePayment(artisanId, paymentRecord.rows[0].id, 'onboarding_fee_paid', 
          { amount, reference: paymentReference });
        
        await client.query('COMMIT');
        
        // Send notification
        await NotificationService.sendEmail(
          await this.getArtisanEmail(artisanId),
          'Onboarding Fee Paid Successfully',
          `Your onboarding fee of ₦${amount.toLocaleString()} has been paid successfully. You can now accept jobs on BeaverWorks.`,
          `<h2>Payment Successful</h2>
           <p>Your onboarding fee of <strong>₦${amount.toLocaleString()}</strong> has been paid successfully.</p>
           <p>You can now accept jobs on BeaverWorks.</p>
           <p>Thank you for joining our platform!</p>`
        );
        
        return { success: true, amount, reference: paymentReference };
      } else {
        await client.query(
          `UPDATE artisan_fee_payments 
           SET status = 'failed', metadata = $1
           WHERE id = $2`,
          [JSON.stringify({ error: paymentResult.error }), paymentRecord.rows[0].id]
        );
        
        await client.query('COMMIT');
        
        throw new AppError(400, paymentResult.error || 'Payment failed');
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
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
  static async payMonthlyFee(artisanId, paymentMethodId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check subscription status
      const subscription = await this.getArtisanSubscription(artisanId);
      const feeConfig = await this.getFeeConfiguration();
      const amount = feeConfig.monthly.amount;
      
      // Calculate period
      const now = new Date();
      const periodStart = subscription?.current_period_end || now;
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      
      // Create payment record
      const paymentReference = `MON-${Date.now()}-${artisanId.slice(0, 8)}`;
      const paymentRecord = await client.query(
        `INSERT INTO artisan_fee_payments 
         (artisan_id, fee_type, amount, payment_reference, status, currency, expiry_date)
         VALUES ($1, 'monthly', $2, $3, 'pending', $4, $5)
         RETURNING *`,
        [artisanId, amount, paymentReference, 'NGN', periodEnd]
      );
      
      // Process payment
      const paymentResult = await this.processFeePayment(
        artisanId, 
        amount, 
        paymentReference, 
        'monthly',
        paymentMethodId
      );
      
      if (paymentResult.success) {
        await client.query(
          `UPDATE artisan_fee_payments 
           SET status = 'completed', 
               payment_date = NOW(),
               payment_method = $1,
               transaction_id = $2,
               payment_gateway = $3
           WHERE id = $4`,
          [paymentResult.paymentMethod, paymentResult.transactionId, paymentResult.gateway, paymentRecord.rows[0].id]
        );
        
        // Update or create subscription
        await this.updateArtisanSubscription(artisanId, {
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          lastPaymentDate: now,
          nextPaymentDate: periodEnd,
          paymentMethodId: paymentMethodId
        }, client);
        
        // Update artisan profile monthly fee status
        await client.query(
          `UPDATE artisan_profiles 
           SET monthly_fee_status = 'paid',
               last_fee_payment = NOW(),
               updated_at = NOW()
           WHERE user_id = $1`,
          [artisanId]
        );
        
        // Log payment
        await this.logFeePayment(artisanId, paymentRecord.rows[0].id, 'monthly_fee_paid',
          { amount, reference: paymentReference, periodStart, periodEnd });
        
        await client.query('COMMIT');
        
        // Send notification
        await NotificationService.sendEmail(
          await this.getArtisanEmail(artisanId),
          'Monthly Fee Paid Successfully',
          `Your monthly fee of ₦${amount.toLocaleString()} has been paid. Your subscription is active until ${periodEnd.toLocaleDateString()}.`,
          `<h2>Payment Successful</h2>
           <p>Your monthly fee of <strong>₦${amount.toLocaleString()}</strong> has been paid successfully.</p>
           <p>Your subscription is active until <strong>${periodEnd.toLocaleDateString()}</strong>.</p>
           <p>Thank you for using BeaverWorks!</p>`
        );
        
        return { success: true, amount, reference: paymentReference, validUntil: periodEnd };
      } else {
        await client.query(
          `UPDATE artisan_fee_payments 
           SET status = 'failed', metadata = $1
           WHERE id = $2`,
          [JSON.stringify({ error: paymentResult.error }), paymentRecord.rows[0].id]
        );
        
        await client.query('COMMIT');
        
        throw new AppError(400, paymentResult.error || 'Payment failed');
      }
    } catch (error) {
      await client.query('ROLLBACK');
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
  static async processFeePayment(artisanId, amount, reference, feeType, paymentMethodId = null) {
    // This integrates with Paystack/Stripe
    // For now, simulate successful payment
    // In production, integrate with actual payment gateway
    
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
      
      // For demo/development - simulate success
      // In production, replace with actual payment gateway integration
      const isProduction = process.env.NODE_ENV === 'production';
      
      if (!isProduction) {
        return {
          success: true,
          transactionId: `TEST-${Date.now()}`,
          paymentMethod: paymentMethodId || 'test_card',
          gateway: 'test'
        };
      }
      
      // Actual payment processing would go here
      // Example with Paystack:
      /*
      const paystackData = {
        amount: amount * 100,
        email: artisan.email,
        reference: reference,
        metadata: {
          artisan_id: artisanId,
          fee_type: feeType,
          customer_name: artisan.full_legal_name
        }
      };
      
      const response = await axios.post('https://api.paystack.co/transaction/initialize', paystackData, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      });
      
      return {
        success: true,
        transactionId: response.data.data.reference,
        paymentMethod: 'paystack',
        gateway: 'paystack',
        authorizationUrl: response.data.data.authorization_url
      };
      */
      
      return {
        success: true,
        transactionId: `FEE-${Date.now()}`,
        paymentMethod: paymentMethodId || 'auto',
        gateway: 'system'
      };
      
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
}

module.exports = FeeService;