const { pool } = require('../config/database');
const Wallet = require('./Wallet');

class Artisan {
  static async create(artisanData) {
    const { 
      userId, fullLegalName, nin, passportPhotoUrl, residentialAddress, 
      skillCategory, subCategories, onboardingFeePaid 
    } = artisanData;
    
    const result = await pool.query(
      `INSERT INTO artisan_profiles 
       (user_id, full_legal_name, nin, passport_photo_url, residential_address, 
        skill_category, sub_categories, onboarding_fee_paid, tier_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
       RETURNING *`,
      [userId, fullLegalName, nin, passportPhotoUrl, residentialAddress, 
       skillCategory, subCategories || [], onboardingFeePaid || false]
    );
    
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT ap.*, u.email, u.phone, u.is_verified, u.verification_status, u.is_active
       FROM artisan_profiles ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT ap.*, u.email, u.phone, u.is_verified, u.verification_status, u.is_active
       FROM artisan_profiles ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  static async update(userId, updates) {
    const allowedFields = [
      'full_legal_name', 'passport_photo_url', 'residential_address', 
      'skill_category', 'sub_categories', 'tier_level', 'is_available',
      'current_location', 'monthly_fee_status'
    ];
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
    
    values.push(userId);
    const query = `
      UPDATE artisan_profiles 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE user_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async updateTier(userId, tierLevel, reason = null) {
    const result = await pool.query(
      `UPDATE artisan_profiles 
       SET tier_level = $1, tier_updated_at = NOW(), tier_update_reason = $2
       WHERE user_id = $3
       RETURNING *`,
      [tierLevel, reason, userId]
    );
    
    // Log tier change
    await pool.query(
      `INSERT INTO tier_change_logs (artisan_id, old_tier, new_tier, reason)
       SELECT user_id, tier_level, $1, $2
       FROM artisan_profiles WHERE user_id = $3`,
      [tierLevel, reason, userId]
    );
    
    return result.rows[0];
  }

  static async updateRating(artisanId) {
    const result = await pool.query(
      `UPDATE artisan_profiles ap
       SET star_rating = (
         SELECT COALESCE(AVG(rating), 0)
         FROM ratings
         WHERE reviewee_id = ap.user_id
       ),
       total_ratings = (
         SELECT COUNT(*)
         FROM ratings
         WHERE reviewee_id = ap.user_id
       )
       WHERE ap.user_id = $1
       RETURNING *`,
      [artisanId]
    );
    return result.rows[0];
  }

  static async updateCompletionRate(artisanId) {
    const result = await pool.query(
      `UPDATE artisan_profiles ap
       SET completion_rate = (
         SELECT 
           CASE 
             WHEN COUNT(*) = 0 THEN 0
             ELSE (COUNT(CASE WHEN job_status = 'completed' THEN 1 END)::float / COUNT(*) * 100)
           END
         FROM jobs
         WHERE artisan_id = ap.user_id
       )
       WHERE ap.user_id = $1
       RETURNING *`,
      [artisanId]
    );
    return result.rows[0];
  }

  static async getAvailableArtisans(category, location, radius = 10) {
    let query = `
      SELECT ap.*, u.email, u.phone,
             ST_Distance(
               ST_SetSRID(ST_MakePoint($1, $2), 4326),
               ST_SetSRID(ST_MakePoint(
                 (ap.current_location->>'longitude')::float,
                 (ap.current_location->>'latitude')::float
               ), 4326)
             ) as distance
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE ap.is_available = true 
        AND u.is_active = true
        AND ap.monthly_fee_status = 'paid'
        AND ap.is_verified = true
    `;
    
    const params = [location.longitude, location.latitude];
    
    if (category) {
      query += ` AND ap.skill_category = $3`;
      params.push(category);
    }
    
    query += ` HAVING ST_Distance(...) <= $${params.length + 1} * 1000`;
    params.push(radius);
    
    query += ` ORDER BY distance ASC, ap.tier_level DESC, ap.star_rating DESC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getEarnings(artisanId, startDate = null, endDate = null) {
    let query = `
      SELECT 
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_earned,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_earnings,
        COUNT(*) as total_jobs,
        AVG(amount) as average_earning
      FROM artisan_payouts
      WHERE artisan_id = $1
    `;
    
    const params = [artisanId];
    let paramIndex = 2;
    
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
    
    const result = await pool.query(query, params);
    return result.rows[0];
  }

  static async getWithdrawalHistory(artisanId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT * FROM withdrawals 
       WHERE artisan_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [artisanId, limit, offset]
    );
    
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM withdrawals WHERE artisan_id = $1`,
      [artisanId]
    );
    
    return {
      withdrawals: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async requestWithdrawal(artisanId, amount, bankDetails) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if sufficient balance
      const earnings = await this.getEarnings(artisanId);
      
      if (earnings.pending_earnings < amount) {
        throw new Error('Insufficient balance');
      }
      
      // Create withdrawal request
      const result = await client.query(
        `INSERT INTO withdrawals (artisan_id, amount, bank_code, account_number, account_name, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        [artisanId, amount, bankDetails.bankCode, bankDetails.accountNumber, bankDetails.accountName]
      );
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getTools(artisanId) {
    const result = await pool.query(
      `SELECT * FROM artisan_tools 
       WHERE artisan_id = $1 
       ORDER BY created_at DESC`,
      [artisanId]
    );
    return result.rows;
  }

  static async addTool(artisanId, toolData) {
    const { name, quantity, condition, notes } = toolData;
    
    const result = await pool.query(
      `INSERT INTO artisan_tools (artisan_id, name, quantity, condition, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [artisanId, name, quantity, condition, notes]
    );
    
    return result.rows[0];
  }

  static async updateTool(toolId, updates) {
    const { quantity, condition, notes } = updates;
    
    const result = await pool.query(
      `UPDATE artisan_tools 
       SET quantity = COALESCE($1, quantity),
           condition = COALESCE($2, condition),
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [quantity, condition, notes, toolId]
    );
    
    return result.rows[0];
  }

  static async getSchedule(artisanId, date) {
    const result = await pool.query(
      `SELECT * FROM artisan_schedules 
       WHERE artisan_id = $1 AND date = $2
       ORDER BY start_time`,
      [artisanId, date]
    );
    return result.rows;
  }

  static async setSchedule(artisanId, scheduleData) {
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
      [artisanId, dayOfWeek, startTime, endTime, isAvailable]
    );
    
    return result.rows[0];
  }

  static async getWalletBalance(artisanId) {
    return Wallet.getBalance(artisanId);
  }

  /*
  static async requestWithdrawal(artisanId, amount, bankDetails) {
    return  Wallet.requestWithdrawal(artisanId, amount, bankDetails);
  }

  static async getWithdrawalHistory(artisanId, filters) {
    return Wallet.getWithdrawalRequests(artisanId, filters);
  }
  */

}

module.exports = Artisan;