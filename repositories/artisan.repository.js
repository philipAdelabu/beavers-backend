const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class ArtisanRepository {
  /**
   * Create artisan profile
   * @param {Object} profileData - Artisan profile data
   * @returns {Promise<Object>} Created profile
   */
  static async create(profileData) {
    const { 
      userId, fullLegalName, nin, passportPhotoUrl, residentialAddress, 
      skillCategory, subCategories, onboardingFeePaid 
    } = profileData;
    
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

  /**
   * Find artisan profile by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Artisan profile or null
   */
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT ap.*, u.email, u.phone, u.is_verified, u.verification_status, u.is_active, u.created_at
       FROM artisan_profiles ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.user_id = $1`,
      [userId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Find artisan profile by ID
   * @param {string} id - Profile ID
   * @returns {Promise<Object|null>} Artisan profile or null
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT ap.*, u.email, u.phone, u.is_verified, u.verification_status, u.is_active
       FROM artisan_profiles ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.id = $1`,
      [id]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Update artisan profile
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated profile or null
   */
  static async update(userId, updates) {
    const allowedFields = [
      'full_legal_name', 'passport_photo_url', 'residential_address', 
      'skill_category', 'sub_categories', 'tier_level', 'is_available',
      'current_location', 'monthly_fee_status', 'documents', 'bank_details',
      'stripe_customer_id', 'stripe_subscription_id', 'subscription_status'
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
    return result.rows[0] || null;
  }

  /**
   * Update artisan tier
   * @param {string} userId - User ID
   * @param {number} tierLevel - New tier level (1-3)
   * @param {string} reason - Reason for tier change
   * @returns {Promise<Object|null>} Updated profile or null
   */
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
    
    return result.rows[0] || null;
  }

  /**
   * Update artisan rating
   * @param {string} artisanId - Artisan user ID
   * @returns {Promise<Object|null>} Updated profile or null
   */
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
    
    return result.rows[0] || null;
  }

  /**
   * Update completion rate
   * @param {string} artisanId - Artisan user ID
   * @returns {Promise<Object|null>} Updated profile or null
   */
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
    
    return result.rows[0] || null;
  }

  /**
   * Get available artisans by location and category
   * @param {Object} location - { latitude, longitude }
   * @param {string} category - Skill category
   * @param {number} radius - Search radius in km
   * @returns {Promise<Array>} Available artisans
   */
  static async getAvailableArtisans(location, category = null, radius = 10) {
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
        AND ap.current_location IS NOT NULL
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

  /**
   * Get artisan earnings
   * @param {string} artisanId - Artisan user ID
   * @param {string} startDate - Start date (optional)
   * @param {string} endDate - End date (optional)
   * @returns {Promise<Object>} Earnings summary
   */
  static async getEarnings(artisanId, startDate = null, endDate = null) {
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
    
    const params = [artisanId];
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
    return result.rows[0];
  }

  /**
   * Get monthly earnings breakdown
   * @param {string} artisanId - Artisan user ID
   * @returns {Promise<Array>} Monthly earnings
   */
  static async getMonthlyEarnings(artisanId) {
    const result = await pool.query(`
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
    `, [artisanId]);
    
    return result.rows;
  }

  /**
   * Get artisan tools
   * @param {string} artisanId - Artisan user ID
   * @returns {Promise<Array>} Tools
   */
  static async getTools(artisanId) {
    const result = await pool.query(
      `SELECT * FROM artisan_tools 
       WHERE artisan_id = $1 
       ORDER BY created_at DESC`,
      [artisanId]
    );
    
    return result.rows;
  }

  /**
   * Add artisan tool
   * @param {string} artisanId - Artisan user ID
   * @param {Object} toolData - Tool data
   * @returns {Promise<Object>} Created tool
   */
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

  /**
   * Update artisan tool
   * @param {string} toolId - Tool ID
   * @param {string} artisanId - Artisan user ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated tool or null
   */
  static async updateTool(toolId, artisanId, updates) {
    const { quantity, condition, notes } = updates;
    
    const result = await pool.query(
      `UPDATE artisan_tools 
       SET quantity = COALESCE($1, quantity),
           condition = COALESCE($2, condition),
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4 AND artisan_id = $5
       RETURNING *`,
      [quantity, condition, notes, toolId, artisanId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get artisan schedule
   * @param {string} artisanId - Artisan user ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @returns {Promise<Array>} Schedule
   */
  static async getSchedule(artisanId, date) {
    const result = await pool.query(
      `SELECT * FROM artisan_schedules 
       WHERE artisan_id = $1 AND date = $2
       ORDER BY start_time`,
      [artisanId, date]
    );
    
    return result.rows;
  }

  /**
   * Set artisan schedule
   * @param {string} artisanId - Artisan user ID
   * @param {Object} scheduleData - Schedule data
   * @returns {Promise<Object>} Created/updated schedule
   */
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

  /**
   * Get artisan statistics
   * @param {string} artisanId - Artisan user ID
   * @returns {Promise<Object>} Statistics
   */
  static async getStatistics(artisanId) {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
        COALESCE(SUM(jb.workmanship_cost), 0) as total_earnings,
        COALESCE(AVG(jb.workmanship_cost), 0) as average_earning
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.artisan_id = $1
    `, [artisanId]);
    
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
    `, [artisanId]);
    
    return {
      ...stats.rows[0],
      categoryBreakdown: categoryBreakdown.rows
    };
  }

  /**
   * Get artisan performance metrics
   * @param {string} artisanId - Artisan user ID
   * @returns {Promise<Object>} Performance metrics
   */
  static async getPerformanceMetrics(artisanId) {
    const result = await pool.query(`
      SELECT 
        ap.star_rating,
        ap.total_ratings,
        ap.completion_rate,
        ap.trust_score,
        ap.tier_level,
        (SELECT COUNT(*) FROM jobs WHERE artisan_id = $1 AND job_status = 'completed') as total_completed_jobs,
        (SELECT AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))) FROM jobs WHERE artisan_id = $1 AND accepted_at IS NOT NULL) as avg_response_time_seconds,
        (SELECT AVG(EXTRACT(EPOCH FROM (completed_at - accepted_at))) FROM jobs WHERE artisan_id = $1 AND completed_at IS NOT NULL) as avg_completion_time_seconds
      FROM artisan_profiles ap
      WHERE ap.user_id = $1
    `, [artisanId]);
    
    return result.rows[0];
  }
}

module.exports = ArtisanRepository;