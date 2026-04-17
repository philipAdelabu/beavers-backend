const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel, addArtisanLocation } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');
const moment = require('moment');

class ArtisanService {
  static async getProfile(userId) {
    const cacheKey = `artisan:profile:${userId}`;
    let profile = await cacheGet(cacheKey);
    
    if (!profile) {
      const result = await pool.query(
        `SELECT ap.*, u.email, u.phone, u.is_verified, u.verification_status, 
                u.is_active, u.created_at
         FROM artisan_profiles ap
         JOIN users u ON ap.user_id = u.id
         WHERE ap.user_id = $1`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Artisan profile not found');
      }
      
      profile = result.rows[0];
      await cacheSet(cacheKey, profile, 3600);
    }
    
    return profile;
  }
  
  static async updateProfile(userId, updateData) {
    const allowedFields = ['full_legal_name', 'residential_address', 'skill_category', 'sub_categories'];
    const updates = {};
    
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    }
    
    if (Object.keys(updates).length === 0) {
      throw new AppError(400, 'No valid fields to update');
    }
    
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      setClause.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    
    values.push(userId);
    const query = `
      UPDATE artisan_profiles 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE user_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Artisan profile not found');
    }
    
    await cacheDel(`artisan:profile:${userId}`);
    
    logger.info(`Artisan profile updated: ${userId}`);
    
    return result.rows[0];
  }
  
  static async updateAvailability(userId, isAvailable, location = null) {
    const result = await pool.query(
      `UPDATE artisan_profiles 
       SET is_available = $1, 
           last_location_update = NOW(),
           current_location = COALESCE($2, current_location)
       WHERE user_id = $3
       RETURNING *`,
      [isAvailable, location ? JSON.stringify(location) : null, userId]
    );
    
    if (isAvailable && location) {
      await addArtisanLocation(userId, location.longitude, location.latitude);
    }
    
    await cacheDel(`artisan:profile:${userId}`);
    await cacheDel(`artisan:availability:${userId}`);
    
    logger.info(`Artisan availability updated: ${userId} -> ${isAvailable}`);
    
    return result.rows[0];
  }
  
  static async getEarnings(userId, startDate = null, endDate = null) {
    let query = `
      SELECT 
        COALESCE(SUM(jb.workmanship_cost), 0) as total_earnings,
        COALESCE(SUM(CASE WHEN jb.billing_status = 'paid' THEN jb.workmanship_cost ELSE 0 END), 0) as paid_earnings,
        COALESCE(SUM(CASE WHEN jb.billing_status = 'pending' THEN jb.workmanship_cost ELSE 0 END), 0) as pending_earnings,
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as completed_jobs,
        AVG(jb.workmanship_cost) as average_earning
      FROM jobs j
      JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.artisan_id = $1 AND j.job_status = 'completed'
    `;
    
    const params = [userId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND j.completed_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND j.completed_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    const result = await pool.query(query, params);
    
    // Get monthly breakdown
    const monthlyBreakdown = await pool.query(`
      SELECT 
        DATE_TRUNC('month', j.completed_at) as month,
        COALESCE(SUM(jb.workmanship_cost), 0) as earnings,
        COUNT(*) as jobs_completed
      FROM jobs j
      JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.artisan_id = $1 AND j.job_status = 'completed'
        AND j.completed_at > NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', j.completed_at)
      ORDER BY month DESC
    `, [userId]);
    
    return {
      summary: result.rows[0],
      monthlyBreakdown: monthlyBreakdown.rows
    };
  }
  
  static async requestWithdrawal(userId, amount, bankDetails) {
    const earnings = await this.getEarnings(userId);
    
    if (parseFloat(earnings.summary.pending_earnings) < amount) {
      throw new AppError(400, 'Insufficient balance for withdrawal');
    }
    
    const result = await pool.query(
      `INSERT INTO withdrawals (artisan_id, amount, bank_code, account_number, account_name, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [userId, amount, bankDetails.bankCode, bankDetails.accountNumber, bankDetails.accountName]
    );
    
    logger.info(`Withdrawal requested: ${userId} - ${amount}`);
    
