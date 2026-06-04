// eslint-disable-next-line import/no-extraneous-dependencies
const admin = require('firebase-admin');
const axios = require('axios');
const serviceAccount = require('../configurations/beaver-works-firebase.json');
const nodemailer = require('nodemailer');
const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');


// Initialize Firebase Admin SDK if configured
let firebaseApp = null;
try {
    firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
       });

     if (firebaseApp) {

    logger.info('Firebase Admin SDK initialized successfully');
  } else {
    logger.warn('Firebase credentials not configured. Push notifications disabled.');
  }
} catch (error) {
  logger.error('Failed to initialize Firebase Admin SDK:', error);
}
 
 
// Email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: process.env.EMAIL_SECURE === 'true',
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});



// Termii client for SMS
const termii_api_key = process.env.TERMII_SMS_LIVE_API_KEY || null;
const termii_base_url = process.env.TERMII_BASE_URL || 'https://v3.api.termii.com';




/**
 * Initialize socket functions (to be called from server.js after socket initialization)
 * @param {Object} socketFunctions - Object containing socket helper functions
 */

class NotificationService {

 

   
   
  static async storeNotification(userId, channel, type, title, message, metadata = {}) {
    try {
      const result = await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data, channel)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, type, title, message, metadata, channel]
      );
      logger.info(`Stored notification for user ${userId} with id ${result.rows[0].id}`);
      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to store notification:', error);
      return null;
    }
  }
 
  static async sendEmail(to, subject, text, userId = null, html = null) {

      if(process.env.NODE_ENV === 'development'){
           logger.info(`Email sent to ${to}: ${subject}`); 
           return `Email sent to ${to}: ${subject}`;
      }

    try {
      const mailOptions = {
        from: `"BeaverWorks" <${process.env.EMAIL_FROM || 'noreply@beaverworksdev.com'}>`,
        to,
        subject,
        text
      };
      
      if (html) {
        mailOptions.html = html;
      }
      logger.info("User id :" + userId);
      
      const info = await emailTransporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}: ${info.messageId}`);
      
      // Store notification in database
     // await this.storeNotification(userId, 'email', 'Email Notification', subject, text, { to, messageId: info.messageId });
      
      return info;
    } catch (error) {
      logger.error('Email sending failed:', error);
      throw error;
    }
  }
  
  static async sendSMS(to, message, userId = null) {
 
    try {

      if(process.env.NODE_ENV === 'development'){
           logger.info(`SMS sent to ${to}: ${message}`); 
           return `SMS sent to ${to}: ${message}`;
      }


      const data = {
              "to":to,
              "from":"Beavers",
              "sms": message,
              "type":"plain",
              "api_key":termii_api_key,
              "channel":"generic",
            };
    const options = {
    'method': 'POST',
    'url': `${termii_base_url}/api/sms/send`,
    'headers': {
      'Content-Type': ['application/json', 'application/json']
    },
    body: JSON.stringify(data)

    };
        

      const response = await axios.request(options);
      if(response.status !== 200) {
        logger.error(`Failed to send SMS to ${to}: ${response.statusText}`);
        throw new Error(`Failed to send SMS: ${response.statusText}`);
      }
      
      logger.info(`SMS sent to ${to}: ${message}`);
      // Store notification in database
     // await this.storeNotification(userId, 'sms', 'SMS Notification', 'Message', message, { to, sid: response.data });
      logger.info('SMS response: ' + response.data);

      return response.data; 
  
    } catch (error) {
      logger.error('SMS sending failed:', error);
      throw error;
    }
  }


     /**
   * Register FCM token for a user
   * @param {string} userId - User ID
   * @param {string} fcmToken - FCM token
   * @param {Object} deviceInfo - Device information
   * @returns {Promise<Object>} Registered device
   */
  static async registerFCMToken(userId, fcmToken, deviceInfo = {}) {
    const {
      deviceId,
      deviceName,
      deviceModel,
      osVersion,
      appVersion,
      platform
    } = deviceInfo;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Deactivate any existing tokens for this device if deviceId provided
      if (deviceId) {
        await client.query(
          `UPDATE user_devices 
           SET is_active = false, unregistered_at = NOW()
           WHERE user_id = $1 AND device_id = $2 AND fcm_token != $3`,
          [userId, deviceId, fcmToken]
        );
      }
      
      // Insert or update the token
      const result = await client.query(
        `INSERT INTO user_devices 
         (user_id, fcm_token, device_id, device_name, device_model, os_version, 
          app_version, platform, is_active, last_used, registered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
         ON CONFLICT (fcm_token) 
         DO UPDATE SET 
           user_id = EXCLUDED.user_id,
           device_id = COALESCE(EXCLUDED.device_id, user_devices.device_id),
           device_name = COALESCE(EXCLUDED.device_name, user_devices.device_name),
           device_model = COALESCE(EXCLUDED.device_model, user_devices.device_model),
           os_version = COALESCE(EXCLUDED.os_version, user_devices.os_version),
           app_version = COALESCE(EXCLUDED.app_version, user_devices.app_version),
           platform = COALESCE(EXCLUDED.platform, user_devices.platform),
           is_active = true,
           unregistered_at = NULL,
           last_used = NOW(),
           updated_at = NOW()
         RETURNING *`,
        [userId, fcmToken, deviceId, deviceName, deviceModel, osVersion, appVersion, platform]
      );
      
      // Cache the token for quick access
      await cacheSet(`fcm:token:${userId}`, fcmToken, 86400); // 24 hours
      
      await client.query('COMMIT');
      
      logger.info(`FCM token registered for user ${userId}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to register FCM token:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Unregister FCM token (logout or remove device)
   * @param {string} userId - User ID
   * @param {string} fcmToken - FCM token
   * @returns {Promise<boolean>} Success status
   */
  static async unregisterFCMToken(userId, fcmToken) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE user_devices 
         SET is_active = false, unregistered_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND fcm_token = $2
         RETURNING *`,
        [userId, fcmToken]
      );
      
      // Remove from cache
      await redis.del(`fcm:token:${userId}`);
      
      await client.query('COMMIT');
      
      if (result.rows.length > 0) {
        logger.info(`FCM token unregistered for user ${userId}`);
      }
      
      return result.rows.length > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to unregister FCM token:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get user's active FCM tokens
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of FCM tokens
   */
  static async getUserFCMTokens(userId) {
    try {
      // Check cache first
      const cachedToken = await cacheGet(`fcm:token:${userId}`);
      if (cachedToken) {
        return [cachedToken];
      }
      
      // Get from database
      const result = await pool.query(
        `SELECT fcm_token FROM user_devices 
         WHERE user_id = $1 AND is_active = true
         ORDER BY last_used DESC`,
        [userId]
      );
      
      const tokens = result.rows.map(row => row.fcm_token);
      
      // Cache the first token (most recent) for quick access
      if (tokens.length > 0) {
        await cacheSet(`fcm:token:${userId}`, tokens[0], 86400);
      }
      
      return tokens;
    } catch (error) {
      logger.error('Failed to get user FCM tokens:', error);
      return [];
    }
  }
  
  /**
   * Send push notification to a user
   * @param {string} userId - User ID
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {Object} data - Additional data payload
   * @param {string} priority - Priority (high, normal)
   * @returns {Promise<Object>} Send result
   */
  static async sendPushNotification(userId, title, body, data = {}, priority = 'high') {
    if (!firebaseApp) {
      logger.warn('Firebase not configured. Push notification not sent.');
      return { success: false, error: 'Firebase not configured' };
    }
    
    try {
      // Get user's active tokens
      const tokens = await this.getUserFCMTokens(userId);
      
      if (tokens.length === 0) {
        logger.info(`No active FCM tokens for user ${userId}`);
        return { success: false, error: 'No active tokens' };
      }
      
      // Create notification record
      const notificationRecord = await pool.query(
        `INSERT INTO push_notifications (user_id, title, body, data, priority, status)
         VALUES ($1, $2, $3, $4, $5, 'sending')
         RETURNING id`,
        [userId, title, body, data, priority]
      );
      
      const notificationId = notificationRecord.rows[0].id;
      
      // Prepare message
      const message = {
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          notification_id: notificationId.toString(),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          sound: 'default',
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        android: {
          priority: priority === 'high' ? 'high' : 'normal',
          notification: {
            sound: 'default',
            priority: priority,
          },
        },
        tokens,
      };
      
      // Send to Firebase
      const response = await admin.messaging().sendEachForMulticast(message);
      
      // Process results
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          
          // Log error
          logger.warn(`Failed to send to token ${tokens[idx]}: ${resp.error?.message}`);
        }
      });
      
      // Update notification status
      const {successCount} = response;
      const {failureCount} = response;
      
      await pool.query(
        `UPDATE push_notifications 
         SET status = $1, 
             sent_at = NOW(),
             metadata = $2
         WHERE id = $3`,
        [
          successCount > 0 ? 'sent' : 'failed',
          JSON.stringify({ successCount, failureCount, failedTokens }),
          notificationId
        ]
      );
      
      // Invalidate failed tokens
      if (failedTokens.length > 0) {
        await this.invalidateTokens(failedTokens);
      }
      
      logger.info(`Push notification sent to user ${userId}: ${successCount}/${tokens.length} successful`);
      
      return {
        success: true,
        notificationId,
        successCount,
        failureCount,
        failedTokens
      };
    } catch (error) {
      logger.error('Failed to send push notification:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Invalidate failed FCM tokens
   * @param {Array} tokens - Array of tokens to invalidate
   * @returns {Promise<void>}
   */
  static async invalidateTokens(tokens) {
    if (!tokens || tokens.length === 0) return;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const token of tokens) {
        // Mark token as inactive
        await client.query(
          `UPDATE user_devices 
           SET is_active = false, invalidated_at = NOW(), updated_at = NOW()
           WHERE fcm_token = $1`,
          [token]
        );
        
        // Record invalid token for analytics
        await client.query(
          `INSERT INTO invalid_tokens (token, reason)
           VALUES ($1, $2)`,
          [token, 'send_failure']
        );
      }
      
      await client.query('COMMIT');
      
      logger.info(`Invalidated ${tokens.length} FCM tokens`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to invalidate tokens:', error);
    } finally {
      client.release();
    }
  }
  
  /**
   * Update token last used timestamp
   * @param {string} fcmToken - FCM token
   * @returns {Promise<void>}
   */
  static async updateTokenLastUsed(fcmToken) {
    try {
      await pool.query(
        `UPDATE user_devices 
         SET last_used = NOW()
         WHERE fcm_token = $1`,
        [fcmToken]
      );
    } catch (error) {
      logger.error('Failed to update token last used:', error);
    }
  }
  
  /**
   * Get user devices
   * @param {string} userId - User ID
   * @returns {Promise<Array>} User devices
   */
  static async getUserDevices(userId) {
    const result = await pool.query(
      `SELECT id, device_id, device_name, device_model, os_version, 
              app_version, platform, is_active, last_used, registered_at
       FROM user_devices
       WHERE user_id = $1
       ORDER BY last_used DESC`,
      [userId]
    );
    
    return result.rows;
  }
  
  /**
   * Remove old inactive devices (cleanup job)
   * @param {number} daysInactive - Days of inactivity to consider
   * @returns {Promise<number>} Number of devices removed
   */
  static async cleanupInactiveDevices(daysInactive = 90) {
    const result = await pool.query(
      `UPDATE user_devices 
       SET is_active = false, 
           unregistered_at = NOW(),
           updated_at = NOW()
       WHERE is_active = true 
         AND last_used < NOW() - INTERVAL '${daysInactive} days'
       RETURNING id`,
      []
    );
    
    logger.info(`Cleaned up ${result.rowCount} inactive devices`);
    
    return result.rowCount;
  }
  
  /**
   * Get push notification statistics
   * @param {string} userId - User ID (optional)
   * @param {number} days - Days to look back
   * @returns {Promise<Object>} Statistics
   */
  static async getPushStats(userId = null, days = 30) {
    let query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicked,
        AVG(CASE WHEN clicked_at IS NOT NULL THEN EXTRACT(EPOCH FROM (clicked_at - sent_at)) END) as avg_click_time_seconds
      FROM push_notifications
      WHERE created_at > NOW() - INTERVAL '${days} days'
    `;
    
    const params = [];
    
    if (userId) {
      query += ` AND user_id = $1`;
      params.push(userId);
    }
    
    const result = await pool.query(query, params);
    
    return result.rows[0];
  }





   //////////////// **************************  ////////////////////////



  
  // Job-related notifications
  static async sendJobOfferNotification(artisanId, jobDetails) {
    const message = `New job offer: ${jobDetails.category} - ${jobDetails.description.substring(0, 100)}`;
    
    await this.sendPushNotification(artisanId, 'New Job Offer', message, {
      type: 'job_offer',
      jobId: jobDetails.jobId,
      category: jobDetails.category,
      distance: jobDetails.distance
    });
    
    // Also send SMS for urgent jobs
    if (jobDetails.serviceType === 'emergency') {
      const artisan = await pool.query(
        `SELECT phone FROM users WHERE id = $1`,
        [artisanId]
      );
      
      if (artisan.rows[0]?.phone) {
        await this.sendSMS(artisan.rows[0].phone, `BeaverWorks: ${message}`);
      }
    }
  }
  
  static async sendJobAcceptedNotification(clientId, jobDetails) {
    const message = `Your job has been accepted! An artisan is on the way.`;
    
    await this.sendPushNotification(clientId, 'Job Accepted', message, {
      type: 'job_accepted',
      jobId: jobDetails.jobId,
      artisanId: jobDetails.artisanId,
      artisanName: jobDetails.artisanName,
      arrival_pin: jobDetails.arrival_pin,
    });
  }
  
  static async sendArrivalNotification(clientId, jobDetails) {
    const message = `The artisan has arrived at your location. Please provide the arrival PIN.`;
    
    await this.sendPushNotification(clientId, 'Artisan Arrived', message, {
      type: 'arrival',
      jobId: jobDetails.jobId
    });
    
    // Send SMS as well for important notification
    const client = await pool.query(
      `SELECT phone FROM users WHERE id = $1`,
      [clientId]
    );
    
    if (client.rows[0]?.phone) {
      await this.sendSMS(client.rows[0].phone, `BeaverWorks: ${message}`);
    }
  }
  
  static async sendJobCompletionNotification(clientId, jobDetails) {
    const message = 'Your job has been completed. Please review and make payment.';
    
    await this.sendPushNotification(clientId, 'Job Completed', message, {
      type: 'job_completed',
      jobId: jobDetails.jobId,
      amount: jobDetails.amount
    });
  }
  
  static async sendPaymentConfirmation(userId, amount, jobId) {
    const message = `Payment of ₦${amount.toLocaleString()} for job ${jobId.slice(0, 8)} has been processed successfully.`;
    
    await this.sendPushNotification(userId, 'Payment Confirmed', message, {
      type: 'payment_confirmed',
      jobId,
      amount
    });
    
    // Send email confirmation
    const user = await pool.query(
      `SELECT email FROM users WHERE id = $1`,
      [userId]
    );
    
    if (user.rows[0]?.email) {
      await this.sendEmail(
        user.rows[0].email,
        'Payment Confirmed',
        message,
        `<h2>Payment Confirmed</h2><p>${message}</p><p>Thank you for using BeaverWorks!</p>`
      );
    }
  }
  
  static async sendDisputeNotification(userId, disputeDetails) {
    const message = `A dispute has been filed for job ${disputeDetails.jobId.slice(0, 8)}. We will review it shortly.`;
    
    await this.sendPushNotification(userId, 'Dispute Filed', message, {
      type: 'dispute',
      disputeId: disputeDetails.disputeId,
      jobId: disputeDetails.jobId
    });
  }
  
  static async sendDisputeResolutionNotification(userId, disputeDetails) {
    const message = `Your dispute has been resolved: ${disputeDetails.resolution}`;
    
    await this.sendPushNotification(userId, 'Dispute Resolved', message, {
      type: 'dispute_resolved',
      disputeId: disputeDetails.disputeId,
      resolution: disputeDetails.resolution
    });
  }
  
  static async sendVerificationCode(email, code) {
    await this.sendEmail(
      email,
      'Verify Your Email',
      `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
      `<h2>Email Verification</h2><p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`
    );
  }
  
  static async sendPasswordResetEmail(email, resetToken) {
    const resetUrl = `${process.env.APP_FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    await this.sendEmail(
      email,
      'Reset Your Password',
      `Click here to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
      `<h2>Password Reset</h2><p>Click <a href="${resetUrl}">here</a> to reset your password.</p><p>This link expires in 1 hour.</p>`
    );
  }
  
  static async sendWelcomeEmail(userId, userType) {
    const user = await pool.query(
      `SELECT email, 
              CASE WHEN user_type = 'client' THEN cp.full_legal_name 
                   WHEN user_type = 'artisan' THEN ap.full_legal_name 
              END as name
       FROM users u
       LEFT JOIN client_profiles cp ON u.id = cp.user_id
       LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
       WHERE u.id = $1`,
      [userId]
    );
    
    if (user.rows.length === 0) return;
    
    const { email, name } = user.rows[0];
    
    let message = '';
    if (userType === 'client') {
      message = `Welcome to BeaverWorks, ${name}! Post your first job and get connected with verified professionals.`;
    } else {
      message = `Welcome to BeaverWorks, ${name}! Complete your profile and start receiving job offers.`;
    }
    
    await this.sendEmail(
      email,
      'Welcome to BeaverWorks!',
      message,
      `<h2>Welcome to BeaverWorks!</h2><p>${message}</p><p>Get started today!</p>`
    );
  }
  
  static async sendMonthlyStatement(userId, userType, statementData) {
    const user = await pool.query(
      `SELECT email FROM users WHERE id = $1`,
      [userId]
    );
    
    if (user.rows.length === 0) return;
    
    let subject = '';
    let body = '';
    
    if (userType === 'client') {
      subject = 'Your Monthly Activity Summary';
      body = `Here's your summary for ${statementData.month}: ${statementData.jobsCompleted} jobs completed, ₦${statementData.totalSpent} spent.`;
    } else {
      subject = 'Your Monthly Earnings Report';
      body = `Here's your earnings summary for ${statementData.month}: ₦${statementData.totalEarnings} earned from ${statementData.jobsCompleted} jobs.`;
    }
    
    await this.sendEmail(user.rows[0].email, subject, body);
  }
  
  static async sendBulkNotification(userIds, title, message, data = {}) {
    const results = [];
    
    for (const userId of userIds) {
      try {
        const result = await this.sendPushNotification(userId, title, message, data);
        results.push({ userId, success: true, notificationId: result?.id });
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
      }
    }
    
    logger.info(`Bulk notification sent to ${results.filter(r => r.success).length}/${userIds.length} users`);
    
    return results;
  }
  
  static async getNotificationHistory(userId, filters = {}) {
    const { page = 1, limit = 20, type, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM notifications
      WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;
    
    if (type) {
      query += ` AND type = $${paramIndex}`;
      params.push(type);
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
      SELECT COUNT(*) FROM notifications WHERE user_id = $1
      ${type ? 'AND type = $2' : ''}
    `;
    const countParams = type ? [userId, type] : [userId];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      notifications: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
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
  
  static async getUnreadCount(userId) {
    const result = await pool.query(
      `SELECT COUNT(*) FROM notifications 
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    
    return parseInt(result.rows[0].count);
  }
}

module.exports = NotificationService;