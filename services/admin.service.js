const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');

class AdminService {
  static async getDashboardStats() {
    const cacheKey = 'admin:dashboard:stats';
    let stats = await cacheGet(cacheKey);
    
    if (!stats) {
      const results = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM users WHERE user_type = 'client' AND is_active = true`),
        pool.query(`SELECT COUNT(*) FROM users WHERE user_type = 'artisan' AND is_active = true`),
        pool.query(`SELECT COUNT(*) FROM users WHERE verification_status = 'pending'`),
        pool.query(`SELECT COUNT(*) FROM jobs WHERE job_status IN ('pending', 'accepted', 'arrived', 'diagnostics', 'execution')`),
        pool.query(`SELECT COUNT(*) FROM jobs WHERE job_status = 'completed' AND created_at > NOW() - INTERVAL '30 days'`),
        pool.query(`SELECT COUNT(*) FROM disputes WHERE status = 'pending'`),
        pool.query(`SELECT COALESCE(SUM(amount), 0) FROM escrow_transactions WHERE status = 'held'`),
        pool.query(`SELECT COALESCE(SUM(amount), 0) FROM payment_intents WHERE status = 'succeeded' AND paid_at > NOW() - INTERVAL '30 days'`)
      ]);
      
      stats = {
        clients: parseInt(results[0].rows[0].count),
        artisans: parseInt(results[1].rows[0].count),
        pendingVerifications: parseInt(results[2].rows[0].count),
        activeJobs: parseInt(results[3].rows[0].count),
        completedJobsThisMonth: parseInt(results[4].rows[0].count),
        pendingDisputes: parseInt(results[5].rows[0].count),
        escrowBalance: parseFloat(results[6].rows[0].sum),
        revenueThisMonth: parseFloat(results[7].rows[0].sum)
      };
      
      await cacheSet(cacheKey, stats, 300); // Cache for 5 minutes
    }
    
    return stats;
  }
  
  static async getPendingVerifications(type = null, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT u.id, u.email, u.phone, u.user_type, u.created_at,
             CASE 
               WHEN u.user_type = 'client' THEN cp.full_legal_name
               WHEN u.user_type = 'artisan' THEN ap.full_legal_name
             END as full_name,
             CASE 
               WHEN u.user_type = 'client' THEN cp.verification_documents
               WHEN u.user_type = 'artisan' THEN ap.documents
             END as documents
      FROM users u
      LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
      WHERE u.verification_status = 'pending'
    `;
    
    const params = [];
    
    if (type) {
      query += ` AND u.user_type = $1`;
      params.push(type);
    }
    
    query += ` ORDER BY u.created_at ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM users WHERE verification_status = 'pending'
      ${type ? 'AND user_type = $1' : ''}
    `;
    const countParams = type ? [type] : [];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async verifyUser(userId, status, notes = null, tier = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update user verification status
      await client.query(
        `UPDATE users 
         SET is_verified = $1, verification_status = $2, 
             verification_notes = $3, verified_at = NOW()
         WHERE id = $4`,
        [status === 'approved', status, notes, userId]
      );
      
      // If artisan and approved, set tier
      if (status === 'approved' && tier) {
        await client.query(
          `UPDATE artisan_profiles SET tier_level = $1 WHERE user_id = $2`,
          [tier, userId]
        );
      }
      
      // Log verification
      await client.query(
        `INSERT INTO verification_logs (user_id, status, notes, verified_by)
         VALUES ($1, $2, $3, $4)`,
        [userId, status, notes, 'admin']
      );
      
      await client.query('COMMIT');
      
      // Send notification to user
      const userResult = await client.query(
        `SELECT email, user_type FROM users WHERE id = $1`,
        [userId]
      );
      
      if (userResult.rows[0]) {
        const subject = status === 'approved' ? 'Account Verified' : 'Verification Failed';
        const message = status === 'approved' 
          ? 'Your account has been verified successfully. You can now use all features.'
          : `Your account verification failed. Reason: ${notes || 'Please contact support.'}`;
        
        await NotificationService.sendEmail(userResult.rows[0].email, subject, message);
      }
      
      logger.info(`User ${userId} verification ${status} by admin`);
      
      return { userId, status, notes };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async getAllUsers(filters = {}) {
    const { type, status, search, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT u.id, u.email, u.phone, u.user_type, u.is_verified, u.is_active,
             u.verification_status, u.created_at, u.last_login,
             CASE 
               WHEN u.user_type = 'client' THEN cp.full_legal_name
               WHEN u.user_type = 'artisan' THEN ap.full_legal_name
             END as full_name
      FROM users u
      LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (type) {
      query += ` AND u.user_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    if (status === 'active') {
      query += ` AND u.is_active = true`;
    } else if (status === 'inactive') {
      query += ` AND u.is_active = false`;
    } else if (status === 'pending') {
      query += ` AND u.verification_status = 'pending'`;
    }
    
    if (search) {
      query += ` AND (u.email ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex} OR cp.full_legal_name ILIKE $${paramIndex} OR ap.full_legal_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM users u
      LEFT JOIN client_profiles cp ON u.id = cp.user_id
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
      WHERE 1=1
      ${type ? `AND u.user_type = '${type}'` : ''}
      ${status === 'active' ? 'AND u.is_active = true' : status === 'inactive' ? 'AND u.is_active = false' : ''}
      ${search ? `AND (u.email ILIKE '%${search}%' OR u.phone ILIKE '%${search}%' OR cp.full_legal_name ILIKE '%${search}%' OR ap.full_legal_name ILIKE '%${search}%')` : ''}
    `;
    
    const countResult = await pool.query(countQuery);
    
    return {
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async suspendUser(userId, reason, duration = null) {
    const result = await pool.query(
      `UPDATE users 
       SET is_active = false, 
           suspension_reason = $1,
           suspended_at = NOW(),
           suspension_duration = $2
       WHERE id = $3
       RETURNING *`,
      [reason, duration, userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    
    // If artisan, set as unavailable
    await pool.query(
      `UPDATE artisan_profiles SET is_available = false WHERE user_id = $1`,
      [userId]
    );
    
    // Send notification
    const userResult = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
    if (userResult.rows[0]) {
      await NotificationService.sendEmail(
        userResult.rows[0].email,
        'Account Suspended',
        `Your account has been suspended. Reason: ${reason}${duration ? ` Duration: ${duration}` : ''}`
      );
    }
    
    logger.info(`User ${userId} suspended: ${reason}`);
    
    return result.rows[0];
  }
  
  static async activateUser(userId) {
    const result = await pool.query(
      `UPDATE users 
       SET is_active = true, 
           suspension_reason = NULL,
           suspended_at = NULL,
           suspension_duration = NULL
       WHERE id = $1
       RETURNING *`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    
    // Send notification
    const userResult = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
    if (userResult.rows[0]) {
      await NotificationService.sendEmail(
        userResult.rows[0].email,
        'Account Activated',
        'Your account has been reactivated. You can now use all features.'
      );
    }
    
    logger.info(`User ${userId} activated`);
    
    return result.rows[0];
  }
  
  static async getAllJobs(filters = {}) {
    const { status, category, page = 1, limit = 20, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT j.*, 
             cp.full_legal_name as client_name,
             ap.full_legal_name as artisan_name,
             jb.total_amount,
             jb.billing_status
      FROM jobs j
      LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      query += ` AND j.job_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (category) {
      query += ` AND j.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND j.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND j.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY j.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM jobs
      WHERE 1=1
      ${status ? `AND job_status = '${status}'` : ''}
      ${category ? `AND category = '${category}'` : ''}
    `;
    const countResult = await pool.query(countQuery);
    
    return {
      jobs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async getCategories() {
    const result = await pool.query(
      `SELECT * FROM categories WHERE is_active = true ORDER BY name ASC`,
      []
    );
    return result.rows;
  }
  
  static async createCategory(categoryData) {
    const { name, description, requiredCertifications, billingRules, icon } = categoryData;
    
    const result = await pool.query(
      `INSERT INTO categories (name, description, required_certifications, billing_rules, icon)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, requiredCertifications, billingRules, icon]
    );
    
    await cacheDel('admin:categories');
    
    logger.info(`Category created: ${name}`);
    
    return result.rows[0];
  }
  
  static async updateCategory(categoryId, updateData) {
    const { name, description, isActive, requiredCertifications, billingRules, icon } = updateData;
    
    const result = await pool.query(
      `UPDATE categories 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_active = COALESCE($3, is_active),
           required_certifications = COALESCE($4, required_certifications),
           billing_rules = COALESCE($5, billing_rules),
           icon = COALESCE($6, icon),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [name, description, isActive, requiredCertifications, billingRules, icon, categoryId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Category not found');
    }
    
    await cacheDel('admin:categories');
    
    return result.rows[0];
  }
  
  static async getSystemSettings() {
    const result = await pool.query(
      `SELECT * FROM system_settings ORDER BY category, key`,
      []
    );
    
    const settings = {};
    for (const setting of result.rows) {
      if (!settings[setting.category]) {
        settings[setting.category] = {};
      }
      settings[setting.category][setting.key] = setting.value;
    }
    
    return settings;
  }
  
  static async updateSystemSetting(category, key, value, updatedBy) {
    const result = await pool.query(
      `INSERT INTO system_settings (category, key, value, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (category, key) 
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [category, key, value, updatedBy]
    );
    
    await cacheDel('admin:settings');
    
    return result.rows[0];
  }
  
  static async getAuditLogs(filters = {}) {
    const { entityType, action, userId, startDate, endDate, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT al.*, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (entityType) {
      query += ` AND al.entity_type = $${paramIndex}`;
      params.push(entityType);
      paramIndex++;
    }
    
    if (action) {
      query += ` AND al.action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }
    
    if (userId) {
      query += ` AND al.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND al.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND al.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM audit_logs
      WHERE 1=1
      ${entityType ? `AND entity_type = '${entityType}'` : ''}
      ${action ? `AND action = '${action}'` : ''}
    `;
    const countResult = await pool.query(countQuery);
    
    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async getSystemHealth() {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      storage: await this.checkStorage(),
      payment: await this.checkPaymentGateway()
    };
    
    const overall = Object.values(checks).every(c => c.status === 'healthy');
    
    return {
      status: overall ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks
    };
  }
  
  static async checkDatabase() {
    try {
      const result = await pool.query('SELECT NOW()');
      return { status: 'healthy', latency: 'ok', timestamp: result.rows[0].now };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
  
  static async checkRedis() {
    try {
      const { redis } = require('../config/redis');
      await redis.ping();
      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
  
  static async checkStorage() {
    // Check S3 or local storage
    return { status: 'healthy' };
  }
  
  static async checkPaymentGateway() {
    // Check Stripe/Paystack connectivity
    return { status: 'healthy' };
  }
  
  static async generateReport(reportType, filters = {}) {
    const { startDate, endDate, format = 'json' } = filters;
    
    let data;
    let filename = `report_${reportType}_${Date.now()}`;
    
    switch (reportType) {
      case 'financial':
        data = await this.generateFinancialReport(startDate, endDate);
        break;
      case 'users':
        data = await this.generateUsersReport(startDate, endDate);
        break;
      case 'jobs':
        data = await this.generateJobsReport(startDate, endDate);
        break;
      case 'performance':
        data = await this.generatePerformanceReport(startDate, endDate);
        break;
      default:
        throw new AppError(400, 'Invalid report type');
    }
    
    return { data, filename, format };
  }
  
  static async generateFinancialReport(startDate, endDate) {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as transactions,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount
      FROM payment_intents
      WHERE status = 'succeeded'
        AND created_at BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date DESC
    `, [startDate, endDate]);
    
    const summary = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_revenue,
        AVG(amount) as average_transaction,
        SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END) as platform_fees
      FROM escrow_transactions
      WHERE status = 'released'
        AND release_date BETWEEN $1 AND $2
    `, [startDate, endDate]);
    
    return {
      summary: summary.rows[0],
      daily: result.rows,
      period: { startDate, endDate }
    };
  }
  
  static async generateUsersReport(startDate, endDate) {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        user_type,
        COUNT(*) as new_users
      FROM users
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('day', created_at), user_type
      ORDER BY date DESC
    `, [startDate, endDate]);
    
    const totals = await pool.query(`
      SELECT 
        user_type,
        COUNT(*) as total
      FROM users
      GROUP BY user_type
    `);
    
    return {
      totals: totals.rows,
      daily: result.rows,
      period: { startDate, endDate }
    };
  }
  
  static async generateJobsReport(startDate, endDate) {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        category,
        COUNT(*) as jobs_created,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as jobs_completed
      FROM jobs
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('day', created_at), category
      ORDER BY date DESC
    `, [startDate, endDate]);
    
    const summary = await pool.query(`
      SELECT 
        category,
        COUNT(*) as total_jobs,
        AVG(jb.total_amount) as average_value
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.created_at BETWEEN $1 AND $2
      GROUP BY category
    `, [startDate, endDate]);
    
    return {
      summary: summary.rows,
      daily: result.rows,
      period: { startDate, endDate }
    };
  }
  
  static async generatePerformanceReport(startDate, endDate) {
    const topArtisans = await pool.query(`
      SELECT 
        ap.user_id,
        ap.full_legal_name,
        COUNT(j.id) as jobs_completed,
        AVG(jb.workmanship_cost) as average_earning,
        ap.star_rating
      FROM artisan_profiles ap
      JOIN jobs j ON ap.user_id = j.artisan_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.job_status = 'completed'
        AND j.completed_at BETWEEN $1 AND $2
      GROUP BY ap.user_id, ap.full_legal_name, ap.star_rating
      ORDER BY jobs_completed DESC
      LIMIT 10
    `, [startDate, endDate]);
    
    const topClients = await pool.query(`
      SELECT 
        cp.user_id,
        cp.full_legal_name,
        COUNT(j.id) as jobs_posted,
        SUM(jb.total_amount) as total_spent
      FROM client_profiles cp
      JOIN jobs j ON cp.user_id = j.client_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.created_at BETWEEN $1 AND $2
      GROUP BY cp.user_id, cp.full_legal_name
      ORDER BY total_spent DESC
      LIMIT 10
    `, [startDate, endDate]);
    
    return {
      topArtisans: topArtisans.rows,
      topClients: topClients.rows,
      period: { startDate, endDate }
    };
  }
}

module.exports = AdminService;