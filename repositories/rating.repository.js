const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class RatingRepository {
  /**
   * Create rating
   * @param {Object} ratingData - Rating data
   * @returns {Promise<Object>} Created rating
   */
  static async create(ratingData) {
    const { jobId, reviewerId, revieweeId, rating, review, categories } = ratingData;
    
    const result = await pool.query(
      `INSERT INTO ratings 
       (job_id, reviewer_id, reviewee_id, rating, review, categories)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [jobId, reviewerId, revieweeId, rating, review, categories || {}]
    );
    
    return result.rows[0];
  }

  /**
   * Find rating by ID
   * @param {string} ratingId - Rating ID
   * @returns {Promise<Object|null>} Rating or null
   */
  static async findById(ratingId) {
    const result = await pool.query(
      `SELECT r.*, 
              CASE WHEN r.reviewer_id = cp.user_id THEN cp.full_legal_name 
                   ELSE ap.full_legal_name 
              END as reviewer_name
       FROM ratings r
       LEFT JOIN client_profiles cp ON r.reviewer_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON r.reviewer_id = ap.user_id
       WHERE r.id = $1`,
      [ratingId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Find rating by job ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Array>} Ratings
   */
  static async findByJobId(jobId) {
    const result = await pool.query(
      `SELECT r.*, 
              CASE WHEN r.reviewer_id = cp.user_id THEN cp.full_legal_name 
                   ELSE ap.full_legal_name 
              END as reviewer_name
       FROM ratings r
       LEFT JOIN client_profiles cp ON r.reviewer_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON r.reviewer_id = ap.user_id
       WHERE r.job_id = $1`,
      [jobId]
    );
    
    return result.rows;
  }

  /**
   * Get artisan ratings with pagination
   * @param {string} artisanId - Artisan ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Ratings and statistics
   */
  static async getArtisanRatings(artisanId, filters = {}) {
    const { page = 1, limit = 10, minRating, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT r.*, cp.full_legal_name as reviewer_name,
             j.category, j.service_type
      FROM ratings r
      JOIN client_profiles cp ON r.reviewer_id = cp.user_id
      JOIN jobs j ON r.job_id = j.id
      WHERE r.reviewee_id = $1
    `;
    const params = [artisanId];
    let paramIndex = 2;
    
    if (minRating) {
      query += ` AND r.rating >= $${paramIndex}`;
      params.push(minRating);
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
      SELECT COUNT(*) FROM ratings WHERE reviewee_id = $1
      ${minRating ? 'AND rating >= $2' : ''}
    `;
    const countParams = minRating ? [artisanId, minRating] : [artisanId];
    const countResult = await pool.query(countQuery, countParams);
    
    // Get rating statistics
    const statsResult = await pool.query(`
      SELECT 
        AVG(rating) as average_rating,
        COUNT(*) as total_ratings,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
      FROM ratings
      WHERE reviewee_id = $1
    `, [artisanId]);
    
    return {
      ratings: result.rows,
      statistics: statsResult.rows[0],
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Get client ratings
   * @param {string} clientId - Client ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Ratings
   */
  static async getClientRatings(clientId, filters = {}) {
    const { page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT r.*, ap.full_legal_name as reviewee_name,
              j.category, j.service_type
       FROM ratings r
       JOIN artisan_profiles ap ON r.reviewee_id = ap.user_id
       JOIN jobs j ON r.job_id = j.id
       WHERE r.reviewer_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [clientId, limit, offset]
    );
    
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ratings WHERE reviewer_id = $1`,
      [clientId]
    );
    
    return {
      ratings: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Update rating
   * @param {string} ratingId - Rating ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated rating or null
   */
  static async update(ratingId, updates) {
    const allowedFields = ['rating', 'review', 'categories'];
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
    
    values.push(ratingId);
    const query = `
      UPDATE ratings 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Delete rating
   * @param {string} ratingId - Rating ID
   * @returns {Promise<Object|null>} Deleted rating or null
   */
  static async delete(ratingId) {
    const result = await pool.query(
      `DELETE FROM ratings WHERE id = $1 RETURNING *`,
      [ratingId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get category breakdown for artisan
   * @param {string} artisanId - Artisan ID
   * @returns {Promise<Object>} Category breakdown
   */
  static async getCategoryBreakdown(artisanId) {
    const result = await pool.query(
      `SELECT 
         categories,
         COUNT(*) as count,
         AVG(rating) as average_rating
       FROM ratings
       WHERE reviewee_id = $1 AND categories IS NOT NULL
       GROUP BY categories`,
      [artisanId]
    );
    
    // Aggregate category scores
    const breakdown = {};
    for (const row of result.rows) {
      for (const [category, score] of Object.entries(row.categories)) {
        if (!breakdown[category]) {
          breakdown[category] = { total: 0, count: 0 };
        }
        breakdown[category].total += score;
        breakdown[category].count++;
      }
    }
    
    const averages = {};
    for (const [category, data] of Object.entries(breakdown)) {
      averages[category] = data.total / data.count;
    }
    
    return averages;
  }

  /**
   * Get rating trend for artisan
   * @param {string} artisanId - Artisan ID
   * @param {number} months - Number of months
   * @returns {Promise<Array>} Rating trend
   */
  static async getRatingTrend(artisanId, months = 6) {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        AVG(rating) as average_rating,
        COUNT(*) as total_ratings
      FROM ratings
      WHERE reviewee_id = $1
        AND created_at > NOW() - ($2 || ' months')::INTERVAL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `, [artisanId, months]);
    
    return result.rows;
  }

  /**
   * Get top rated artisans
   * @param {number} limit - Limit
   * @param {string} category - Category filter
   * @returns {Promise<Array>} Top rated artisans
   */
  static async getTopRatedArtisans(limit = 10, category = null) {
    let query = `
      SELECT 
        ap.user_id,
        ap.full_legal_name,
        ap.skill_category,
        ap.tier_level,
        ap.star_rating,
        ap.total_ratings,
        ap.completion_rate,
        COUNT(j.id) as jobs_completed
      FROM artisan_profiles ap
      LEFT JOIN jobs j ON ap.user_id = j.artisan_id AND j.job_status = 'completed'
      WHERE ap.star_rating >= 4.0 AND ap.total_ratings >= 5
    `;
    const params = [];
    
    if (category) {
      query += ` AND ap.skill_category = $1`;
      params.push(category);
    }
    
    query += ` GROUP BY ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, ap.star_rating, ap.total_ratings, ap.completion_rate
               ORDER BY ap.star_rating DESC, ap.total_ratings DESC
               LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get recent reviews
   * @param {number} limit - Limit
   * @returns {Promise<Array>} Recent reviews
   */
  static async getRecentReviews(limit = 20) {
    const result = await pool.query(`
      SELECT r.*, 
             ap.full_legal_name as artisan_name,
             cp.full_legal_name as client_name,
             j.category
      FROM ratings r
      JOIN artisan_profiles ap ON r.reviewee_id = ap.user_id
      JOIN client_profiles cp ON r.reviewer_id = cp.user_id
      JOIN jobs j ON r.job_id = j.id
      ORDER BY r.created_at DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }
}

module.exports = RatingRepository;