const { pool } = require('../config/database');

class AuditLog {
  
  static async log(logData) {
    const { entityType, entityId, action, userId, oldData, newData, ipAddress, userAgent } = logData;
    
    const result = await pool.query(
      `INSERT INTO audit_logs 
       (entity_type, entity_id, action, user_id, old_data, new_data, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [entityType, entityId, action, userId, oldData, newData, ipAddress, userAgent]
    );
    
    return result.rows[0];
  }

  static async getLogs(filters = {}) {
    const { 
      entityType, entityId, action, userId, 
      startDate, endDate, page = 1, limit = 50 
    } = filters;
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM audit_logs WHERE 1=1`;
    const params = [];
    let paramIndex = 1;
    
    if (entityType) {
      query += ` AND entity_type = $${paramIndex}`;
      params.push(entityType);
      paramIndex++;
    }
    
    if (entityId) {
      query += ` AND entity_id = $${paramIndex}`;
      params.push(entityId);
      paramIndex++;
    }
    
    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }
    
    if (userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    
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
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM audit_logs WHERE 1=1
      ${entityType ? 'AND entity_type = $1' : ''}
      ${entityId ? `AND entity_id = $${entityType ? 2 : 1}` : ''}
    `;
    const countParams = [];
    if (entityType) countParams.push(entityType);
    if (entityId) countParams.push(entityId);
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async getEntityHistory(entityType, entityId) {
    const result = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type = $1 AND entity_id = $2 
       ORDER BY created_at ASC`,
      [entityType, entityId]
    );
    return result.rows;
  }

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
    
    return {
      actions: result.rows,
      page,
      limit
    };
  }

  static async getActionSummary(filters = {}) {
    const { startDate, endDate } = filters;
    
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
    
    query += ` GROUP BY action, entity_type ORDER BY count DESC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async cleanupOldLogs(daysToKeep = 90) {
    const result = await pool.query(
      `DELETE FROM audit_logs 
       WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
       RETURNING *`,
      [daysToKeep]
    );
    return result.rowCount;
  }

  static async logUserAction(userId, action, details) {
    return await this.log({
      entityType: 'user',
      entityId: userId,
      action,
      userId,
      newData: details,
      ipAddress: details.ipAddress,
      userAgent: details.userAgent
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

  static async getAuditTrail(entityType, entityId) {
    const result = await pool.query(
      `SELECT al.*, 
              CASE WHEN u.user_type = 'client' THEN cp.full_legal_name
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
}

module.exports = AuditLog;