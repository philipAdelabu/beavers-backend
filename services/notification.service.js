// eslint-disable-next-line import/no-extraneous-dependencies
const admin = require('firebase-admin');
const axios = require('axios');
const serviceAccount = require('../configurations/beaver-works-firebase.json');
const nodemailer = require('nodemailer');
const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet , cacheDel} = require('../config/redis');
const { logger } = require('../config/logger');


// const { entityType, entityId, action, userId, oldData, newData, ipAddress, userAgent } = logData;
const LogService = require('../services/log.services');


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
    } = deviceInfo;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Deactivate old tokens for same device
      if (deviceId) {
        await client.query(
          `UPDATE user_devices 
           SET is_active = false, unregistered_at = NOW(), updated_at = NOW()
           WHERE user_id = $1 AND device_info->>'device_id' = $2 AND fcm_token != $3`,
          [userId, deviceId, fcmToken]
        );
      }
      
      // Insert or update token
      const result = await client.query(
        `INSERT INTO user_devices 
         (user_id, fcm_token, device_info, is_active, last_used, updated_at)
         VALUES ($1, $2, $3, true, NOW(), NOW())
         ON CONFLICT (fcm_token) 
         DO UPDATE SET 
           user_id = EXCLUDED.user_id,
           device_info = COALESCE(EXCLUDED.device_info, user_devices.device_info),
           is_active = true,
           unregistered_at = NULL,
           last_used = NOW(),
           updated_at = NOW()
         RETURNING *`,
        [userId, fcmToken, deviceInfo]
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
      await cacheDel(`fcm:token:${userId}`);
      
      await client.query('COMMIT');
      
      if (result.rows.length > 0) {
        logger.info(`FCM token unregistered for user ${userId}`);
      }
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to unregister FCM token:', error);
      throw error;
    } finally {
      client.release();
    }
  }

    /**
   * Get user devices
   * @param {string} userId - User ID
   * @returns {Promise<Array>} User devices
   */
  static async getUserDevices(userId) {
    const result = await pool.query(
      `SELECT * FROM user_devices
       WHERE user_id = $1
       ORDER BY last_used DESC`,
      [userId]
    );
    
    return result.rows;
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

    const pref = await this.getPreferences(userId);

    if(!pref){
      throw Error('User Notification preference not found');
    }

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

       // Create in-app notification
        await this.createInAppNotification(userId, title, body, { ...data, channel: 'push' });

      if (!firebaseApp) {
        logger.warn('Firebase not configured');
        return { success: false, error: 'Firebase not configured' };
      }

      logger.info('Firebase configured');
      
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
        text,
      };
      
      if (html) {
        mailOptions.html = html;
      }
      logger.info("User id :" + userId);
      
      const info = await emailTransporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}: ${info.messageId}`);
      
 
      return info;
    } catch (error) {
      logger.error('Email sending failed:', error);
      return { success: false, error: 'Mailing fail' };
    }
  }
    
    /**
     * Send email notification
     */
    static async sendEmailNotification(userId, title, body, data = {}) {
      try {
          // Store in notifications table
        await this.createInAppNotification(userId, title, body, { ...data, channel: 'email' });
        

        const userResult = await pool.query(
          `SELECT email FROM users WHERE id = $1`,
          [userId]
        );
        
        if (userResult.rows.length === 0 || !userResult.rows[0].email) {
          return { success: false, error: 'User email not found' };
        }
        
        const { email } = userResult.rows[0];
       const info = await this.sendEmail(email, title, body, userId, true) 
        return { success: true, messageId: info.messageId };
      } catch (error) {
        logger.error('Email notification error:', error);
        return { success: false, error: error.message };
      }
    }
    
    // ==================== SMS Notifications ====================
    
      
  static async sendSMS(to, message, userId = null) {
 
    try {
     
      if(process.env.NODE_ENV === 'development'){
           logger.info(`SMS sent to ${to}: ${message}`); 
           return `SMS sent to ${to}: ${message}`;
      } 

      logger.info(`SMS sent to ${to}: ${message}`); 
      const data = {
              "to":to,
              "from":"Beavers",
              "sms": message,
              "type":"plain",
              "api_key":termii_api_key,
              "channel":"generic",
            };

    const options = {
    'headers': {
      'Content-Type': ['application/json', 'application/json']
    },
};
        
     const url = `${termii_base_url}/api/sms/send`;
      const response = await axios.post(url, data, { headers: options.headers });
      if(response.status !== 200) {
        logger.error(`Failed to send SMS to ${to}: ${response.statusText}`);
          return { success: false, error: 'SMS failed' };
      }
      
      logger.info(`SMS sent to ${to}: ${message}`);

      return response.data; 
  
    } catch (error) {
      logger.error('SMS sending failed:', error);
      throw error;
    }
  }

    /**
     * Send SMS notification
     */
    static async sendSMSNotification(userId, message) {
      try {
        const userResult = await pool.query(
          `SELECT phone FROM users WHERE id = $1`,
          [userId]
        );
        
        if (userResult.rows.length === 0 || !userResult.rows[0].phone) {
          return { success: false, error: 'User phone not found' };
        }
        const { phone } = userResult.rows[0];
        const title = 'Beavers Notification';
         const data = {
              "to":phone,
              "from":"Beavers",
              "sms": message,
              "type":"plain",
            };
        // Store in notifications table
        await this.createInAppNotification(userId, title, message, { ...data, channel: 'sms' });
        const result = await this.sendSMS(phone, message, userId);
        
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




  //// =========   ++++++++++    Yet to be Touched   ///////////////////

   
   

 

 


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
  


  /////////////////////////    ADDED SOME NEW FUNCTIONALITY TO GET NOTIFICATIONS BY TYPE  /////////////////////////
 

   

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

  
 
 
 
  static async getByType(userId, type, limit = 20) {
    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 AND type = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, type, limit]
    );
    
    return result.rows;
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

   static async deleteAll(userId) {
    const result = await pool.query(
      `DELETE FROM notifications 
       WHERE user_id = $1
       RETURNING *`,
      [userId]
    );
    
    return result.rows;
  } 


    /**
   * Send payment confirmed notification
   */
  static async sendPaymentConfirmed(userId, amount, jobId) {
    const title = 'Payment Confirmed!';
    const body = `₦${amount.toLocaleString()} payment confirmed for job #${jobId.slice(0, 8)}`;
    const data = {
      type: 'payment_confirmed',
      jobId,
      amount
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