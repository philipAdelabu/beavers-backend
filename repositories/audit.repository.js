const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class AuditRepository {
  /**
   * Create audit log
   * @param {Object} logData - Audit log data
   * @returns {Promise<Object>} Created log
   */
  static async create(logData) {
    const { entityType, entityId, action, userId, oldData, newData, ipAddress, userAgent, metadata } = logData;
    
    const result = await pool.query(
      `INSERT INTO audit_logs 
       (entity_type, entity_id, action, user_id, old_data, new_data, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [entityType, entityId, action, userId, oldData, newData, ipAddress, userAgent, metadata]
    );
    
    return result.rows[0];
  }

  /**
   * Get audit logs with filters
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Audit logs
   */
  static async findAll(filters = {}) {
    const { entityType, entityId, action, userId, startDate, endDate, page = 1, limit = 50 } = filters;
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
    
    if (entityId) {
      query += ` AND al.entity_id = $${paramIndex}`;
      params.push(entityId);
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
      ${entityId ? `AND entity_id = '${entityId}'` : ''}
      ${action ? `AND action = '${action}'` : ''}
      ${userId ? `AND user_id = '${userId}'` : ''}
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

  /**
   * Get entity history
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID
   * @returns {Promise<Array>} Entity history
   */
  static async getEntityHistory(entityType, entityId) {
    const result = await pool.query(
      `SELECT al.*, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.entity_type = $1 AND al.entity_id = $2
       ORDER BY al.created_at ASC`,
      [entityType, entityId]
    );
    
    return result.rows;
  }

  /**
   * Get user actions
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} User actions
   */
  static async getUserActions(userId, filters = {}) {
    const { action, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM audit_logs 
      WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;
    
    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM audit_logs WHERE user_id = $1
      ${action ? 'AND action = $2' : ''}
    `;
    const countParams = action ? [userId, action] : [userId];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      actions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Get action summary
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Action summary
   */
  static async getActionSummary(filters = {}) {
    const { startDate, endDate, entityType } = filters;
    
    let query = `
      SELECT 
        action,
        entity_type,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM audit_logs
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
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
    
    if (entityType) {
      query += ` AND entity_type = $${paramIndex}`;
      params.push(entityType);
      paramIndex++;
    }
    
    query += ` GROUP BY action, entity_type ORDER BY count DESC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get login history for user
   * @param {string} userId - User ID
   * @param {number} limit - Limit
   * @returns {Promise<Array>} Login history
   */
  static async getLoginHistory(userId, limit = 100) {
    const result = await pool.query(
      `SELECT * FROM login_history
       WHERE user_id = $1
       ORDER BY login_time DESC
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }

  /**
   * Record login attempt
   * @param {string} userId - User ID (optional for failed attempts)
   * @param {string} email - Email
   * @param {string} ipAddress - IP address
   * @param {string} userAgent - User agent
   * @param {boolean} success - Success status
   * @returns {Promise<void>}
   */
  static async recordLoginAttempt(userId, email, ipAddress, userAgent, success) {
    await pool.query(
      `INSERT INTO login_history (user_id, email, ip_address, user_agent, success, login_time)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, email, ipAddress, userAgent, success]
    );
  }

  /**
   * Get failed login attempts
   * @param {string} email - Email
   * @param {number} minutes - Time window in minutes
   * @returns {Promise<number>} Number of failed attempts
   */
  static async getFailedLoginAttempts(email, minutes = 15) {
    const result = await pool.query(
      `SELECT COUNT(*) FROM login_history
       WHERE email = $1 AND success = false 
         AND login_time > NOW() - INTERVAL '${minutes} minutes'`,
      [email]
    );
    
    return parseInt(result.rows[0].count);
  }

  /**
   * Clean up old audit logs
   * @param {number} daysToKeep - Days to keep
   * @returns {Promise<number>} Number of logs deleted
   */
  static async cleanupOldLogs(daysToKeep = 90) {
    const result = await pool.query(
      `DELETE FROM audit_logs 
       WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
       RETURNING id`
    );
    
    return result.rowCount;
  }
}

module.exports = AuditRepository;