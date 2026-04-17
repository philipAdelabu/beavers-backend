const { pool } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');

class AuditService {
  static async log(eventData) {
    const {
      entityType,
      entityId,
      action,
      userId,
      oldData,
      newData,
      ipAddress,
      userAgent,
      metadata
    } = eventData;
    
    const result = await pool.query(
      `INSERT INTO audit_logs 
       (entity_type, entity_id, action, user_id, old_data, new_data, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [entityType, entityId, action, userId, oldData, newData, ipAddress, userAgent, metadata]
    );
    
    logger.info(`Audit log created: ${action} on ${entityType} ${entityId}`);
    
    return result.rows[0];
  }
  
  static async getUserActivity(userId, filters = {}) {
    const { startDate, endDate, action, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM audit_logs
      WHERE user_id = $1
    `;
    const params = [userId];
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
    
    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM audit_logs
      WHERE user_id = $1
      ${startDate ? 'AND created_at >= $2' : ''}
      ${endDate ? `AND created_at <= $${startDate ? 3 : 2}` : ''}
    `;
    const countParams = [userId];
    if (startDate) countParams.push(startDate);
    if (endDate) countParams.push(endDate);
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
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
  
  static async getUserSessionLogs(userId, limit = 100) {
    const result = await pool.query(
      `SELECT * FROM login_history
       WHERE user_id = $1
       ORDER BY login_time DESC
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }
  
  static async logUserAction(userId, action, details, ipAddress, userAgent) {
    return await this.log({
      entityType: 'user',
      entityId: userId,
      action,
      userId,
      metadata: details,
      ipAddress,
      userAgent
    });
  }
  
  static async logJobAction(jobId, userId, action, oldData, newData) {
    return await this.log({
      entityType: 'job',
      entityId: jobId,
      action,
      userId,
      oldData,
      newData
    });
  }
  
  static async logPaymentAction(paymentId, userId, action, oldData, newData) {
    return await this.log({
      entityType: 'payment',
      entityId: paymentId,
      action,
      userId,
      oldData,
      newData
    });
  }
  
  static async logAdminAction(adminId, action, targetType, targetId, details) {
    return await this.log({
      entityType: targetType,
      entityId: targetId,
      action,
      userId: adminId,
      metadata: details
    });
  }
  
  static async getAuditTrail(entityType, entityId) {
    const result = await pool.query(
      `SELECT al.*, 
              u.email as user_email,
              CASE 
                WHEN u.user_type = 'client' THEN cp.full_legal_name
                WHEN u.user_type = 'artisan' THEN ap.full_legal_name
                ELSE u.email
              END as user_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN client_profiles cp ON u.id = cp.user_id
       LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
       WHERE al.entity_type = $1 AND al.entity_id = $2
       ORDER BY al.created_at ASC`,
      [entityType, entityId]
    );
    
    return result.rows;
  }
  
  static async cleanupOldLogs(daysToKeep = 90) {
    const result = await pool.query(
      `DELETE FROM audit_logs 
       WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
       RETURNING id`
    );
    
    logger.info(`Cleaned up ${result.rowCount} old audit logs`);
    
    return result.rowCount;
  }
  
  static async getFailedLoginAttempts(days = 7) {
    const result = await pool.query(
      `SELECT 
         email,
         COUNT(*) as attempts,
         MAX(attempted_at) as last_attempt
       FROM failed_logins
       WHERE attempted_at > NOW() - INTERVAL '${days} days'
       GROUP BY email
       ORDER BY attempts DESC
       LIMIT 100`,
      []
    );
    
    return result.rows;
  }
  
  static async getSecurityEvents(days = 30) {
    const result = await pool.query(
      `SELECT 
         action,
         COUNT(*) as count,
         COUNT(DISTINCT user_id) as unique_users
       FROM audit_logs
       WHERE action IN ('login_failed', 'password_changed', 'account_suspended', 'account_activated')
         AND created_at > NOW() - INTERVAL '${days} days'
       GROUP BY action
       ORDER BY count DESC`,
      []
    );
    
    return result.rows;
  }
}

module.exports = AuditService;