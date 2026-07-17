const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const admin = require('firebase-admin');

// Initialize Firebase Admin if configured
let firebaseApp = null;
try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    logger.info('Firebase Admin initialized');
  }
} catch (error) {
  logger.warn('Firebase not configured:', error.message);
}

// Email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID ? twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
) : null;

class NotificationService {
  // ==================== Device Management ====================
  
  /**
   * Register a device for push notifications
   */
  static async registerDevice(userId, fcmToken, deviceInfo = {}) {
    const {
      deviceId,
    } = deviceInfo;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Deactivate old tokens for same device
      if (deviceId) {
        await client.query(
          `UPDATE user_devices 
           SET is_active = false, unregistered_at = NOW()
           WHERE user_id = $1 AND device_info->>'device_id' = $2 AND fcm_token != $3`,
          [userId, deviceId, fcmToken]
        );
      }
      
      // Insert or update token
      const result = await client.query(
        `INSERT INTO user_devices 
         (user_id, fcm_token, device_info, is_active, last_used)
         VALUES ($1, $2, $3, true, NOW())
         ON CONFLICT (fcm_token) 
         DO UPDATE SET 
           user_id = EXCLUDED.user_id,
           device_info = COALESCE(EXCLUDED.device_info, user_devices.device_info),
           is_active = true,
           unregistered_at = NULL,
           last_used = NOW()
         RETURNING *`,
        [userId, fcmToken, deviceInfo]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Device registered for user ${userId}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Device registration error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Unregister a device (logout or remove)
   */
  static async unregisterDevice(userId, fcmToken) {
    const result = await pool.query(
      `UPDATE user_devices 
       SET is_active = false, unregistered_at = NOW()
       WHERE user_id = $1 AND fcm_token = $2
       RETURNING *`,
      [userId, fcmToken]
    );
    
    if (result.rows.length > 0) {
      logger.info(`Device unregistered for user ${userId}`);
    }
    
    return result.rows[0];
  }
  
  /**
   * Get user's active devices
   */
  static async getUserDevices(userId) {
    const result = await pool.query(
      `SELECT * FROM user_devices 
       WHERE user_id = $1 AND is_active = true
       ORDER BY last_used DESC`,
      [userId]
    );
    return result.rows;
  }
  
  /**
   * Get user's FCM tokens
   */
  static async getUserFCMTokens(userId) {
    const result = await pool.query(
      `SELECT fcm_token FROM user_devices 
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    return result.rows.map(row => row.fcm_token);
  }
  
  // ==================== User Preferences ====================
  
  /**
   * Get user notification preferences
   */
  static async getPreferences(userId) {
    const result = await pool.query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Create default preferences
      const defaultPrefs = await pool.query(
        `INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, push_enabled)
         VALUES ($1, true, true, true)
         RETURNING *`,
        [userId]
      );
      return defaultPrefs.rows[0];
    }
    
    return result.rows[0];
  }
  
  /**
   * Update user preferences
   */
  static async updatePreferences(userId, preferences) {
    const { emailEnabled, smsEnabled, pushEnabled } = preferences;
    
    const result = await pool.query(
      `UPDATE notification_preferences 
       SET email_enabled = COALESCE($1, email_enabled),
           sms_enabled = COALESCE($2, sms_enabled),
           push_enabled = COALESCE($3, push_enabled),
           updated_at = NOW()
       WHERE user_id = $4
       RETURNING *`,
      [emailEnabled, smsEnabled, pushEnabled, userId]
    );
    
    return result.rows[0];
  }
  
  // ==================== Send Notifications ====================
  
  /**
   * Send notification via all enabled channels
   */
  static async sendNotification(userId, title, body, data = {}, options = {}) {
    const results = [];
    
    // Get user preferences
    const preferences = await this.getPreferences(userId);
    
    // Send email if enabled
    if (preferences.email_enabled && options.email !== false) {
      const emailResult = await this.sendEmailNotification(userId, title, body, data);
      results.push({ channel: 'email', ...emailResult });
    }
    
    // Send SMS if enabled
    if (preferences.sms_enabled && options.sms !== false) {
      const smsResult = await this.sendSMSNotification(userId, body);
      results.push({ channel: 'sms', ...smsResult });
    }
    
    // Send push if enabled
    if (preferences.push_enabled && options.push !== false) {
      const pushResult = await this.sendPushNotification(userId, title, body, data);
      results.push({ channel: 'push', ...pushResult });
    }
    
    // Store in-app notification
    const inAppResult = await this.createInAppNotification(userId, title, body, data);
    results.push({ channel: 'in_app', ...inAppResult });
    
    return results;
  }
  
  // ==================== Push Notifications ====================
  
  /**
   * Send push notification via FCM
   */
  static async sendPushNotification(userId, title, body, data = {}, priority = 'high') {
    if (!firebaseApp) {
      logger.warn('Firebase not configured');
      return { success: false, error: 'Firebase not configured' };
    }
    
    try {
      // Get user's active tokens
      const tokens = await this.getUserFCMTokens(userId);
      
      if (tokens.length === 0) {
        logger.info(`No active devices for user ${userId}`);
        return { success: false, error: 'No active devices' };
      }
      
      // Create push notification log
      const logResult = await pool.query(
        `INSERT INTO push_notifications 
         (user_id, title, body, data, priority, status)
         VALUES ($1, $2, $3, $4, $5, 'sending')
         RETURNING id`,
        [userId, title, body, data, priority]
      );
      
      const notificationId = logResult.rows[0].id;
      
      // Prepare FCM message
      const message = {
        notification: { title, body },
        data: {
          ...data,
          notification_id: notificationId.toString(),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          sound: 'default'
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        },
        android: {
          priority: priority === 'high' ? 'high' : 'normal',
          notification: {
            sound: 'default',
            priority: priority
          }
        },
        tokens: tokens
      };
      
      // Send to Firebase
      const response = await admin.messaging().sendEachForMulticast(message);
      
      // Process results
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      
      const successCount = response.successCount;
      const failureCount = response.failureCount;
      
      // Update notification log
      await pool.query(
        `UPDATE push_notifications 
         SET status = $1, 
             sent_at = NOW(),
             delivered_at = CASE WHEN $2 > 0 THEN NOW() ELSE NULL END,
             error_message = $3,
             metadata = $4
         WHERE id = $5`,
        [
          successCount > 0 ? 'sent' : 'failed',
          successCount,
          failureCount > 0 ? `${failureCount} failed` : null,
          JSON.stringify({ successCount, failureCount, failedTokens }),
          notificationId
        ]
      );
      
      // Invalidate failed tokens
      if (failedTokens.length > 0) {
        await this.invalidateTokens(failedTokens);
      }
      
      logger.info(`Push notification sent to user ${userId}: ${successCount}/${tokens.length} successful`);
      
      // Create in-app notification
      await this.createInAppNotification(userId, title, body, { ...data, channel: 'push' });
      
      return {
        success: true,
        notificationId,
        successCount,
        failureCount,
        failedTokens
      };
    } catch (error) {
      logger.error('Push notification error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Invalidate failed FCM tokens
   */
  static async invalidateTokens(tokens) {
    if (!tokens || tokens.length === 0) return;
    
    await pool.query(
      `UPDATE user_devices 
       SET is_active = false, invalidated_at = NOW()
       WHERE fcm_token = ANY($1::text[])`,
      [tokens]
    );
    
    logger.info(`Invalidated ${tokens.length} FCM tokens`);
  }
  
  // ==================== Email Notifications ====================
  
  /**
   * Send email notification
   */
  static async sendEmailNotification(userId, title, body, data = {}) {
    try {
      const userResult = await pool.query(
        `SELECT email FROM users WHERE id = $1`,
        [userId]
      );
      
      if (userResult.rows.length === 0 || !userResult.rows[0].email) {
        return { success: false, error: 'User email not found' };
      }
      
      const email = userResult.rows[0].email;
      
      const mailOptions = {
        from: `"BeaverWorks" <${process.env.EMAIL_FROM || 'noreply@beaverworks.com'}>`,
        to: email,
        subject: title,
        text: body,
        html: `<h2>${title}</h2><p>${body}</p><p>Thank you for using BeaverWorks!</p>`
      };
      
      const info = await emailTransporter.sendMail(mailOptions);
      
      // Store in notifications table
      await this.createInAppNotification(userId, title, body, { ...data, channel: 'email' });
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Email notification error:', error);
      return { success: false, error: error.message };
    }
  }
  
  // ==================== SMS Notifications ====================
  
  /**
   * Send SMS notification
   */
  static async sendSMSNotification(userId, message) {
    if (!twilioClient) {
      return { success: false, error: 'Twilio not configured' };
    }
    
    try {
      const userResult = await pool.query(
        `SELECT phone FROM users WHERE id = $1`,
        [userId]
      );
      
      if (userResult.rows.length === 0 || !userResult.rows[0].phone) {
        return { success: false, error: 'User phone not found' };
      }
      
      const phone = userResult.rows[0].phone;
      
      const result = await twilioClient.messages.create({
        body: message,
        to: phone,
        from: process.env.TWILIO_PHONE_NUMBER
      });
      
      return { success: true, sid: result.sid };
    } catch (error) {
      logger.error('SMS notification error:', error);
      return { success: false, error: error.message };
    }
  }
  
  // ==================== In-App Notifications ====================
  
  /**
   * Create in-app notification
   */
  static async createInAppNotification(userId, title, message, data = {}) {
    const result = await pool.query(
      `INSERT INTO notifications 
       (user_id, type, title, message, data, channel, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING *`,
      [
        userId,
        data.type || 'system',
        title,
        message,
        data,
        data.channel || 'in_app'
      ]
    );
    
    return result.rows[0];
  }
  
  /**
   * Get user's in-app notifications
   */
  static async getUserNotifications(userId, filters = {}) {
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
      ${isRead !== undefined ? `AND is_read = $2` : ''}
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
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  /**
   * Mark notification as read
   */
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
  
  /**
   * Mark all notifications as read
   */
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
  
  /**
   * Get unread count
   */
  static async getUnreadCount(userId) {
    const result = await pool.query(
      `SELECT COUNT(*) FROM notifications 
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    return parseInt(result.rows[0].count);
  }
  
  // ==================== Notification Templates ==================== //
  
  /**
   * Send job offer notification
  */
  static async sendJobOffer(artisanId, jobDetails) {
    const title = 'New Job Offer!';
    const body = `${jobDetails.category} job available: ${jobDetails.description.substring(0, 100)}`;
    const data = {
      type: 'job_offer',
      jobId: jobDetails.jobId,
      category: jobDetails.category,
      distance: jobDetails.distance
    };
    
    return await this.sendNotification(artisanId, title, body, data, { priority: 'high' });
  }
  
  /**
   * Send job accepted notification
   */
  static async sendJobAccepted(clientId, jobDetails) {
    const title = 'Job Accepted!';
    const body = `An artisan has accepted your job: ${jobDetails.category}`;
    const data = {
      type: 'job_accepted',
      jobId: jobDetails.jobId,
      artisanId: jobDetails.artisanId
    };
    
    return await this.sendNotification(clientId, title, body, data, { priority: 'high' });
  }
  
  /**
   * Send arrival notification
   */
  static async sendArrivalNotification(clientId, jobId, pin) {
    const title = 'Artisan Has Arrived!';
    const body = `Please provide PIN: ${pin}`;
    const data = {
      type: 'arrival',
      jobId: jobId,
      pin: pin
    };
    
    return await this.sendNotification(clientId, title, body, data, { priority: 'high' });
  }


  
  /**
   * Send payment confirmed notification
   */
  static async sendPaymentConfirmed(userId, amount, jobId) {
    const title = 'Payment Confirmed!';
    const body = `₦${amount.toLocaleString()} payment confirmed for job #${jobId.slice(0, 8)}`;
    const data = {
      type: 'payment_confirmed',
      jobId: jobId,
      amount: amount
    };
    
    return await this.sendNotification(userId, title, body, data);
  }
  
  /**
   * Send job completion notification
   */
  static async sendJobCompleted(clientId, jobId) {
    const title = 'Job Completed!';
    const body = 'Your job has been completed. Please review and make payment.';
    const data = {
      type: 'job_completed',
      jobId: jobId
    };
    
    return await this.sendNotification(clientId, title, body, data);
  }
  
  /**
   * Send withdrawal status notification
   */
  static async sendWithdrawalStatus(artisanId, amount, status, reference) {
    const statusMap = {
      pending: 'Withdrawal Request Received',
      processing: 'Withdrawal Processing',
      completed: 'Withdrawal Completed',
      failed: 'Withdrawal Failed'
    };
    
    const title = statusMap[status] || 'Withdrawal Update';
    const body = `Withdrawal of ₦${amount.toLocaleString()} ${status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'received'}`;
    const data = {
      type: 'withdrawal_status',
      amount: amount,
      reference: reference,
      status: status
    };
    
    return await this.sendNotification(artisanId, title, body, data);
  }


}

module.exports = NotificationService;