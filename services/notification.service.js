const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

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

// Twilio client for SMS
const twilioClient = process.env.TWILIO_ACCOUNT_SID ? twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
) : null;

class NotificationService {
  static async sendEmail(to, subject, text, html = null) {
    try {
      const mailOptions = {
        from: `"BeaverWorks" <${process.env.EMAIL_FROM || 'noreply@beaverworks.com'}>`,
        to,
        subject,
        text
      };
      
      if (html) {
        mailOptions.html = html;
      }
      
      const info = await emailTransporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}: ${info.messageId}`);
      
      // Store notification in database
      await this.storeNotification(null, 'email', subject, text, { to, messageId: info.messageId });
      
      return info;
    } catch (error) {
      logger.error('Email sending failed:', error);
      throw error;
    }
  }
  
  static async sendSMS(to, message) {
    if (!twilioClient) {
      logger.warn('Twilio not configured, SMS not sent');
      return null;
    }
    
    try {
      const result = await twilioClient.messages.create({
        body: message,
        to,
        from: process.env.TWILIO_PHONE_NUMBER
      });
      
      logger.info(`SMS sent to ${to}: ${result.sid}`);
      
      // Store notification in database
      await this.storeNotification(null, 'sms', 'SMS Notification', message, { to, sid: result.sid });
      
      return result;
    } catch (error) {
      logger.error('SMS sending failed:', error);
      throw error;
    }
  }
  
  static async sendPushNotification(userId, title, body, data = {}) {
    try {
      // Get user's FCM tokens
      const tokens = await this.getUserFCMTokens(userId);
      
      if (tokens.length === 0) {
        logger.info(`No FCM tokens found for user ${userId}`);
        return;
      }
      
      // Store notification in database
      const notification = await this.storeNotification(userId, 'push', title, body, data);
      
      // Send to Firebase Cloud Messaging (would need FCM setup)
      // This is a placeholder - actual FCM integration would go here
      logger.info(`Push notification sent to user ${userId}: ${title}`);
      
      return notification;
    } catch (error) {
      logger.error('Push notification failed:', error);
      throw error;
    }
  }
  
  static async storeNotification(userId, channel, title, message, metadata = {}) {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data, channel, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'sent')
       RETURNING *`,
      [userId, channel, title, message, metadata, channel]
    );
    
    return result.rows[0];
  }
  
  static async getUserFCMTokens(userId) {
    const result = await pool.query(
      `SELECT fcm_token FROM user_devices WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    
    return result.rows.map(row => row.fcm_token);
  }
  
  static async registerFCMToken(userId, fcmToken, deviceInfo = {}) {
    const result = await pool.query(
      `INSERT INTO user_devices (user_id, fcm_token, device_info, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (fcm_token) DO UPDATE SET is_active = true, last_used = NOW()
       RETURNING *`,
      [userId, fcmToken, deviceInfo]
    );
    
    return result.rows[0];
  }
  
  static async unregisterFCMToken(userId, fcmToken) {
    const result = await pool.query(
      `UPDATE user_devices SET is_active = false WHERE user_id = $1 AND fcm_token = $2
       RETURNING *`,
      [userId, fcmToken]
    );
    
    return result.rows[0];
  }
  
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
      artisanName: jobDetails.artisanName
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
    const message = `Your job has been completed. Please review and make payment.`;
    
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