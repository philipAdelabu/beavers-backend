const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class UserRepository {
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user
   */
  static async create(userData) {
    const { email, phone, passwordHash, userType } = userData;
    
    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, user_type, verification_status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, email, phone, user_type, is_verified, verification_status, is_active, created_at`,
      [email, phone, passwordHash, userType]
    );
    
    return result.rows[0];
  }

  /**
   * Find user by ID
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} User or null
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.phone, u.user_type, u.is_verified, 
              u.verification_status, u.is_active, u.last_login, u.created_at,
              cp.full_legal_name as client_name,
              ap.full_legal_name as artisan_name
       FROM users u
       LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
       LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
       WHERE u.id = $1`,
      [id]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User or null
   */
  static async findByEmail(email) {
    const result = await pool.query(
      `SELECT u.*,
              cp.full_legal_name as client_name,
              ap.full_legal_name as artisan_name
       FROM users u
       LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
       LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
       WHERE u.email = $1`,
      [email]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Find user by phone
   * @param {string} phone - User phone
   * @returns {Promise<Object|null>} User or null
   */
  static async findByPhone(phone) {
    const result = await pool.query(
      `SELECT * FROM users WHERE phone = $1`,
      [phone]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Update user
   * @param {string} id - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated user or null
   */
  static async update(id, updates) {
    const allowedFields = ['email', 'phone', 'password_hash', 'is_verified', 'verification_status', 'is_active', 'verification_notes'];
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
    
    values.push(id);
    const query = `
      UPDATE users 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Delete user (soft delete)
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} Deleted user or null
   */
  static async delete(id) {
    const result = await pool.query(
      `UPDATE users SET is_active = false, deleted_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get all users with pagination
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Users and pagination info
   */
  static async findAll(filters = {}) {
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

  /**
   * Get users by type
   * @param {string} userType - User type (client, artisan, admin)
   * @returns {Promise<Array>} Array of users
   */
  static async findByType(userType) {
    const result = await pool.query(
      `SELECT u.*,
              CASE 
                WHEN u.user_type = 'client' THEN cp.full_legal_name
                WHEN u.user_type = 'artisan' THEN ap.full_legal_name
              END as full_name
       FROM users u
       LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
       LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
       WHERE u.user_type = $1 AND u.is_active = true`,
      [userType]
    );
    
    return result.rows;
  }

  /**
   * Get pending verifications
   * @param {string} type - User type (optional)
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Pending verifications
   */
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

  /**
   * Update last login timestamp
   * @param {string} id - User ID
   * @param {string} ipAddress - IP address
   * @returns {Promise<void>}
   */
  static async updateLastLogin(id, ipAddress) {
    await pool.query(
      `UPDATE users SET last_login = NOW(), last_login_ip = $1 WHERE id = $2`,
      [ipAddress, id]
    );
  }

  /**
   * Record login attempt
   * @param {string} email - User email
   * @param {string} ipAddress - IP address
   * @param {boolean} success - Whether login was successful
   * @returns {Promise<void>}
   */
  static async recordLoginAttempt(email, ipAddress, success) {
    await pool.query(
      `INSERT INTO login_history (email, ip_address, success, attempted_at)
       VALUES ($1, $2, $3, NOW())`,
      [email, ipAddress, success]
    );
  }

  /**
   * Get failed login attempts
   * @param {string} email - User email
   * @param {number} minutes - Time window in minutes
   * @returns {Promise<number>} Number of failed attempts
   */
  static async getFailedLoginAttempts(email, minutes = 15) {
    const result = await pool.query(
      `SELECT COUNT(*) FROM login_history 
       WHERE email = $1 AND success = false AND attempted_at > NOW() - INTERVAL '${minutes} minutes'`,
      [email]
    );
    
    return parseInt(result.rows[0].count);
  }

  /**
   * Get user statistics
   * @returns {Promise<Object>} User statistics
   */
  static async getStatistics() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN user_type = 'client' THEN 1 END) as total_clients,
        COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as total_artisans,
        COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_users_last_30_days
      FROM users
    `);
    
    return result.rows[0];
  }
}

module.exports = UserRepository;