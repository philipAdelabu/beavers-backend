const { pool } = require('../config/database');



class LogService {  
  

     static async logAdminActivity(adminId, action, details = {}, ipAddress = null, userAgent = null) {
    await pool.query(
      `INSERT INTO admin_activity_logs (admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [adminId, action, details.entityType || null, details.entityId || null, details, ipAddress, userAgent]
    );
  }


}



module.exports = LogService;