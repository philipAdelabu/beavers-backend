const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const { generateTokens, verifyRefreshToken } = require('../utils/jwt.utils');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { pool } = require('../config/database');
const NotificationService = require('./notification.service');


class AdminService {
  // ==================== Dashboard Statistics ====================
  
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
        pool.query(`SELECT COALESCE(SUM(amount), 0) FROM payment_intents WHERE status = 'succeeded' AND paid_at > NOW() - INTERVAL '30 days'`),
        pool.query(`SELECT COUNT(*) FROM bill_of_quantities WHERE status = 'pending_admin_approval'`),
        pool.query(`SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending'`)
      ]);
      
      stats = {
        clients: parseInt(results[0].rows[0].count),
        artisans: parseInt(results[1].rows[0].count),
        pendingVerifications: parseInt(results[2].rows[0].count),
        activeJobs: parseInt(results[3].rows[0].count),
        completedJobsThisMonth: parseInt(results[4].rows[0].count),
        pendingDisputes: parseInt(results[5].rows[0].count),
        escrowBalance: parseFloat(results[6].rows[0].sum),
        revenueThisMonth: parseFloat(results[7].rows[0].sum),
        pendingBoQs: parseInt(results[8].rows[0].count),
        pendingWithdrawals: parseInt(results[9].rows[0].count)
      };
      
      await cacheSet(cacheKey, stats, 300);
    }
    
    return stats;
  }
  
  static async getDashboardMetrics(period = 'month') {
    const interval = period === 'week' ? '7 days' : period === 'month' ? '30 days' : '365 days';
    
    const results = await Promise.all([
      pool.query(`
        SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as count
        FROM users WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY DATE_TRUNC('day', created_at) ORDER BY date ASC
      `),
      pool.query(`
        SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as count
        FROM jobs WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY DATE_TRUNC('day', created_at) ORDER BY date ASC
      `),
      pool.query(`
        SELECT DATE_TRUNC('day', paid_at) as date, SUM(amount) as revenue
        FROM payment_intents WHERE status = 'succeeded' AND paid_at > NOW() - INTERVAL '${interval}'
        GROUP BY DATE_TRUNC('day', paid_at) ORDER BY date ASC
      `)
    ]);
    
    return {
      userGrowth: results[0].rows,
      jobTrends: results[1].rows,
      revenueTrends: results[2].rows
    };
  }
  
  static async getRealtimeStats() {
    const results = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '5 minutes'`),
      pool.query(`SELECT COUNT(*) FROM artisan_profiles WHERE is_available = true`),
      pool.query(`SELECT COUNT(*) FROM jobs WHERE job_status IN ('accepted', 'arrived', 'diagnostics', 'execution')`),
      pool.query(`SELECT COUNT(*) FROM disputes WHERE status = 'pending' AND created_at > NOW() - INTERVAL '24 hours'`),
      pool.query(`SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) FROM bill_of_quantities WHERE status = 'pending_admin_approval'`)
    ]);
    
    return {
      activeUsers: parseInt(results[0].rows[0].count),
      activeArtisans: parseInt(results[1].rows[0].count),
      activeJobs: parseInt(results[2].rows[0].count),
      newDisputes24h: parseInt(results[3].rows[0].count),
      pendingWithdrawals: parseInt(results[4].rows[0].count),
      pendingBoQs: parseInt(results[5].rows[0].count),
      timestamp: new Date().toISOString()
    };
  }
  
  // ==================== User Management ====================
  
  static async getAllUsers(filters = {}) {
    const { type, status, search, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT u.id, u.email, u.phone, u.user_type, u.is_verified, u.is_active,
             u.verification_status, u.created_at, u.last_login,
             CASE 
               WHEN u.user_type = 'client' THEN cp.full_legal_name
               WHEN u.user_type = 'artisan' THEN ap.full_legal_name
               WHEN u.user_type = 'admin' THEN adm.full_name
             END as full_name,
             CASE 
               WHEN u.user_type = 'client' THEN cp.verification_documents
               WHEN u.user_type = 'artisan' THEN ap.documents
             END as documents
      FROM users u
      LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
      LEFT JOIN admin_profiles adm ON u.id = adm.user_id AND u.user_type = 'admin'
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
      ${status === 'active' ? 'AND u.is_active = true' : status === 'inactive' ? 'AND u.is_active = false' : status === 'pending' ? "AND u.verification_status = 'pending'" : ''}
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
  
  static async getUserDetails(userId) {
    const result = await pool.query(`
      SELECT u.*,
             cp.full_legal_name as client_name, cp.street_address, cp.service_address, cp.id as client_id,
             cp.verification_documents as client_documents,
             ap.full_legal_name as artisan_name, ap.skill_category, ap.tier_level, ap.id as artisan_id,
             ap.star_rating, ap.completion_rate, ap.documents as artisan_documents,
             adm.full_name as admin_name, adm.department,
             (SELECT COUNT(*) FROM jobs WHERE jobs.client_id = u.id) as total_jobs_as_client,
             (SELECT COUNT(*) FROM jobs WHERE jobs.artisan_id = u.id) as total_jobs_as_artisan,
             (SELECT COUNT(*) FROM disputes d JOIN jobs j on d.job_id = j.id WHERE d.client_id = u.id OR  j.artisan_id = u.id) as total_disputes,
             (SELECT COALESCE(SUM(amount), 0) FROM payment_intents WHERE payment_intents.client_id = u.id AND status = 'succeeded') as total_spent,
             (SELECT COALESCE(SUM(workmanship_cost), 0) FROM job_billing jb JOIN jobs j ON jb.job_id = j.id WHERE j.artisan_id = u.id) as total_earned
      FROM users u
      LEFT JOIN client_profiles cp ON u.id = cp.user_id
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
      LEFT JOIN admin_profiles adm ON u.id = adm.user_id
      WHERE u.id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    const user = result.rows[0];
    delete user.password_hash;
    return user;
  }

  static async getAllAdmins(){
      
  }
  
  static async updateUserStatus(userId, isActive, reason = null) {
    const result = await pool.query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [isActive, userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    
    await this.logAdminActivity(userId, isActive ? 'user_activated' : 'user_suspended', 
      { userId, reason, status: isActive ? 'active' : 'suspended' });
    
    return result.rows[0];
  }
  
  // ==================== Verification Management ====================
  
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
             END as documents,
             CASE 
               WHEN u.user_type = 'client' THEN cp.nin
               WHEN u.user_type = 'artisan' THEN ap.nin
             END as nin,
             CASE 
               WHEN u.user_type = 'client' THEN cp.street_address
               WHEN u.user_type = 'artisan' THEN ap.residential_address
             END as address
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
      ${type ? `AND user_type = '${type}'` : ''}
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
  
  static async verifyUser(adminId, userId, status, notes = null, tier = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const userResult = await client.query(
        `SELECT user_type FROM users WHERE id = $1`,
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new AppError(404, 'User not found');
      }
      
      const userType = userResult.rows[0].user_type;
      
      await client.query(
        `UPDATE users 
         SET is_verified = $1, verification_status = $2, 
             verification_notes = $3
         WHERE id = $4`,
        [status === 'approved', status, notes, userId]
      );
      
      if (userType === 'artisan' && status === 'approved' && tier) {
        await client.query(
          `UPDATE artisan_profiles SET tier_level = $1 WHERE user_id = $2`,
          [tier, userId]
        );
      }
      

      await client.query('COMMIT');
      
      await this.logAdminActivity(adminId, 'verification_processed', 
        { userId: userId, status: status, notes: notes, tier:tier });
      
      return { userId, status, notes, tier };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ==================== Artisan Management ====================
  
  static async updateArtisanTier(adminId, artisanId, tier, reason) {
    const result = await pool.query(
      `UPDATE artisan_profiles 
       SET tier_level = $1, tier_updated_at = NOW(), tier_update_reason = $2
       WHERE user_id = $3
       RETURNING *`,
      [tier, reason, artisanId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Artisan not found');
    }
    
    await this.logAdminActivity(adminId, 'tier_updated', 
      { artisanId, newTier: tier, reason });
    
    return result.rows[0];
  }
  
  static async getArtisanPerformance(artisanId) {
    const result = await pool.query(`
      SELECT ap.*,
             (SELECT COUNT(*) FROM jobs WHERE artisan_id = $1 AND job_status = 'completed') as completed_jobs,
             (SELECT AVG(rating) FROM ratings WHERE reviewee_id = $1) as avg_rating,
             (SELECT COUNT(*) FROM ratings WHERE reviewee_id = $1) as total_ratings,
             (SELECT COALESCE(SUM(jb.workmanship_cost), 0) FROM job_billing jb JOIN jobs j ON jb.job_id = j.id WHERE j.artisan_id = $1) as total_earnings,
             (SELECT COUNT(*) FROM disputes WHERE job_id IN (SELECT id FROM jobs WHERE artisan_id = $1)) as dispute_count
      FROM artisan_profiles ap
      WHERE ap.user_id = $1
    `, [artisanId]);
    
    return result.rows[0];
  }
  
  // ==================== Job Management ====================
  
  static async getAllJobs(filters = {}) {
    const { status, category, page = 1, limit = 20, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT j.*, 
             cp.full_legal_name as client_name,
             ap.full_legal_name as artisan_name,
             jb.total_amount,
             jb.billing_status,
             boq.status as boq_status
      FROM jobs j
      LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      LEFT JOIN bill_of_quantities boq ON j.id = boq.job_id AND boq.version = (
        SELECT MAX(version) FROM bill_of_quantities WHERE job_id = j.id
      )
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
  
  static async getJobDetails(jobId) {
    const result = await pool.query(`
      SELECT j.*, 
             cp.full_legal_name as client_name, cu.email as client_email, cu.phone as client_phone,
             ap.full_legal_name as artisan_name, au.email as artisan_email, au.phone as artisan_phone,
             jb.*,
             boq.items as boq_items, boq.status as boq_status,
             (SELECT json_agg(row_to_json(tl) ORDER BY tl.created_at ASC) FROM job_timeline tl WHERE tl.job_id = j.id ) as timeline
      FROM jobs j
      LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      LEFT JOIN bill_of_quantities boq ON j.id = boq.job_id AND boq.version = (
        SELECT MAX(version) FROM bill_of_quantities WHERE job_id = j.id
      )
        LEFT JOIN users cu ON cu.id = cp.user_id 
        LEFT JOIN users au ON au.id = ap.user_id
      WHERE j.id = $1
    `, [jobId]);
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    return result.rows[0];
  }
  
  static async forceCancelJob(adminId, jobId, reason, refundAmount = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE jobs 
         SET job_status = 'cancelled', 
             cancelled_at = NOW(),
             cancellation_reason = $1,
             cancelled_by = 'admin'
         WHERE id = $2
         RETURNING *`,
        [reason, jobId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Job not found');
      }
      
      if (refundAmount && refundAmount > 0) {
        await client.query(
          `INSERT INTO refunds (job_id, amount, reason, status)
           VALUES ($1, $2, $3, 'processing')`,
          [jobId, refundAmount, `Admin forced cancellation: ${reason}`]
        );
      }
      
      await client.query('COMMIT');
      
      await this.logAdminActivity(adminId, 'job_force_cancelled', 
        { jobId, reason, refundAmount });
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ==================== Dispute Management ====================
  
  static async getAllDisputes(filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT d.*, 
             j.category, j.service_type,
             cp.full_legal_name as client_name,
             ap.full_legal_name as artisan_name,
             (SELECT COUNT(*) FROM dispute_messages WHERE dispute_id = d.id) as message_count
      FROM disputes d
      JOIN jobs j ON d.job_id = j.id
      JOIN client_profiles cp ON d.client_id = cp.user_id
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      query += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY d.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM disputes
      WHERE 1=1
      ${status ? `AND status = '${status}'` : ''}
    `;
    const countResult = await pool.query(countQuery);
    
    const stats = await pool.query(`
      SELECT status, COUNT(*) as count FROM disputes GROUP BY status
    `);
    
    return {
      disputes: result.rows,
      statistics: stats.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async getDisputeDetails(disputeId) {
    const result = await pool.query(`
      SELECT d.*, 
             j.category, j.service_type, j.description as job_description,
             cp.full_legal_name as client_name, cp.email as client_email, cp.phone as client_phone,
             ap.full_legal_name as artisan_name, ap.email as artisan_email, ap.phone as artisan_phone,
             (SELECT json_agg(row_to_json(dm) ORDER BY dm.created_at ASC) FROM dispute_messages dm WHERE dm.dispute_id = d.id) as messages
      FROM disputes d
      JOIN jobs j ON d.job_id = j.id
      JOIN client_profiles cp ON d.client_id = cp.user_id
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      WHERE d.id = $1
    `, [disputeId]);
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Dispute not found');
    }
    
    return result.rows[0];
  }
  
  static async resolveDispute(disputeId, resolution) {
    const { decision, message, amount } = resolution;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const disputeResult = await client.query(
        `SELECT * FROM disputes WHERE id = $1`,
        [disputeId]
      );
      
      if (disputeResult.rows.length === 0) {
        throw new AppError(404, 'Dispute not found');
      }
      
      const dispute = disputeResult.rows[0];
      
      await client.query(
        `UPDATE disputes 
         SET status = 'resolved', 
             resolution = $1,
             resolved_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(resolution), disputeId]
      );
      
      if (decision === 'refund_client' && amount) {
        await client.query(
          `INSERT INTO refunds (job_id, amount, reason, status)
           VALUES ($1, $2, 'dispute_resolution', 'processing')`,
          [dispute.job_id, amount]
        );
        
        await client.query(
          `UPDATE escrow_transactions 
           SET status = 'refunded', refunded_at = NOW(), refund_reason = 'dispute_resolved'
           WHERE job_id = $1 AND status = 'frozen'`,
          [dispute.job_id]
        );
      } else if (decision === 'pay_artisan') {
        await client.query(
          `UPDATE escrow_transactions 
           SET status = 'released', release_date = NOW(), release_reason = 'dispute_resolved'
           WHERE job_id = $1 AND status = 'frozen'`,
          [dispute.job_id]
        );
      }
      
      await client.query('COMMIT');
      
      await this.logAdminActivity(disputeId, 'dispute_resolved', 
        { disputeId, decision, message, amount });
      
      return { disputeId, resolution };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ==================== Category Management ====================
  
  static async getCategories() {
    const result = await pool.query(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM subcategories WHERE category_id = c.id AND is_active = true) as subcategory_count,
             (SELECT COUNT(*) FROM artisan_profiles WHERE skill_category = c.name) as artisan_count
      FROM categories c
      ORDER BY c.display_order ASC, c.name ASC
    `);
    
    return result.rows;
  }
  
  static async createCategory(categoryData, userId) {
    const { name, description, required_certifications, billing_rules, icon, display_order } = categoryData;
       const client = await pool.connect();
    try{
     await client.query('BEGIN')

    const result = await client.query(
      `INSERT INTO categories (name, description, required_certifications, billing_rules, icon, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [name, description, required_certifications, billing_rules, icon, display_order || 0]
    );
    
    await cacheDel('admin:categories');
    await cacheDel('categories:all');
    await cacheDel('categories:active');
    
    await this.logAdminActivity(userId, 'category_created', categoryData);
    await client.query('COMMIT');
    
    return result.rows[0];
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
     client.release();
  }
  }
  
  static async updateCategory(categoryId, updates, userId) {
    const allowedFields = ['name', 'description', 'required_certifications', 'billing_rules', 'icon', 'is_active', 'display_order'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;


    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) return null;
    
    values.push(categoryId);
    const result = await pool.query(
      `UPDATE categories 
       SET ${setClause.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Category not found');
    }
    
    await cacheDel('admin:categories');
    await cacheDel('categories:all');
    await cacheDel('categories:active');
    
    await this.logAdminActivity(userId, 'category_updated', updates);
    
    return result.rows[0];
  }
  
  static async deleteCategory(categoryId, userId) {
    const result = await pool.query(
      `UPDATE categories SET is_active = false WHERE id = $1 RETURNING *`,
      [categoryId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Category not found');
    }
    
    await cacheDel('admin:categories');
    await cacheDel('categories:all');
    await cacheDel('categories:active');
    
    await this.logAdminActivity(userId, 'category_deleted', { categoryId });
    
    return result.rows[0];
  }

  
  
  // ==================== Subcategory Management ====================
  
  static async getSubcategories(categoryId = null) {
    let query = `
      SELECT s.*, c.name as category_name
      FROM subcategories s
      JOIN categories c ON s.category_id = c.id
    `;
    const params = [];
    
    if (categoryId) {
      query += ` WHERE s.category_id = $1`;
      params.push(categoryId);
    }
    
    query += ` ORDER BY c.name ASC, s.display_order ASC, s.name ASC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }
  
  static async createSubcategory(subcategoryData, userId) {
    const { category_id, name, description, icon, required_certifications, display_order } = subcategoryData;
    const client = await pool.connect();
    try{
     await client.query('BEGIN')
    const result = await client.query(
      `INSERT INTO subcategories (category_id, name, description, icon, required_certifications, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [category_id, name, description, icon, required_certifications, display_order || 0]
    );
    
    await cacheDel(`subcategories:category:${category_id}`);
    await cacheDel('subcategories:all');
    
    await this.logAdminActivity(userId, 'subcategory_created', subcategoryData);
     await client.query('COMMIT');
    return result.rows[0];
   }catch(error){
    await client.query('ROLLBACK');
    throw error;
   }finally{
     client.release();
   }
  }
  
  static async updateSubcategory(subcategoryId, updates, userId) {
    const allowedFields = ['name', 'description', 'icon', 'required_certifications', 'is_active', 'display_order'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) return null;
    
    values.push(subcategoryId);
    const result = await pool.query(
      `UPDATE subcategories 
       SET ${setClause.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Subcategory not found');
    }
    
    const subcategory = result.rows[0];
    await cacheDel(`subcategories:category:${subcategory.category_id}`);
    await cacheDel('subcategories:all');
    
    await this.logAdminActivity(userId, 'subcategory_updated', updates);
    
    return result.rows[0];
  }
  
  static async deleteSubcategory(subcategoryId, userId) {
    const result = await pool.query(
      `UPDATE subcategories SET is_active = false WHERE id = $1 RETURNING *`,
      [subcategoryId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Subcategory not found');
    }
    
    const subcategory = result.rows[0];
    await cacheDel(`subcategories:category:${subcategory.category_id}`);
    await cacheDel('subcategories:all');
    
    await this.logAdminActivity(userId, 'subcategory_deleted', { subcategoryId });
    
    return result.rows[0];
  }
  
  // ==================== Admin User Management ====================

   static async createBasicAdmin(adminData) {
    const { email, phone, password, fullName } = adminData;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = uuidv4();
      
      await client.query(
        `INSERT INTO users (id, email, phone, password_hash, user_type, is_verified, verification_status, is_active)
         VALUES ($1, $2, $3, $4, 'admin', true, 'verified', true)`,
        [userId, email, phone, hashedPassword]
      );

      const admin_role = await client.query(
       `SELECT * FROM admin_roles  WHERE name = 'super_admin'`
      );
      
      if(admin_role.rows[0].name === 'super_admin'){
        const roleId = admin_role.rows[0].id;
          await client.query(
        `INSERT INTO admin_profiles (user_id, role_id, full_name, department)
         VALUES ($1, $2, $3, $4)`,
        [userId, roleId, fullName, 'HR']
      );
      }
    
      
      await client.query('COMMIT');
      
      await this.logAdminActivity(userId, 'admin_created', adminData);
      
      return { userId, email, fullName };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async createAdmin(adminData) {
    const { email, phone, password, fullName, roleId, department } = adminData;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = uuidv4();
      
      await client.query(
        `INSERT INTO users (id, email, phone, password_hash, user_type, is_verified, verification_status, is_active)
         VALUES ($1, $2, $3, $4, 'admin', true, 'verified', true)`,
        [userId, email, phone, hashedPassword]
      );
      
      await client.query(
        `INSERT INTO admin_profiles (user_id, role_id, full_name, department)
         VALUES ($1, $2, $3, $4)`,
        [userId, roleId, fullName, department]
      );
      
      await client.query('COMMIT');
      
      await this.logAdminActivity(userId, 'admin_created', adminData);
      
      return { userId, email, fullName };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async getAdminRoles() {
    const result = await pool.query(
      `SELECT * FROM admin_roles WHERE is_active = true ORDER BY name ASC`
    );
    return result.rows;
  }

  static async getAllAdmin() {
    const result = await pool.query(
      `SELECT ap.*, u.email, u.phone, u.id as user_id, ar.name as role_type, ar.permissions, ar.description,
      ar.is_active as is_role_active 
      FROM users u JOIN admin_profiles ap ON u.id = ap.user_id
      LEFT JOIN admin_roles ar ON ar.id = ap.role_id 
       ORDER BY name ASC`
    );
    return result.rows;
  }

  
  static async updateAdminRole(adminId, roleId) {
    const result = await pool.query(
      `UPDATE admin_profiles SET role_id = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *`,
      [roleId, adminId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Admin not found');
    }
    
    await this.logAdminActivity(adminId, 'admin_role_updated', { adminId, roleId });
    
    return result.rows[0];
  }




    static async login(email, password, ipAddress, userAgent) {
      const client = await pool.connect();
      
      try {
      
        
        let query;
        let params;
        
         await client.query('BEGIN');
          query = `
            SELECT u.email, u.phone, u.user_type, u.is_active, u.password_hash, u.id,
                   r.name as role_name, r.description as role_description, r.permissions as role_permissions,
                   p.department, p.last_active, p.full_name
            FROM users u
            LEFT JOIN admin_profiles p ON u.id = p.user_id
            LEFT JOIN admin_roles r ON r.id = p.role_id
            WHERE u.email = $1
          `;
          params = [email];
      
        
        const userResult = await client.query(query, params);
        
        if (userResult.rows.length === 0) {
          throw new AppError(401, 'Invalid credentials');
        }
        


        const user = userResult.rows[0];

         
        logger.info("User id : ", user.id);
        
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
          // Log failed attempt
          await this.logFailedAttempt(email, ipAddress);
          throw new AppError(401, 'Invalid credentials');
        }
        
        // Check if account is active
        if (!user.is_active) {
          throw new AppError(403, 'Account is deactivated. Please contact support.');
        }
    
        
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.user_type);
        
        // Store refresh token in Redis
        await cacheSet(`refresh_token:${user.id}`, refreshToken, 2592000); // 30 days
        
        // Update last login
        await client.query(
          `UPDATE users SET last_login = NOW(), is_logged_in = true, last_login_ip = $1 WHERE id = $2`,
          [ipAddress, user.id]
        );
        
          await client.query(
          `UPDATE admin_profiles SET last_active = NOW() WHERE user_id = $1`,
          [user.id]
        );
        // Log successful login
        await client.query(
          `INSERT INTO login_history (user_id, ip_address, user_agent, success, login_time)
           VALUES ($1, $2, $3, true, NOW())`,
          [user.id, ipAddress, userAgent]
        );
        
        await client.query('COMMIT');

        logger.info(`User logged in: ${user.email} / ${user.user_type}`);
        delete user.password_hash;

       user.is_logged_in = true;
        return {
          accessToken,
          refreshToken,
          user,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }


      static async logFailedAttempt(email, ipAddress) {
    await pool.query(
      `INSERT INTO failed_logins (email, ip_address, attempted_at)
       VALUES ($1, $2, NOW())`,
      [email, ipAddress]
    );
    
    // Check for brute force attempts
    const recentAttempts = await pool.query(
      `SELECT COUNT(*) FROM failed_logins 
       WHERE email = $1 AND attempted_at > NOW() - INTERVAL '15 minutes'`,
      [email]
    );
    
    if (parseInt(recentAttempts.rows[0].count) >= 5) {
      // Temporarily block login attempts
      await cacheSet(`login_block:${email}`, 'true', 900); // 15 minutes
      logger.warn(`Multiple failed login attempts for: ${email}`);
    }
  }
  
  static async isLoginBlocked(email) {
    const blocked = await cacheGet(`login_block:${email}`);
    return !!blocked;
  }


  static async refreshToken(refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const storedToken = await cacheGet(`refresh_token:${decoded.userId}`);
      
      if (storedToken !== refreshToken) {
        throw new AppError(401, 'Invalid refresh token');
      }
      
      const userResult = await pool.query(
        'SELECT id, email, user_type FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new AppError(401, 'User not found or inactive');
      }
      
      const user = userResult.rows[0];
      const { accessToken } = generateTokens(user.id, user.email, user.user_type);
      
      return { accessToken };
    } catch (error) {
      throw error;
    }
  }


  static async logout(userId, accessToken) {
  
    try {
      // Blacklist the access token
      const decoded = jwt.decode(accessToken);
      if (decoded && decoded.exp) {
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        if (expiresIn > 0) {
          await cacheSet(`blacklist:${accessToken}`, 'true', expiresIn);
          logger.info(`Access token blacklisted for user: ${userId}`);
        }
      }
      
      // Delete refresh token from Redis
      await cacheDel(`refresh_token:${userId}`);
      
      // Update last logout time in database (optional)
      await pool.query(
        `UPDATE users SET last_logout = NOW(), is_logged_in = false WHERE id = $1`,
        [userId]
      );
      
           await pool.query(
          `UPDATE admin_profiles SET last_active = NOW() WHERE user_id = $1`,
          [userId]
        );
      // Log logout activity
      await pool.query(
        `INSERT INTO user_activity_logs (user_id, action, created_at)
         VALUES ($1, 'logout', NOW())`,
        [userId]
      );
      
      logger.info(`User logged out: ${userId}`);
      
      return { 
        success: true, 
        message: 'Logged out successfully' 
      };
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }
  
  
  
  // ==================== System Configuration ====================
  
  static async getSystemConfigurations(key = null) {
   
    if(key){
       const result = await pool.query(`
          SELECT * FROM system_configurations WHERE key = $1
        `, [key]);
        if(result.rows.length === 0)
           return null;
         return result.rows[0];
    }

      const result = await pool.query(`SELECT * FROM system_configurations ORDER BY key ASC`);
      return result.rows;
  }
  
  static async updateSystemConfiguration(key, value, adminId) {
    const result = await pool.query(
      `INSERT INTO system_configurations (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) 
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [key, value, adminId]
    );
    
    await cacheDel(`system:config:${key}`);
    
    await this.logAdminActivity(adminId, 'system_config_updated', { key, value });
    
    return result.rows[0];
  }

 
  
  // ==================== Activity Logging ==================== //

  
  static async getActivityLogs(filters = {}) {
    const { adminId, action, page = 1, limit = 50, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT al.*, u.email as admin_email, ap.full_name as admin_name
      FROM admin_activity_logs al
      JOIN users u ON al.admin_id = u.id
      LEFT JOIN admin_profiles ap ON u.id = ap.user_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (adminId) {
      query += ` AND al.admin_id = $${paramIndex}`;
      params.push(adminId);
      paramIndex++;
    }
    
    if (action) {
      query += ` AND al.action = $${paramIndex}`;
      params.push(action);
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
      SELECT COUNT(*) FROM admin_activity_logs
      WHERE 1=1
      ${adminId ? `AND admin_id = '${adminId}'` : ''}
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
  
  static async logAdminActivity(adminId, action, details = {}, ipAddress = null, userAgent = null) {
    await pool.query(
      `INSERT INTO admin_activity_logs (admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [adminId, action, details.entityType || null, details.entityId || null, details, ipAddress, userAgent]
    );
  }


  
  // ==================== Reports ==================== //
  
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
      case 'artisans':
        data = await this.generateArtisansReport(startDate, endDate);
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
        SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END) as platform_fees,
        SUM(CASE WHEN transaction_type = 'workmanship' THEN amount ELSE 0 END) as artisan_payouts
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
  
  static async generateArtisansReport(startDate, endDate) {
    const result = await pool.query(`
      SELECT 
        ap.user_id,
        ap.full_legal_name,
        ap.skill_category,
        ap.tier_level,
        ap.star_rating,
        COUNT(j.id) as jobs_completed,
        COALESCE(SUM(jb.workmanship_cost), 0) as total_earnings,
        AVG(jb.workmanship_cost) as average_earning
      FROM artisan_profiles ap
      LEFT JOIN jobs j ON ap.user_id = j.artisan_id AND j.job_status = 'completed'
        AND j.completed_at BETWEEN $1 AND $2
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      GROUP BY ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, ap.star_rating
      ORDER BY jobs_completed DESC
      LIMIT 100
    `, [startDate, endDate]);
    
    return {
      topArtisans: result.rows,
      period: { startDate, endDate }
    };
  }
  
  // ==================== Bulk Notifications ====================
  
  static async sendBulkNotification(notificationData) {
    const { userType, title, message, data = {} } = notificationData;
    
    let query = `
      INSERT INTO notifications (user_id, type, title, message, data, channel)
      SELECT id, 'admin_bulk', $1, $2, $3, 'push'
      FROM users
      WHERE is_active = true
    `;
    const params = [title, message, data];
    
    if (userType && userType !== 'all') {
      query += ` AND user_type = $4`;
      params.push(userType);
    }
    
    const result = await pool.query(query, params);
    
    await this.logAdminActivity(null, 'bulk_notification_sent', 
      { userType, title, recipientCount: result.rowCount });
    
    return { sentCount: result.rowCount };
  }


   /* All begins here */


  static async suspendUser(adminId, userId, reason, duration = null) {
    const client =  await pool.connect();
    try{

     await client.query('BEGIN')

    const result = await client.query(
      `UPDATE users 
       SET is_active = false, 
           is_verified = false,
           verification_status = 'suspended',
           verification_notes = $1
       WHERE id = $2
       RETURNING *`,
      [reason, userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    
    const userResult = await client.query(`SELECT * FROM users WHERE id = $1`, [userId]);

    // If artisan, set as unavailable
    const user = userResult.rows[0];

    if(user.user_type === 'artisan'){
    await client.query(
      `UPDATE artisan_profiles SET is_available = false WHERE user_id = $1`,
      [userId]
    );
   }
    
    if (process.env.NODE_ENV === 'production') {
      await NotificationService.sendEmail(
        user.email,
        'Account Suspended',
        `Your account has been suspended. Reason: ${reason}${duration ? ` Duration: ${duration}` : ''}`
      );
    }
    
    logger.info(`User ${userId} suspended: ${reason}`);

     await this.logAdminActivity(adminId, 'suspended_user',  { Reason: reason});

    await client.query('COMMIT');
    delete user.password_hash;
    return user;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
  }
  
  static async activateUser(userId) {
    const result = await pool.query(
      `UPDATE users 
       SET is_active = true, 
           is_verified = true,
           verification_status = 'approved',
           verification_notes = 'Suspension lifted'
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
    const user = result.rows[0];
    delete user.password_hash;
    return user;
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


  // ==================== Payment Management ====================

/**
 * Get all payment transactions with filters
 */
static async getAllPayments(filters = {}) {
  const { status, clientId, artisanId, jobId, page = 1, limit = 20, startDate, endDate } = filters;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT pi.*, 
           j.category, j.service_type,
           cp.full_legal_name as client_name,
           ap.full_legal_name as artisan_name,
           jb.billing_status as job_billing_status
    FROM payment_intents pi
    JOIN jobs j ON pi.job_id = j.id
    LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
    LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
    LEFT JOIN job_billing jb ON j.id = jb.job_id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;
  
  if (status) {
    query += ` AND pi.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (clientId) {
    query += ` AND j.client_id = $${paramIndex}`;
    params.push(clientId);
    paramIndex++;
  }
  
  if (artisanId) {
    query += ` AND j.artisan_id = $${paramIndex}`;
    params.push(artisanId);
    paramIndex++;
  }
  
  if (jobId) {
    query += ` AND pi.job_id = $${paramIndex}`;
    params.push(jobId);
    paramIndex++;
  }
  
  if (startDate) {
    query += ` AND pi.created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  
  if (endDate) {
    query += ` AND pi.created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  
  query += ` ORDER BY pi.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  const countQuery = `
    SELECT COUNT(*) FROM payment_intents pi
    JOIN jobs j ON pi.job_id = j.id
    WHERE 1=1
    ${status ? `AND pi.status = '${status}'` : ''}
    ${clientId ? `AND j.client_id = '${clientId}'` : ''}
    ${artisanId ? `AND j.artisan_id = '${artisanId}'` : ''}
  `;
  const countResult = await pool.query(countQuery);
  
  // Get payment statistics
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total_transactions,
      SUM(amount) as total_amount,
      SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as successful_amount,
      SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END) as failed_amount,
      SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) as refunded_amount,
      COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as successful_count,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
      COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_count
    FROM payment_intents
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  
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
 * Get payment details by ID
 */
static async getPaymentDetails(paymentId) {
  const result = await pool.query(`
    SELECT pi.*, 
           j.category, j.service_type, j.description as job_description,
           cp.full_legal_name as client_name, uc.email as client_email, uc.phone as client_phone,
           ap.full_legal_name as artisan_name, ua.email as artisan_email, ua.phone as artisan_phone,
           jb.base_fee, jb.diagnostics_fee, jb.execution_fee, jb.materials_cost, jb.workmanship_cost,
           (SELECT json_agg(row_to_json(r)) FROM refunds r WHERE r.payment_intent_id = pi.payment_intent_id) as refunds
    FROM payment_intents pi
    JOIN jobs j ON pi.job_id = j.id
    LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
    LEFT JOIN users uc ON uc.id = cp.user_id
    LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
    LEFT JOIN users ua ON ua.id = ap.user_id
    LEFT JOIN job_billing jb ON j.id = jb.job_id
    WHERE pi.id = $1
  `, [paymentId]);
  
  if (result.rows.length === 0) {
    throw new AppError(404, 'Payment not found');
  }
  
  return result.rows[0];
}

/**
 * Process manual refund
 */
static async processRefund(refundId, adminId, notes = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const refundResult = await client.query(
      `SELECT * FROM refunds WHERE id = $1 AND status = 'pending'`,
      [refundId]
    );
    
    if (refundResult.rows.length === 0) {
      throw new AppError(404, 'Refund not found or already processed');
    }
    
    const refund = refundResult.rows[0];
    
    // Update refund status
    await client.query(
      `UPDATE refunds 
       SET status = 'completed', 
           processed_by = $1,
           processed_at = NOW(),
           notes = $2,
           completed_at = NOW()
       WHERE id = $3`,
      [adminId, notes, refundId]
    );
    
    // Update payment intent status
    await client.query(
      `UPDATE payment_intents 
       SET status = 'refunded', refunded_at = NOW()
       WHERE payment_intent_id = $1`,
      [refund.payment_intent_id]
    );
    
    // Update escrow transactions
    await client.query(
      `UPDATE escrow_transactions 
       SET status = 'refunded', refunded_at = NOW(), refund_reason = $1
       WHERE job_id = $2 AND status IN ('held', 'frozen')`,
      [notes, refund.job_id]
    );
    
    await client.query('COMMIT');
    
    await this.logAdminActivity(refundId, 'refund_processed', 
      { refundId, amount: refund.amount, notes });
    
    return { refundId, status: 'completed', amount: refund.amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all refunds
 */
static async getAllRefunds(filters = {}) {
  const { status, jobId, page = 1, limit = 20, startDate, endDate } = filters;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT r.*, 
           j.category, j.service_type,
           cp.full_legal_name as client_name,
           ap.full_legal_name as artisan_name,
           pi.payment_intent_id
    FROM refunds r
    JOIN jobs j ON r.job_id = j.id
    LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
    LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
    LEFT JOIN payment_intents pi ON r.payment_intent_id = pi.payment_intent_id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;
  
  if (status) {
    query += ` AND r.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (jobId) {
    query += ` AND r.job_id = $${paramIndex}`;
    params.push(jobId);
    paramIndex++;
  }
  
  if (startDate) {
    query += ` AND r.created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  
  if (endDate) {
    query += ` AND r.created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  
  query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  const countQuery = `
    SELECT COUNT(*) FROM refunds
    WHERE 1=1
    ${status ? `AND status = '${status}'` : ''}
    ${jobId ? `AND job_id = '${jobId}'` : ''}
  `;
  const countResult = await pool.query(countQuery);
  
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total_refunds,
      SUM(amount) as total_amount,
      AVG(amount) as average_amount,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
    FROM refunds
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  
  return {
    refunds: result.rows,
    statistics: stats.rows[0],
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

// ==================== Bill of Quantities (BOQ) Management ====================

/**
 * Get all BOQs with filters
 */
static async getAllBOQs(filters = {}) {
  const { status, jobId, artisanId, page = 1, limit = 20, startDate, endDate } = filters;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT b.*, 
           j.category, j.service_type,
           cp.full_legal_name as client_name,
           ap.full_legal_name as artisan_name,
           jb.billing_status
    FROM bill_of_quantities b
    JOIN jobs j ON b.job_id = j.id
    LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
    LEFT JOIN artisan_profiles ap ON b.artisan_id = ap.user_id
    LEFT JOIN job_billing jb ON j.id = jb.job_id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;
  
  if (status) {
    query += ` AND b.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (jobId) {
    query += ` AND b.job_id = $${paramIndex}`;
    params.push(jobId);
    paramIndex++;
  }
  
  if (artisanId) {
    query += ` AND b.artisan_id = $${paramIndex}`;
    params.push(artisanId);
    paramIndex++;
  }
  
  if (startDate) {
    query += ` AND b.created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  
  if (endDate) {
    query += ` AND b.created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  
  query += ` ORDER BY b.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  const countQuery = `
    SELECT COUNT(*) FROM bill_of_quantities
    WHERE 1=1
    ${status ? `AND status = '${status}'` : ''}
    ${jobId ? `AND job_id = '${jobId}'` : ''}
  `;
  const countResult = await pool.query(countQuery);
  
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total_boqs,
      COUNT(CASE WHEN status = 'pending_admin_approval' THEN 1 END) as pending_approval,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
      COUNT(CASE WHEN status = 'rejected_by_admin' THEN 1 END) as rejected,
      AVG(total_materials_cost + total_workmanship_cost) as average_value,
      SUM(total_materials_cost + total_workmanship_cost) as total_value
    FROM bill_of_quantities
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  
  return {
    boqs: result.rows,
    statistics: stats.rows[0],
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

/**
 * Get BOQ details by ID
 */
static async getBOQDetails(boqId) {
  const result = await pool.query(`
    SELECT b.*, 
           j.category, j.service_type, j.description as job_description,
           cp.full_legal_name as client_name, cp.email as client_email, cp.phone as client_phone,
           ap.full_legal_name as artisan_name, ap.email as artisan_email, ap.phone as artisan_phone,
           jb.base_fee, jb.diagnostics_fee, jb.execution_fee,
           (SELECT json_agg(row_to_json(sr)) FROM substitution_requests sr WHERE sr.boq_id = b.id) as substitution_requests
    FROM bill_of_quantities b
    JOIN jobs j ON b.job_id = j.id
    LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
    LEFT JOIN artisan_profiles ap ON b.artisan_id = ap.user_id
    LEFT JOIN job_billing jb ON j.id = jb.job_id
    WHERE b.id = $1
  `, [boqId]);
  
  if (result.rows.length === 0) {
    throw new AppError(404, 'BOQ not found');
  }
  
  return result.rows[0];
}

/**
 * Admin approve BOQ (override)
 */
static async adminApproveBOQ(boqId, adminId, notes = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const boqResult = await client.query(
      `SELECT * FROM bill_of_quantities WHERE id = $1`,
      [boqId]
    );
    
    if (boqResult.rows.length === 0) {
      throw new AppError(404, 'BOQ not found');
    }
    
    const boq = boqResult.rows[0];
    
    await client.query(
      `UPDATE bill_of_quantities 
       SET status = 'approved', 
           admin_approved = true,
           admin_approved_at = NOW(),
           admin_id = $1,
           admin_notes = $2
       WHERE id = $3`,
      [adminId, notes, boqId]
    );
    
    // Update job billing with BOQ costs
    await client.query(
      `UPDATE job_billing 
       SET materials_cost = $1,
           workmanship_cost = $2
       WHERE job_id = $3`,
      [boq.total_materials_cost, boq.total_workmanship_cost, boq.job_id]
    );
    
    await client.query('COMMIT');
    
    await this.logAdminActivity(boqId, 'boq_approved', 
      { boqId, jobId: boq.job_id, notes });
    
    return boq;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Admin reject BOQ
 */
static async adminRejectBOQ(boqId, adminId, reason) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      `UPDATE bill_of_quantities 
       SET status = 'rejected_by_admin',
           admin_approved = false,
           rejection_reason = $1,
           rejected_at = NOW(),
           admin_id = $2
       WHERE id = $3
       RETURNING *`,
      [reason, adminId, boqId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'BOQ not found');
    }
    
    await client.query('COMMIT');
    
    await this.logAdminActivity(boqId, 'boq_rejected', 
      { boqId, reason });
    
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ==================== Settlement Management ====================

/**
 * Get all settlements (artisan payouts)
 */
static async getAllSettlements(filters = {}) {
  const { status, artisanId, page = 1, limit = 20, startDate, endDate } = filters;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT ap.*, 
           j.category, j.service_type,
           cp.full_legal_name as client_name,
           ap_art.full_legal_name as artisan_name,
           pi.payment_intent_id
    FROM artisan_payouts ap
    JOIN jobs j ON ap.job_id = j.id
    LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
    LEFT JOIN artisan_profiles ap_art ON ap.artisan_id = ap_art.user_id
    LEFT JOIN payment_intents pi ON j.id = pi.job_id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;
  
  if (status) {
    query += ` AND ap.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (artisanId) {
    query += ` AND ap.artisan_id = $${paramIndex}`;
    params.push(artisanId);
    paramIndex++;
  }
  
  if (startDate) {
    query += ` AND ap.created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  
  if (endDate) {
    query += ` AND ap.created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  
  query += ` ORDER BY ap.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  const countQuery = `
    SELECT COUNT(*) FROM artisan_payouts
    WHERE 1=1
    ${status ? `AND status = '${status}'` : ''}
    ${artisanId ? `AND artisan_id = '${artisanId}'` : ''}
  `;
  const countResult = await pool.query(countQuery);
  
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total_payouts,
      SUM(amount) as total_amount,
      AVG(amount) as average_amount,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_count,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
    FROM artisan_payouts
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  
  return {
    settlements: result.rows,
    statistics: stats.rows[0],
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

/**
 * Process settlement payout
 */
static async processSettlement(payoutId, adminId, transferReference = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const payoutResult = await client.query(
      `SELECT * FROM artisan_payouts WHERE id = $1 AND status = 'pending'`,
      [payoutId]
    );
    
    if (payoutResult.rows.length === 0) {
      throw new AppError(404, 'Settlement not found or already processed');
    }
    
    const payout = payoutResult.rows[0];
    
    await client.query(
      `UPDATE artisan_payouts 
       SET status = 'processing',
           processed_by = $1,
           processed_at = NOW(),
           transfer_reference = $2
       WHERE id = $3`,
      [adminId, transferReference, payoutId]
    );
    
    await client.query('COMMIT');
    
    await this.logAdminActivity(payoutId, 'settlement_processed', 
      { payoutId, amount: payout.amount, transferReference });
    
    return { payoutId, status: 'processing', amount: payout.amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Confirm settlement completion
 */
static async completeSettlement(payoutId, adminId, transactionId = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      `UPDATE artisan_payouts 
       SET status = 'completed',
           completed_at = NOW(),
           transaction_id = COALESCE($1, transaction_id)
       WHERE id = $2 AND status = 'processing'
       RETURNING *`,
      [transactionId, payoutId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Settlement not found or not in processing state');
    }
    
    await client.query('COMMIT');
    
    await this.logAdminActivity(payoutId, 'settlement_completed', 
      { payoutId, transactionId });
    
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Fail settlement
 */
static async failSettlement(payoutId, adminId, reason) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      `UPDATE artisan_payouts 
       SET status = 'failed',
           failure_reason = $1,
           failed_at = NOW()
       WHERE id = $2 AND status IN ('pending', 'processing')
       RETURNING *`,
      [reason, payoutId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Settlement not found');
    }
    
    await client.query('COMMIT');
    
    await this.logAdminActivity(payoutId, 'settlement_failed', 
      { payoutId, reason });
    
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ==================== Withdrawal Management ====================

/**
 * Get all withdrawal requests
 */
static async getAllWithdrawals(filters = {}) {
  const { status, artisanId, page = 1, limit = 20, startDate, endDate } = filters;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT w.*, 
           ap.full_legal_name as artisan_name,
           ap.email as artisan_email,
           ap.phone as artisan_phone,
           u.email as user_email
    FROM withdrawals w
    JOIN artisan_profiles ap ON w.artisan_id = ap.user_id
    JOIN users u ON w.artisan_id = u.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;
  
  if (status) {
    query += ` AND w.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (artisanId) {
    query += ` AND w.artisan_id = $${paramIndex}`;
    params.push(artisanId);
    paramIndex++;
  }
  
  if (startDate) {
    query += ` AND w.created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  
  if (endDate) {
    query += ` AND w.created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  
  query += ` ORDER BY w.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  const countQuery = `
    SELECT COUNT(*) FROM withdrawals
    WHERE 1=1
    ${status ? `AND status = '${status}'` : ''}
    ${artisanId ? `AND artisan_id = '${artisanId}'` : ''}
  `;
  const countResult = await pool.query(countQuery);
  
  const stats = await pool.query(`
    SELECT 
      COUNT(*) as total_withdrawals,
      SUM(amount) as total_amount,
      AVG(amount) as average_amount,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_count,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
    FROM withdrawals
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  
  return {
    withdrawals: result.rows,
    statistics: stats.rows[0],
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

/**
 * Process withdrawal request
 */
static async processWithdrawal(withdrawalId, adminId, action, notes = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const withdrawalResult = await client.query(
      `SELECT * FROM withdrawals WHERE id = $1 AND status = 'pending'`,
      [withdrawalId]
    );
    
    if (withdrawalResult.rows.length === 0) {
      throw new AppError(404, 'Withdrawal not found or already processed');
    }
    
    const withdrawal = withdrawalResult.rows[0];
    let newStatus;
    
    if (action === 'approve') {
      newStatus = 'processing';
    } else if (action === 'reject') {
      newStatus = 'failed';
    } else {
      throw new AppError(400, 'Invalid action. Use "approve" or "reject"');
    }
    
    await client.query(
      `UPDATE withdrawals 
       SET status = $1,
           processed_by = $2,
           processed_at = NOW(),
           admin_notes = $3
       WHERE id = $4`,
      [newStatus, adminId, notes, withdrawalId]
    );
    
    // If approved, create payout record
    if (action === 'approve') {
      await client.query(
        `INSERT INTO artisan_payouts (artisan_id, amount, status, transfer_reference)
         VALUES ($1, $2, 'pending', $3)`,
        [withdrawal.artisan_id, withdrawal.amount, withdrawal.reference]
      );
    }
    
    await client.query('COMMIT');
    
    await this.logAdminActivity(withdrawalId, `withdrawal_${action}d`, 
      { withdrawalId, amount: withdrawal.amount, notes });
    
    return { withdrawalId, status: newStatus, amount: withdrawal.amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ==================== Escrow Management ====================

/**
 * Get all escrow transactions
 */
static async getAllEscrowTransactions(filters = {}) {
  const { status, jobId, page = 1, limit = 20, startDate, endDate } = filters;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT et.*, 
           j.category, j.service_type,
           cp.full_legal_name as client_name,
           ap.full_legal_name as artisan_name
    FROM escrow_transactions et
    JOIN jobs j ON et.job_id = j.id
    LEFT JOIN client_profiles cp ON et.client_id = cp.user_id
    LEFT JOIN artisan_profiles ap ON et.artisan_id = ap.user_id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;
  
  if (status) {
    query += ` AND et.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (jobId) {
    query += ` AND et.job_id = $${paramIndex}`;
    params.push(jobId);
    paramIndex++;
  }
  
  if (startDate) {
    query += ` AND et.created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  
  if (endDate) {
    query += ` AND et.created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  
  query += ` ORDER BY et.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  const countQuery = `
    SELECT COUNT(*) FROM escrow_transactions
    WHERE 1=1
    ${status ? `AND status = '${status}'` : ''}
    ${jobId ? `AND job_id = '${jobId}'` : ''}
  `;
  const countResult = await pool.query(countQuery);
  
  const stats = await pool.query(`
    SELECT 
      SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END) as total_held,
      SUM(CASE WHEN status = 'frozen' THEN amount ELSE 0 END) as total_frozen,
      SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END) as total_released,
      SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) as total_refunded,
      COUNT(*) as total_transactions
    FROM escrow_transactions
  `);
  
  return {
    transactions: result.rows,
    statistics: stats.rows[0],
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

/**
 * Release frozen escrow funds
 */
static async releaseFrozenEscrow(transactionId, reason, adminId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      `UPDATE escrow_transactions 
       SET status = 'released', 
           release_date = NOW(),
           released_by = $1,
           release_reason = $2
       WHERE id = $3 AND status = 'frozen'
       RETURNING *`,
      [adminId, reason, transactionId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Transaction not found or not frozen');
    }
    
    await client.query('COMMIT');
    
    await this.logAdminActivity(adminId, 'escrow_released', 
      { transactionId, amount: result.rows[0].amount, reason });
    
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get escrow summary
 */
static async getEscrowSummary() {
  const result = await pool.query(`
    SELECT 
      SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END) as total_held,
      SUM(CASE WHEN status = 'frozen' THEN amount ELSE 0 END) as total_frozen,
      SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END) as total_released,
      SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) as total_refunded,
      COUNT(CASE WHEN status = 'held' THEN 1 END) as held_count,
      COUNT(CASE WHEN status = 'frozen' THEN 1 END) as frozen_count,
      COUNT(CASE WHEN status = 'released' THEN 1 END) as released_count,
      COUNT(DISTINCT job_id) as unique_jobs
    FROM escrow_transactions
  `);
  
  const byJobType = await pool.query(`
    SELECT 
      j.category,
      SUM(et.amount) as total_amount,
      COUNT(*) as transaction_count
    FROM escrow_transactions et
    JOIN jobs j ON et.job_id = j.id
    WHERE et.status IN ('held', 'frozen')
    GROUP BY j.category
    ORDER BY total_amount DESC
  `);
  
  return {
    summary: result.rows[0],
    byCategory: byJobType.rows
  };
}

}

module.exports = AdminService;
