const { pool } = require('../config/database');



class LogService {  
  

     static async logAdminActivity(adminId, action, details = {}, ipAddress = null, userAgent = null) {
      
      await pool.query(
      `INSERT INTO admin_activity_logs (admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [adminId, action, details.entityType || null, details.entityId || null, details, ipAddress, userAgent]
    );
  }

     static async logActivity(logData, req, metaData = null) {

        const { ipAddress, userAgent } = req;
     

        const { entityType, entityId, action, userId, oldData, newData } = logData; 
        const result = await pool.query(
          `INSERT INTO audit_logs 
          (entity_type, entity_id, action, user_id, old_data, new_data, ip_address, user_agent, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [entityType, entityId, action, userId, oldData, newData, ipAddress, userAgent, metaData]
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


}



module.exports = LogService;