    return result.rows[0];
  }
  
  static async getWithdrawalHistory(userId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT * FROM withdrawals 
       WHERE artisan_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM withdrawals WHERE artisan_id = $1`,
      [userId]
    );
    
    return {
      withdrawals: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async updateTier(userId, newTier, reason = null) {
    const result = await pool.query(
      `UPDATE artisan_profiles 
       SET tier_level = $1, tier_updated_at = NOW(), tier_update_reason = $2
       WHERE user_id = $3
       RETURNING *`,
      [newTier, reason, userId]
    );
    
    await cacheDel(`artisan:profile:${userId}`);
    
    // Send notification
    await NotificationService.sendPushNotification(
      userId,
      'Tier Upgrade',
      `Congratulations! You have been upgraded to Tier ${newTier}`,
      { type: 'tier_upgrade', newTier }
    );
    
    logger.info(`Artisan tier updated: ${userId} -> Tier ${newTier}`);
    
    return result.rows[0];
  }
  
  static async getPerformanceMetrics(userId) {
    const metrics = await pool.query(`
      SELECT 
        ap.star_rating,
        ap.total_ratings,
        ap.completion_rate,
        ap.trust_score,
        ap.tier_level,
        (SELECT COUNT(*) FROM jobs WHERE artisan_id = $1 AND job_status = 'completed') as total_completed_jobs,
        (SELECT AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))) FROM jobs WHERE artisan_id = $1 AND accepted_at IS NOT NULL) as avg_response_time,
        (SELECT AVG(EXTRACT(EPOCH FROM (completed_at - accepted_at))) FROM jobs WHERE artisan_id = $1 AND completed_at IS NOT NULL) as avg_completion_time
      FROM artisan_profiles ap
      WHERE ap.user_id = $1
    `, [userId]);
    
    // Get rating distribution
    const ratingDistribution = await pool.query(`
      SELECT 
        rating,
        COUNT(*) as count
      FROM ratings
      WHERE reviewee_id = $1
      GROUP BY rating
      ORDER BY rating DESC
    `, [userId]);
    
    return {
      ...metrics.rows[0],
      ratingDistribution: ratingDistribution.rows
    };
  }
  
  static async getSchedule(userId, date) {
    const result = await pool.query(
      `SELECT * FROM artisan_schedules 
       WHERE artisan_id = $1 AND date = $2
       ORDER BY start_time`,
      [userId, date]
    );
    return result.rows;
  }
  
  static async setSchedule(userId, scheduleData) {
    const { dayOfWeek, startTime, endTime, isAvailable } = scheduleData;
    
    const result = await pool.query(
      `INSERT INTO artisan_schedules (artisan_id, day_of_week, start_time, end_time, is_available)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (artisan_id, day_of_week) 
       DO UPDATE SET start_time = EXCLUDED.start_time,
                     end_time = EXCLUDED.end_time,
                     is_available = EXCLUDED.is_available,
                     updated_at = NOW()
       RETURNING *`,
      [userId, dayOfWeek, startTime, endTime, isAvailable]
    );
    
    await cacheDel(`artisan:schedule:${userId}`);
    
    return result.rows[0];
  }
  
  static async getTools(userId) {
    const result = await pool.query(
      `SELECT * FROM artisan_tools 
       WHERE artisan_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }
  
  static async addTool(userId, toolData) {
    const { name, quantity, condition, notes } = toolData;
    
    const result = await pool.query(
      `INSERT INTO artisan_tools (artisan_id, name, quantity, condition, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, name, quantity, condition, notes]
    );
    
    return result.rows[0];
  }
  
  static async updateTool(toolId, userId, updateData) {
    const { quantity, condition, notes } = updateData;
    
    const result = await pool.query(
      `UPDATE artisan_tools 
       SET quantity = COALESCE($1, quantity),
           condition = COALESCE($2, condition),
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4 AND artisan_id = $5
       RETURNING *`,
      [quantity, condition, notes, toolId, userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Tool not found');
    }
    
    return result.rows[0];
  }
  
  static async getUpcomingJobs(userId, limit = 10) {
    const result = await pool.query(
      `SELECT j.*, cp.full_legal_name as client_name, cp.phone as client_phone,
              cp.service_address, jb.billing_status
       FROM jobs j
       JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN job_billing jb ON j.id = jb.job_id
       WHERE j.artisan_id = $1 
         AND j.job_status IN ('accepted', 'arrived', 'diagnostics', 'execution')
       ORDER BY j.created_at ASC
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }
  
  static async getStatistics(userId) {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
        COUNT(CASE WHEN job_status IN ('pending', 'accepted') THEN 1 END) as pending_jobs,
        COALESCE(SUM(jb.workmanship_cost), 0) as total_earnings
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.artisan_id = $1
    `, [userId]);
    
    const categoryBreakdown = await pool.query(`
      SELECT 
        category,
        COUNT(*) as job_count,
        COALESCE(AVG(jb.workmanship_cost), 0) as avg_earning
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.artisan_id = $1 AND j.job_status = 'completed'
      GROUP BY category
      ORDER BY job_count DESC
    `, [userId]);
    
    return {
      ...stats.rows[0],
      categoryBreakdown: categoryBreakdown.rows
    };
  }
  
  static async checkMonthlyFeeStatus(userId) {
    const result = await pool.query(
      `SELECT monthly_fee_status, last_fee_payment 
       FROM artisan_profiles 
       WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Artisan not found');
    }
    
    const status = result.rows[0];
    const lastPayment = status.last_fee_payment;
    const daysSinceLastPayment = lastPayment ? moment().diff(moment(lastPayment), 'days') : 31;
    
    if (daysSinceLastPayment > 30 && status.monthly_fee_status === 'paid') {
      await pool.query(
        `UPDATE artisan_profiles 
         SET monthly_fee_status = 'pending'
         WHERE user_id = $1`,
        [userId]
      );
      status.monthly_fee_status = 'pending';
    }
    
    return status;
  }
}

module.exports = ArtisanService;