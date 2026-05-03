const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');

class ClientService {
  static async getProfile(userId) {
    const cacheKey = `client:profile:${userId}`;
    let profile = await cacheGet(cacheKey);
    
    if (!profile) {
      const result = await pool.query(
        `SELECT cp.*, u.email, u.phone, u.is_verified, u.verification_status, 
                u.is_active, u.created_at
         FROM client_profiles cp
         JOIN users u ON cp.user_id = u.id
         WHERE cp.user_id = $1`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Client profile not found');
      }
       
      profile = result.rows[0];
      await cacheSet(cacheKey, profile, 3600);
    }
    
    return profile;
  }
  
  static async updateProfile(userId, updateData) {
    const allowedFields = ['full_legal_name', 'street_address', 'service_address', 'verification_documents'];
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
      UPDATE client_profiles 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE user_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Client profile not found');
    }
    
    // Invalidate cache
    await cacheDel(`client:profile:${userId}`);
    
    logger.info(`Client profile updated: ${userId}`);
    
    return result.rows[0];
  }
  
  static async getAddresses(userId) {
    const cacheKey = `client:addresses:${userId}`;
    let addresses = await cacheGet(cacheKey);
    
    if (!addresses) {
      const result = await pool.query(
        `SELECT * FROM client_addresses 
         WHERE client_id = $1 
         ORDER BY is_default DESC, created_at DESC`,
        [userId]
      );
      
      addresses = result.rows;
      await cacheSet(cacheKey, addresses, 3600);
    }
    
    return addresses;
  }
  
  static async addAddress(userId, addressData) {
    const { address, label, isDefault, latitude, longitude } = addressData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (isDefault) {
        await client.query(
          `UPDATE client_addresses SET is_default = false WHERE client_id = $1`,
          [userId]
        );
      }
      
      const result = await client.query(
        `INSERT INTO client_addresses (client_id, address, label, is_default, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, address, label, isDefault || false, latitude, longitude]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`client:addresses:${userId}`);
      
      logger.info(`Address added for client: ${userId}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async updateAddress(addressId, userId, updateData) {
    const { address, label, isDefault, latitude, longitude } = updateData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify ownership
      const ownershipCheck = await client.query(
        `SELECT id FROM client_addresses WHERE id = $1 AND client_id = $2`,
        [addressId, userId]
      );
      
      if (ownershipCheck.rows.length === 0) {
        throw new AppError(404, 'Address not found');
      }
      
      if (isDefault) {
        await client.query(
          `UPDATE client_addresses SET is_default = false WHERE client_id = $1`,
          [userId]
        );
      }
      
      const result = await client.query(
        `UPDATE client_addresses 
         SET address = COALESCE($1, address),
             label = COALESCE($2, label),
             is_default = COALESCE($3, is_default),
             latitude = COALESCE($4, latitude),
             longitude = COALESCE($5, longitude),
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [address, label, isDefault, latitude, longitude, addressId]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`client:addresses:${userId}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async deleteAddress(addressId, userId) {
    const result = await pool.query(
      `DELETE FROM client_addresses 
       WHERE id = $1 AND client_id = $2
       RETURNING *`,
      [addressId, userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Address not found');
    }
    
    // Invalidate cache
    await cacheDel(`client:addresses:${userId}`);
    
    return result.rows[0];
  }
  
  static async getSavedArtisans(userId) {
    const cacheKey = `client:saved_artisans:${userId}`;
    let artisans = await cacheGet(cacheKey);
    
    if (!artisans) {
      const result = await pool.query(
        `SELECT sa.*, 
                ap.full_legal_name, 
                ap.skill_category, 
                ap.tier_level, 
                ap.star_rating,
                ap.completion_rate
         FROM saved_artisans sa
         JOIN artisan_profiles ap ON sa.artisan_id = ap.user_id
         WHERE sa.client_id = $1
         ORDER BY sa.created_at DESC`,
        [userId]
      );
      
      artisans = result.rows;
      await cacheSet(cacheKey, artisans, 3600);
    }
    
    return artisans;
  }
  
  static async saveArtisan(clientId, artisanId) {
    // Check if artisan exists
    const artisanCheck = await pool.query(
      'SELECT user_id FROM artisan_profiles WHERE user_id = $1',
      [artisanId]
    );
    
    if (artisanCheck.rows.length === 0) {
      throw new AppError(404, 'Artisan not found');
    }
    
    const result = await pool.query(
      `INSERT INTO saved_artisans (client_id, artisan_id)
       VALUES ($1, $2)
       ON CONFLICT (client_id, artisan_id) DO NOTHING
       RETURNING *`,
      [clientId, artisanId]
    );
    
    // Invalidate cache
    await cacheDel(`client:saved_artisans:${clientId}`);
    
    return result.rows[0];
  }
  
  static async removeSavedArtisan(clientId, artisanId) {
    const result = await pool.query(
      `DELETE FROM saved_artisans 
       WHERE client_id = $1 AND artisan_id = $2
       RETURNING *`,
      [clientId, artisanId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Saved artisan not found');
    }
    
    // Invalidate cache
    await cacheDel(`client:saved_artisans:${clientId}`);
    
    return result.rows[0];
  }
  
  static async getJobHistory(userId, filters = {}) {
    const { status, page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT j.*, 
             ap.full_legal_name as artisan_name, 
             ap.star_rating,
             jb.total_amount,
             jb.billing_status
      FROM jobs j
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.client_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND j.job_status = $${paramIndex}`;
      params.push(status);
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
      SELECT COUNT(*) FROM jobs WHERE client_id = $1
      ${status ? 'AND job_status = $2' : ''}
    `;
    const countParams = status ? [userId, status] : [userId];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      jobs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async getStatistics(userId) {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
        COALESCE(SUM(jb.total_amount), 0) as total_spent,
        COALESCE(AVG(jb.total_amount), 0) as average_spent
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.client_id = $1
    `, [userId]);
    
    const favoriteCategories = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM jobs
      WHERE client_id = $1
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5
    `, [userId]);
    
    return {
      ...stats.rows[0],
      favoriteCategories: favoriteCategories.rows
    };
  }
}

module.exports = ClientService;