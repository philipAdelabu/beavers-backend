const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');

class ReviewService {
  static async createReview(reviewData) {
    const { jobId, reviewerId, rating, review, categories } = reviewData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if review already exists
      const existingReview = await client.query(
        `SELECT id FROM ratings WHERE job_id = $1 AND reviewer_id = $2`,
        [jobId, reviewerId],
      );
      
      if (existingReview.rows.length > 0) {
        throw new AppError(400, 'Review already exists for this job');
      }

         // Retrieve the artisan Id 
      const artisan = await client.query(
        `SELECT artisan_id FROM jobs where id = $1 AND client_id = $2`,
        [jobId, reviewerId],
      );

      if (artisan.rows.length === 0){
         throw new AppError(400, 'Job or the client not found');
      }
      
     const revieweeId = artisan.rows[0].artisan_id;
      
      const result = await client.query(
        `INSERT INTO ratings 
         (job_id, reviewer_id, reviewee_id, rating, review, categories)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [jobId, reviewerId, revieweeId, rating, review, categories || {}]
      );
      
      // Update artisan's average rating
      await client.query(
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
      
      // Update completion rate
      await client.query(
        `UPDATE artisan_profiles 
         SET completion_rate = (
           SELECT 
             CASE 
               WHEN COUNT(*) = 0 THEN 0
               ELSE (COUNT(CASE WHEN job_status = 'completed' THEN 1 END)::float / COUNT(*) * 100)
             END
           FROM jobs
           WHERE artisan_id = $1
         )
         WHERE user_id = $1`,
        [revieweeId]
      );
      
      await client.query('COMMIT');
      
      // Clear cache
      await cacheDel(`ratings:artisan:${revieweeId}`);
      await cacheDel(`artisan:profile:${revieweeId}`);
      
      // Send notification to artisan
      await NotificationService.sendPushNotification(
        revieweeId,
        'New Review',
        `You received a ${rating}-star review on your recent job!`,
        { jobId, rating, type: 'new_review' }
      );
      
      logger.info(`Review created for job ${jobId} by user ${reviewerId}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async getArtisanReviews(artisanId, filters = {}) {
    const cacheKey = `ratings:artisan:${artisanId}`;
    let reviews = await cacheGet(cacheKey);
    
    if (!reviews) {
      const { page = 1, limit = 20, minRating } = filters;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT r.*, 
               cp.full_legal_name as reviewer_name,
               cp.user_id as reviewer_id,
               j.category, j.service_type, j.created_at as job_date
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
      
      reviews = {
        ratings: result.rows,
        statistics: statsResult.rows[0],
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      };
      
      await cacheSet(cacheKey, reviews, 300);
    }
    
    return reviews;
  }
  
  static async getClientReviews(clientId, filters = {}) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    const result = await pool.query(`
      SELECT r.*, 
             ap.full_legal_name as reviewee_name,
             ap.user_id as reviewee_id,
             j.category, j.service_type
      FROM ratings r
      JOIN artisan_profiles ap ON r.reviewee_id = ap.user_id
      JOIN jobs j ON r.job_id = j.id
      WHERE r.reviewer_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, [clientId, limit, offset]);
    
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
  
  static async updateReview(reviewId, userId, updateData) {
    const { rating, review, categories } = updateData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify ownership
      const reviewResult = await client.query(
        `SELECT * FROM ratings WHERE id = $1 AND reviewer_id = $2`,
        [reviewId, userId]
      );
      
      if (reviewResult.rows.length === 0) {
        throw new AppError(404, 'Review not found or unauthorized');
      }
      
      const oldReview = reviewResult.rows[0];
      
      const result = await client.query(
        `UPDATE ratings 
         SET rating = COALESCE($1, rating),
             review = COALESCE($2, review),
             categories = COALESCE($3, categories),
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [rating, review, categories, reviewId]
      );
      
      // Update artisan's average rating
      await client.query(
        `UPDATE artisan_profiles 
         SET star_rating = (
           SELECT AVG(rating)::DECIMAL(3,2)
           FROM ratings
           WHERE reviewee_id = $1
         )
         WHERE user_id = $1`,
        [oldReview.reviewee_id]
      );
      
      await client.query('COMMIT');
      
      // Clear cache
      await cacheDel(`ratings:artisan:${oldReview.reviewee_id}`);
      await cacheDel(`artisan:profile:${oldReview.reviewee_id}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async deleteReview(reviewId, userId, userType) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let reviewResult;
      
      if (userType === 'admin') {
        reviewResult = await client.query(
          `SELECT * FROM ratings WHERE id = $1`,
          [reviewId]
        );
      } else {
        reviewResult = await client.query(
          `SELECT * FROM ratings WHERE id = $1 AND reviewer_id = $2`,
          [reviewId, userId]
        );
      }
      
      if (reviewResult.rows.length === 0) {
        throw new AppError(404, 'Review not found');
      }
      
      const review = reviewResult.rows[0];
      
      const result = await client.query(
        `DELETE FROM ratings WHERE id = $1 RETURNING *`,
        [reviewId]
      );
      
      // Update artisan's average rating
      await client.query(
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
        [review.reviewee_id]
      );
      
      await client.query('COMMIT');
      
      // Clear cache
      await cacheDel(`ratings:artisan:${review.reviewee_id}`);
      await cacheDel(`artisan:profile:${review.reviewee_id}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async getRatingBreakdown(artisanId) {
    const result = await pool.query(`
      SELECT 
        categories,
        COUNT(*) as count,
        AVG(rating) as average_rating
      FROM ratings
      WHERE reviewee_id = $1 AND categories IS NOT NULL
      GROUP BY categories
    `, [artisanId]);
    
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
  
  static async getReviewStats() {
    const result = await pool.query(`
      SELECT 
        AVG(rating) as average_rating,
        COUNT(*) as total_reviews,
        COUNT(DISTINCT reviewee_id) as artisans_with_reviews,
        COUNT(DISTINCT reviewer_id) as clients_who_reviewed
      FROM ratings
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    
    const ratingDistribution = await pool.query(`
      SELECT 
        rating,
        COUNT(*) as count,
        ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 2) as percentage
      FROM ratings
      GROUP BY rating
      ORDER BY rating DESC
    `);
    
    return {
      summary: result.rows[0],
      distribution: ratingDistribution.rows
    };
  }
}

module.exports = ReviewService;