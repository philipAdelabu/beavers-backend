const { pool } = require('../config/database');

class Notification {
  static async create(notificationData) {
    const { userId, type, title, message, data, priority = 'normal' } = notificationData;
    
    const result = await pool.query(
      `INSERT INTO notifications 
       (user_id, type, title, message, data, priority, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING *`,
      [userId, type, title, message, data || {}, priority]
    );
    
    return result.rows[0]; 
  }

  static async bulkCreate(notifications) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const created = [];
      for (const notif of notifications) {
        const result = await client.query(
          `INSERT INTO notifications 
           (user_id, type, title, message, data, priority)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [notif.userId, notif.type, notif.title, notif.message, notif.data || {}, notif.priority || 'normal']
        );
        created.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findByUserId(userId, filters = {}) {
    const { isRead, type, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM notifications
      WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;
    
    if (isRead !== undefined) {
      query += ` AND is_read = $${paramIndex}`;
      params.push(isRead);
      paramIndex++;
    }
    
    if (type) {
      query += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM notifications WHERE user_id = $1
      ${isRead !== undefined ? 'AND is_read = $2' : ''}
      ${type ? `AND type = $${isRead !== undefined ? 3 : 2}` : ''}
    `;
    const countParams = [userId];
    if (isRead !== undefined) countParams.push(isRead);
    if (type) countParams.push(type);
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      notifications: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async markAsRead(notificationId, userId) {
    const result = await pool.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );
    return result.rows[0];
  }

  static async markAllAsRead(userId) {
    const result = await pool.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false
       RETURNING *`,
      [userId]
    );
    return result.rows;
  }

  static async deleteNotification(notificationId, userId) {
    const result = await pool.query(
      `DELETE FROM notifications 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );
    return result.rows[0];
  }

  static async deleteAllRead(userId) {
    const result = await pool.query(
      `DELETE FROM notifications 
       WHERE user_id = $1 AND is_read = true
       RETURNING *`,
      [userId]
    );
    return result.rows;
  }

  static async getUnreadCount(userId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    return parseInt(result.rows[0].count);
  }

  static async getByType(userId, type, limit = 10) {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1 AND type = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, type, limit]
    );
    return result.rows;
  }

  static async sendToAllUsers(notificationData, userTypes = null) {
    let query = `
      INSERT INTO notifications (user_id, type, title, message, data, priority)
      SELECT id, $1, $2, $3, $4, $5
      FROM users
      WHERE is_active = true
    `;
    const params = [notificationData.type, notificationData.title, notificationData.message, 
                    notificationData.data || {}, notificationData.priority || 'normal'];
    
    if (userTypes && userTypes.length > 0) {
      query += ` AND user_type = ANY($6)`;
      params.push(userTypes);
    }
    
    const result = await pool.query(query, params);
    return result.rowCount;
  }

  static async sendToArtisansByTier(notificationData, tierLevel) {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data, priority)
       SELECT ap.user_id, $1, $2, $3, $4, $5
       FROM artisan_profiles ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.tier_level = $6 AND u.is_active = true
       RETURNING *`,
      [notificationData.type, notificationData.title, notificationData.message,
       notificationData.data || {}, notificationData.priority || 'normal', tierLevel]
    );
    return result.rows;
  }

  static async getNotificationPreferences(userId) {
    const result = await pool.query(
      `SELECT * FROM notification_preferences
       WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Create default preferences
      const defaultPrefs = await pool.query(
        `INSERT INTO notification_preferences (user_id)
         VALUES ($1)
         RETURNING *`,
        [userId]
      );
      return defaultPrefs.rows[0];
    }
    
    return result.rows[0];
  }

  static async updatePreferences(userId, preferences) {
    const allowedTypes = ['email', 'sms', 'push'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [channel, enabled] of Object.entries(preferences)) {
      if (allowedTypes.includes(channel)) {
        setClause.push(`${channel}_enabled = $${paramIndex}`);
        values.push(enabled);
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) return null;
    
    values.push(userId);
    const result = await pool.query(
      `UPDATE notification_preferences 
       SET ${setClause.join(', ')}, updated_at = NOW()
       WHERE user_id = $${paramIndex}
       RETURNING *`,
      values
    );
    
    return result.rows[0];
  }
}

module.exports = Notification;