const { pool } = require('../config/database');

class Rating {
  static async create(ratingData) {
    const { jobId, reviewerId, revieweeId, rating, review, categories } = ratingData;
    
    const result = await pool.query(
      `INSERT INTO ratings 
       (job_id, reviewer_id, reviewee_id, rating, review, categories)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [jobId, reviewerId, revieweeId, rating, review, categories || {}]
    );
    
    // Update artisan's average rating
    await pool.query(
      `UPDATE artisan_profiles 
       SET star_rating = (
         SELECT AVG(rating)::DECIMAL(3,2)
         FROM ratings
         WHERE reviewee_id = $1
       ),
       total_ratings = (
         SELECT COUNT(*)
         FROM ratings
         WHERE reviewee_id = $1
       )
       WHERE user_id = $1`,
      [revieweeId]
    );
    
    return result.rows[0];
  }

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
    const countParams = [artisanId];
    if (minRating) countParams.push(minRating);
    
    const countResult = await pool.query(countQuery, countParams);
    
    // Get rating statistics
    const statsResult = await pool.query(
      `SELECT 
         AVG(rating) as average_rating,
         COUNT(*) as total_ratings,
         COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
         COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
         COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
         COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
         COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
       FROM ratings
       WHERE reviewee_id = $1`,
      [artisanId]
    );
    
    return {
      ratings: result.rows,
      statistics: statsResult.rows[0],
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

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
      limit
    };
  }

  static async updateRating(ratingId, updates) {
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
    
    if (result.rows.length > 0) {
      // Update artisan's average rating
      await pool.query(
        `UPDATE artisan_profiles 
         SET star_rating = (
           SELECT AVG(rating)::DECIMAL(3,2)
           FROM ratings
           WHERE reviewee_id = $1
         )
         WHERE user_id = $1`,
        [result.rows[0].reviewee_id]
      );
    }
    
    return result.rows[0];
  }

  static async deleteRating(ratingId) {
    const rating = await pool.query(
      `SELECT reviewee_id FROM ratings WHERE id = $1`,
      [ratingId]
    );
    
    const result = await pool.query(
      `DELETE FROM ratings WHERE id = $1 RETURNING *`,
      [ratingId]
    );
    
    if (rating.rows.length > 0) {
      // Update artisan's average rating
      await pool.query(
        `UPDATE artisan_profiles 
         SET star_rating = (
           SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0)
           FROM ratings
           WHERE reviewee_id = $1
         ),
         total_ratings = (
           SELECT COUNT(*)
           FROM ratings
           WHERE reviewee_id = $1
         )
         WHERE user_id = $1`,
        [rating.rows[0].reviewee_id]
      );
    }
    
    return result.rows[0];
  }

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

  static async getRatingTrend(artisanId, months = 6) {
    const result = await pool.query(
      `SELECT 
         DATE_TRUNC('month', created_at) as month,
         AVG(rating) as average_rating,
         COUNT(*) as total_ratings
       FROM ratings
       WHERE reviewee_id = $1
         AND created_at > NOW() - ($2 || ' months')::INTERVAL
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month DESC`,
      [artisanId, months]
    );
    return result.rows;
  }
}

module.exports = Rating;