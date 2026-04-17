const { pool } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');

class BillingService {
  static async calculateJobCost(jobId) {
    const result = await pool.query(
      `SELECT jb.*, j.billing_mode, j.service_type
       FROM job_billing jb
       JOIN jobs j ON jb.job_id = j.id
       WHERE jb.job_id = $1`,
      [jobId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Job billing not found');
    }
    
    const billing = result.rows[0];
    
    const baseFee = billing.base_fee || 0;
    const diagnosticsFee = billing.diagnostics_fee || 0;
    const executionFee = billing.execution_fee || 0;
    const materialsCost = billing.materials_cost || 0;
    const workmanshipCost = billing.workmanship_cost || 0;
    
    const subtotal = baseFee + diagnosticsFee + executionFee + materialsCost + workmanshipCost;
    
    // Apply platform commission
    const platformFee = Math.ceil(subtotal * (process.env.PLATFORM_COMMISSION_PERCENT || 10) / 100);
    
    const total = subtotal + platformFee;
    
    return {
      breakdown: {
        baseFee,
        diagnosticsFee,
        executionFee,
        materialsCost,
        workmanshipCost,
        subtotal,
        platformFee
      },
      total
    };
  }
  
  static async generateInvoice(jobId) {
    const jobResult = await pool.query(
      `SELECT j.*, 
              cp.full_legal_name as client_name, 
              cp.email as client_email,
              cp.phone as client_phone,
              cp.service_address,
              ap.full_legal_name as artisan_name,
              ap.user_id as artisan_id
       FROM jobs j
       JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
       WHERE j.id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    const job = jobResult.rows[0];
    const cost = await this.calculateJobCost(jobId);
    
    const invoice = {
      invoiceNumber: `INV-${jobId.slice(0, 8).toUpperCase()}`,
      date: new Date().toISOString(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60000).toISOString(),
      job: {
        id: job.id,
        category: job.category,
        description: job.description,
        serviceType: job.service_type,
        createdAt: job.created_at,
        completedAt: job.completed_at
      },
      client: {
        name: job.client_name,
        email: job.client_email,
        phone: job.client_phone,
        address: job.service_address
      },
      artisan: job.artisan_name ? {
        name: job.artisan_name,
        id: job.artisan_id
      } : null,
      billing: cost,
      status: 'pending'
    };
    
    // Store invoice
    await pool.query(
      `INSERT INTO invoices (job_id, invoice_number, data, status)
       VALUES ($1, $2, $3, 'pending')`,
      [jobId, invoice.invoiceNumber, invoice]
    );
    
    return invoice;
  }
  
  static async applyPromotion(jobId, promotionCode, clientId) {
    // Get promotion details
    const promotionResult = await pool.query(
      `SELECT * FROM promotions 
       WHERE code = $1 AND is_active = true 
         AND start_date <= NOW() AND end_date >= NOW()
         AND (max_uses IS NULL OR used_count < max_uses)`,
      [promotionCode]
    );
    
    if (promotionResult.rows.length === 0) {
      throw new AppError(404, 'Invalid or expired promotion code');
    }
    
    const promotion = promotionResult.rows[0];
    
    // Check if client has already used this promotion
    const usageCheck = await pool.query(
      `SELECT * FROM promotion_usage 
       WHERE promotion_id = $1 AND user_id = $2`,
      [promotion.id, clientId]
    );
    
    if (usageCheck.rows.length > 0) {
      throw new AppError(400, 'Promotion already used by this client');
    }
    
    // Calculate job cost
    const cost = await this.calculateJobCost(jobId);
    let discountAmount = 0;
    
    if (promotion.type === 'percentage') {
      discountAmount = (cost.total * promotion.value) / 100;
      if (promotion.max_discount && discountAmount > promotion.max_discount) {
        discountAmount = promotion.max_discount;
      }
    } else if (promotion.type === 'fixed') {
      discountAmount = promotion.value;
    }
    
    if (promotion.min_spend && cost.total < promotion.min_spend) {
      throw new AppError(400, `Minimum spend of ₦${promotion.min_spend} required`);
    }
    
    const finalAmount = cost.total - discountAmount;
    
    // Record promotion usage
    await pool.query(
      `INSERT INTO promotion_usage (promotion_id, user_id, job_id, discount_amount)
       VALUES ($1, $2, $3, $4)`,
      [promotion.id, clientId, jobId, discountAmount]
    );
    
    // Update promotion usage count
    await pool.query(
      `UPDATE promotions SET used_count = used_count + 1 WHERE id = $1`,
      [promotion.id]
    );
    
    return {
      promotion: {
        code: promotion.code,
        name: promotion.name,
        type: promotion.type,
        value: promotion.value
      },
      originalAmount: cost.total,
      discountAmount,
      finalAmount
    };
  }
  
  static async calculateArtisanPayout(jobId) {
    const result = await pool.query(
      `SELECT jb.workmanship_cost, jb.execution_fee, jb.materials_cost,
              j.artisan_id
       FROM job_billing jb
       JOIN jobs j ON jb.job_id = j.id
       WHERE jb.job_id = $1`,
      [jobId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Job billing not found');
    }
    
    const billing = result.rows[0];
    const totalEarnings = (billing.workmanship_cost || 0) + (billing.execution_fee || 0);
    
    // Apply platform commission (already deducted from workmanship)
    const platformFee = Math.ceil(totalEarnings * (process.env.PLATFORM_COMMISSION_PERCENT || 10) / 100);
    const netPayout = totalEarnings - platformFee;
    
    return {
      artisanId: billing.artisan_id,
      grossEarnings: totalEarnings,
      platformFee,
      netPayout,
      materialsReimbursed: billing.materials_cost || 0
    };
  }
  
  static async getBillingHistory(userId, userType, filters = {}) {
    const { page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query;
    let params;
    
    if (userType === 'client') {
      query = `
        SELECT jb.*, j.category, j.service_type, j.job_status, j.created_at
        FROM job_billing jb
        JOIN jobs j ON jb.job_id = j.id
        WHERE j.client_id = $1
        ORDER BY j.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [userId, limit, offset];
    } else if (userType === 'artisan') {
      query = `
        SELECT jb.*, j.category, j.service_type, j.job_status, j.created_at
        FROM job_billing jb
        JOIN jobs j ON jb.job_id = j.id
        WHERE j.artisan_id = $1
        ORDER BY j.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [userId, limit, offset];
    } else {
      query = `
        SELECT jb.*, j.category, j.service_type, j.job_status, j.created_at,
               cp.full_legal_name as client_name,
               ap.full_legal_name as artisan_name
        FROM job_billing jb
        JOIN jobs j ON jb.job_id = j.id
        LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
        LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
        ORDER BY j.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }
    
    const result = await pool.query(query, params);
    
    const countQuery = userType === 'client'
      ? `SELECT COUNT(*) FROM job_billing jb JOIN jobs j ON jb.job_id = j.id WHERE j.client_id = $1`
      : userType === 'artisan'
        ? `SELECT COUNT(*) FROM job_billing jb JOIN jobs j ON jb.job_id = j.id WHERE j.artisan_id = $1`
        : `SELECT COUNT(*) FROM job_billing`;
    
    const countParams = userType !== 'admin' ? [userId] : [];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      billings: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async getFeeConfiguration() {
    const cacheKey = 'billing:fees';
    let config = await cacheGet(cacheKey);
    
    if (!config) {
      const result = await pool.query(
        `SELECT * FROM fee_configuration ORDER BY updated_at DESC LIMIT 1`,
        []
      );
      
      if (result.rows.length === 0) {
        // Default configuration
        config = {
          baseFee: 2500,
          diagnosticsRatePerMinute: 500,
          executionRatePerMinute: 1000,
          platformCommissionPercent: 10,
          monthlyTechnologyFee: 5000,
          onboardingFee: 5000,
          cancellationFee: 0,
          disputeFee: 0
        };
      } else {
        config = result.rows[0];
      }
      
      await cacheSet(cacheKey, config, 3600);
    }
    
    return config;
  }
  
  static async updateFeeConfiguration(adminId, configData) {
    const result = await pool.query(
      `INSERT INTO fee_configuration 
       (base_fee, diagnostics_rate_per_minute, execution_rate_per_minute, 
        platform_commission_percent, monthly_technology_fee, onboarding_fee,
        cancellation_fee, dispute_fee, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        configData.baseFee,
        configData.diagnosticsRatePerMinute,
        configData.executionRatePerMinute,
        configData.platformCommissionPercent,
        configData.monthlyTechnologyFee,
        configData.onboardingFee,
        configData.cancellationFee || 0,
        configData.disputeFee || 0,
        adminId
      ]
    );
    
    // Invalidate cache
    await cacheSet('billing:fees', result.rows[0], 3600);
    
    logger.info(`Fee configuration updated by admin ${adminId}`);
    
    return result.rows[0];
  }
  
  static async calculateCancellationFee(jobId, cancelledBy) {
    const jobResult = await pool.query(
      `SELECT job_status, created_at FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    const job = jobResult.rows[0];
    const config = await this.getFeeConfiguration();
    
    let fee = 0;
    
    if (job.job_status === 'pending') {
      // No fee for cancelling before acceptance
      fee = 0;
    } else if (job.job_status === 'accepted') {
      // Fee for cancelling after acceptance but before arrival
      fee = config.baseFee;
    } else if (job.job_status === 'arrived') {
      // Fee for cancelling after arrival
      fee = config.baseFee + config.diagnosticsRatePerMinute * 5;
    } else if (job.job_status === 'diagnostics') {
      // Fee for cancelling during diagnostics
      fee = config.baseFee + (await this.getDiagnosticsDuration(jobId) * config.diagnosticsRatePerMinute);
    }
    
    return {
      fee,
      reason: `Cancellation by ${cancelledBy}`,
      chargeTo: cancelledBy === 'client' ? 'client' : 'artisan'
    };
  }
  
  static async getDiagnosticsDuration(jobId) {
    const result = await pool.query(
      `SELECT diagnostics_started_at, diagnostics_ended_at 
       FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return 0;
    }
    
    const { diagnostics_started_at, diagnostics_ended_at } = result.rows[0];
    
    if (!diagnostics_started_at) {
      return 0;
    }
    
    const endTime = diagnostics_ended_at || new Date();
    const durationMinutes = (new Date(endTime) - new Date(diagnostics_started_at)) / 1000 / 60;
    
    return Math.ceil(durationMinutes);
  }
  
  static async getPlatformRevenue(filters = {}) {
    const { startDate, endDate, period = 'month' } = filters;
    
    let dateCondition = '';
    const params = [];
    
    if (startDate && endDate) {
      dateCondition = 'AND et.release_date BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    } else if (period !== 'all') {
      const interval = period === 'day' ? '1 day' : period === 'week' ? '7 days' : period === 'month' ? '30 days' : '365 days';
      dateCondition = `AND et.release_date > NOW() - INTERVAL '${interval}'`;
    }
    
    const result = await pool.query(`
      SELECT 
        SUM(et.amount) as total_revenue,
        SUM(CASE WHEN et.transaction_type = 'platform_fee' THEN et.amount ELSE 0 END) as platform_fees,
        COUNT(DISTINCT et.job_id) as jobs_processed,
        COUNT(*) as transactions
      FROM escrow_transactions et
      WHERE et.status = 'released' ${dateCondition}
    `, params);
    
    const monthlyBreakdown = await pool.query(`
      SELECT 
        DATE_TRUNC('month', et.release_date) as month,
        SUM(et.amount) as revenue,
        COUNT(*) as transactions
      FROM escrow_transactions et
      WHERE et.status = 'released' AND et.release_date > NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', et.release_date)
      ORDER BY month DESC
    `);
    
    return {
      summary: result.rows[0],
      monthlyBreakdown: monthlyBreakdown.rows
    };
  }
}

module.exports = BillingService;