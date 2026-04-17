const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');

// Firebase Admin SDK
let admin = null;
try {
  admin = require('firebase-admin');
  
  if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }
} catch (error) {
  logger.warn('Firebase Admin SDK not available:', error.message);
}

class PushService {
  static async sendPushNotification(userId, title, body, data = {}, priority = 'high') {
    try {
      // Get user's FCM tokens
      const tokens = await this.getUserFCMTokens(userId);
      
      if (tokens.length === 0) {
        logger.info(`No FCM tokens found for user ${userId}`);
        return { success: false, reason: 'no_tokens' };
      }
      
      if (!admin) {
        logger.warn('Firebase not configured, push notification not sent');
        return { success: false, reason: 'firebase_not_configured' };
      }
      
      const message = {
        notification: {
          title,
          body,
        },
        data: {
          ...data,
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
      
      const response = await admin.messaging().sendEachForMulticast(message);
      
      // Handle failed tokens
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      
      if (failedTokens.length > 0) {
        await this.invalidateTokens(failedTokens);
      }
      
      logger.info(`Push notification sent to user ${userId}: ${response.successCount}/${tokens.length} successful`);
      
      // Store notification in database
      await this.storeNotification(userId, title, body, data, 'push');
      
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      logger.error('Push notification failed:', error);
      return { success: false, error: error.message };
    }
  }
  
  static async sendBulkPush(userIds, title, body, data = {}) {
    const results = [];
    
    for (const userId of userIds) {
      const result = await this.sendPushNotification(userId, title, body, data);
      results.push({ userId, ...result });
    }
    
    const successCount = results.filter(r => r.success).length;
    logger.info(`Bulk push sent: ${successCount}/${userIds.length} successful`);
    
    return {
      total: userIds.length,
      successful: successCount,
      failed: userIds.length - successCount,
      results,
    };
  }
  
  static async sendToTopic(topic, title, body, data = {}) {
    if (!admin) {
      logger.warn('Firebase not configured');
      return { success: false };
    }
    
    try {
      const message = {
        notification: { title, body },
        data,
        topic,
      };
      
      const response = await admin.messaging().send(message);
      logger.info(`Push notification sent to topic ${topic}: ${response}`);
      
      return { success: true, messageId: response };
    } catch (error) {
      logger.error('Topic push failed:', error);
      return { success: false, error: error.message };
    }
  }
  
  static async registerToken(userId, fcmToken, deviceInfo = {}) {
    const result = await pool.query(
      `INSERT INTO user_devices (user_id, fcm_token, device_info, is_active, last_used)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (fcm_token) DO UPDATE 
       SET user_id = EXCLUDED.user_id,
           is_active = true,
           last_used = NOW(),
           device_info = EXCLUDED.device_info
       RETURNING *`,
      [userId, fcmToken, deviceInfo]
    );
    
    logger.info(`FCM token registered for user ${userId}`);
    
    return result.rows[0];
  }
  
  static async unregisterToken(userId, fcmToken) {
    const result = await pool.query(
      `UPDATE user_devices 
       SET is_active = false, unregistered_at = NOW()
       WHERE user_id = $1 AND fcm_token = $2
       RETURNING *`,
      [userId, fcmToken]
    );
    
    if (result.rows.length > 0) {
      logger.info(`FCM token unregistered for user ${userId}`);
    }
    
    return result.rows[0];
  }
  
  static async getUserFCMTokens(userId) {
    const result = await pool.query(
      `SELECT fcm_token FROM user_devices 
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    
    return result.rows.map(row => row.fcm_token);
  }
  
  static async invalidateTokens(tokens) {
    if (tokens.length === 0) return;
    
    await pool.query(
      `UPDATE user_devices 
       SET is_active = false, invalidated_at = NOW()
       WHERE fcm_token = ANY($1::text[])`,
      [tokens]
    );
    
    logger.info(`Invalidated ${tokens.length} FCM tokens`);
  }
  
  static async storeNotification(userId, title, body, data, channel) {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data, channel, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING *`,
      [userId, data.type || 'push', title, body, data, channel]
    );
    
    return result.rows[0];
  }
  
  // Push notification templates
  static async sendJobOffer(artisanId, jobDetails) {
    return await this.sendPushNotification(
      artisanId,
      'New Job Offer!',
      `${jobDetails.category}: ${jobDetails.description.substring(0, 100)}`,
      {
        type: 'job_offer',
        jobId: jobDetails.jobId,
        category: jobDetails.category,
        distance: jobDetails.distance?.toString(),
      },
      'high'
    );
  }
  
  static async sendJobAccepted(clientId, jobDetails) {
    return await this.sendPushNotification(
      clientId,
      'Job Accepted',
      `An artisan has accepted your job and is on the way!`,
      {
        type: 'job_accepted',
        jobId: jobDetails.jobId,
        artisanId: jobDetails.artisanId,
      },
      'high'
    );
  }
  
  static async sendArrivalPin(clientId, pin, jobId) {
    return await this.sendPushNotification(
      clientId,
      'Artisan Has Arrived',
      `Please provide this PIN to confirm arrival: ${pin}`,
      {
        type: 'arrival_pin',
        jobId,
        pin,
      },
      'high'
    );
  }
  
  static async sendJobCompleted(clientId, jobId) {
    return await this.sendPushNotification(
      clientId,
      'Job Completed',
      'Your job has been marked as completed. Please review and make payment.',
      {
        type: 'job_completed',
        jobId,
      },
      'normal'
    );
  }
  
  static async sendPaymentConfirmed(userId, amount, jobId, userType) {
    return await this.sendPushNotification(
      userId,
      'Payment Confirmed',
      `Your payment of ₦${amount.toLocaleString()} has been confirmed.`,
      {
        type: 'payment_confirmed',
        jobId,
        amount: amount.toString(),
        userType,
      },
      'normal'
    );
  }
  
  static async sendDisputeUpdate(userId, disputeId, status) {
    return await this.sendPushNotification(
      userId,
      'Dispute Update',
      `Your dispute (ID: ${disputeId.slice(0, 8)}) has been ${status}.`,
      {
        type: 'dispute_update',
        disputeId,
        status,
      },
      'normal'
    );
  }
  
  static async sendVerificationReminder(userId, userType) {
    return await this.sendPushNotification(
      userId,
      'Complete Your Verification',
      'Please complete your account verification to access all features.',
      {
        type: 'verification_reminder',
        userType,
      },
      'normal'
    );
  }
  
  static async sendMonthlyFeeReminder(artisanId, daysUntilDue) {
    let urgency = 'normal';
    let title = 'Monthly Fee Reminder';
    let body = `Your monthly technology fee is due in ${daysUntilDue} days.`;
    
    if (daysUntilDue <= 3) {
      urgency = 'high';
      title = '⚠️ Monthly Fee Due Soon';
      body = `Your monthly fee is due in ${daysUntilDue} days. Pay now to avoid suspension.`;
    }
    
    return await this.sendPushNotification(
      artisanId,
      title,
      body,
      {
        type: 'fee_reminder',
        daysUntilDue: daysUntilDue.toString(),
      },
      urgency
    );
  }
  
  static async sendPromotion(userId, promotionDetails) {
    return await this.sendPushNotification(
      userId,
      `Special Offer: ${promotionDetails.title}`,
      promotionDetails.description,
      {
        type: 'promotion',
        promotionId: promotionDetails.id,
        code: promotionDetails.code,
      },
      'normal'
    );
  }
  
  static async getDeviceStats() {
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_devices,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_devices,
        DATE_TRUNC('day', last_used) as last_used_date
      FROM user_devices
      WHERE last_used > NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', last_used)
      ORDER BY last_used_date DESC
    `);
    
    return result.rows;
  }
  
  static async testNotification(fcmToken, title, body) {
    if (!admin) {
      return { success: false, error: 'Firebase not configured' };
    }
    
    try {
      const message = {
        notification: { title, body },
        token: fcmToken,
      };
      
      const response = await admin.messaging().send(message);
      return { success: true, messageId: response };
    } catch (error) {
      logger.error('Test notification failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = PushService;