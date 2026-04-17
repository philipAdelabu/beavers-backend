const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const twilio = require('twilio');

let twilioClient = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

class SMSService {
  static async sendSMS(to, message, options = {}) {
    if (!twilioClient) {
      logger.warn('Twilio not configured. SMS not sent.');
      return { success: false, error: 'Twilio not configured' };
    }
    
    try {
      // Format phone number
      let formattedNumber = to;
      if (!to.startsWith('+')) {
        formattedNumber = `+234${to.replace(/^0/, '')}`;
      }
      
      const result = await twilioClient.messages.create({
        body: message,
        to: formattedNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
        statusCallback: options.statusCallback || null
      });
      
      // Log SMS
      await this.logSMS(to, message, result.sid, 'sent');
      
      logger.info(`SMS sent to ${to}: ${result.sid}`);
      
      return {
        success: true,
        messageId: result.sid,
        status: result.status
      };
    } catch (error) {
      logger.error('SMS sending failed:', error);
      
      await this.logSMS(to, message, null, 'failed', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  static async sendBulkSMS(recipients, message, options = {}) {
    const results = [];
    
    for (const recipient of recipients) {
      const result = await this.sendSMS(recipient, message, options);
      results.push({ recipient, ...result });
      
      // Rate limiting: wait 1 second between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const successCount = results.filter(r => r.success).length;
    logger.info(`Bulk SMS sent: ${successCount}/${recipients.length} successful`);
    
    return {
      total: recipients.length,
      successful: successCount,
      failed: recipients.length - successCount,
      results
    };
  }
  
  static async sendVerificationCode(phone, code) {
    const message = `Your BeaverWorks verification code is: ${code}. This code expires in 10 minutes.`;
    return await this.sendSMS(phone, message);
  }
  
  static async sendJobOfferNotification(phone, artisanName, jobDetails) {
    const message = `Hi ${artisanName}, new job offer: ${jobDetails.category} - ${jobDetails.description.substring(0, 80)}. Check app now!`;
    return await this.sendSMS(phone, message);
  }
  
  static async sendJobAcceptedNotification(phone, clientName) {
    const message = `Hi ${clientName}, your job has been accepted! An artisan is on the way. Track them in the app.`;
    return await this.sendSMS(phone, message);
  }
  
  static async sendArrivalNotification(phone, clientName, pin) {
    const message = `Hi ${clientName}, the artisan has arrived. Please provide this PIN: ${pin}`;
    return await this.sendSMS(phone, message);
  }
  
  static async sendPaymentConfirmation(phone, amount, jobId) {
    const message = `Payment of ₦${amount.toLocaleString()} for job ${jobId.slice(0, 8)} confirmed. Thank you for using BeaverWorks!`;
    return await this.sendSMS(phone, message);
  }
  
  static async sendDisputeNotification(phone, jobId) {
    const message = `A dispute has been filed for job ${jobId.slice(0, 8)}. We'll review it within 24 hours.`;
    return await this.sendSMS(phone, message);
  }
  
  static async sendWithdrawalConfirmation(phone, amount, reference) {
    const message = `Withdrawal of ₦${amount.toLocaleString()} (Ref: ${reference}) has been processed. Funds will reflect in 1-3 business days.`;
    return await this.sendSMS(phone, message);
  }
  
  static async sendMonthlyFeeReminder(phone, artisanName, dueDate) {
    const message = `Hi ${artisanName}, your monthly technology fee of ₦5,000 is due on ${dueDate}. Pay now to avoid service interruption.`;
    return await this.sendSMS(phone, message);
  }
  
  static async logSMS(phone, message, messageId, status, error = null) {
    await pool.query(
      `INSERT INTO sms_logs (phone, message, message_id, status, error, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [phone, message, messageId, status, error]
    );
  }
  
  static async getSMSLogs(filters = {}) {
    const { phone, status, startDate, endDate, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM sms_logs WHERE 1=1`;
    const params = [];
    let paramIndex = 1;
    
    if (phone) {
      query += ` AND phone = $${paramIndex}`;
      params.push(phone);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND sent_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND sent_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY sent_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM sms_logs
      WHERE 1=1
      ${phone ? `AND phone = '${phone}'` : ''}
      ${status ? `AND status = '${status}'` : ''}
    `;
    const countResult = await pool.query(countQuery);
    
    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async getSMSStats(days = 30) {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_sent,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        DATE_TRUNC('day', sent_at) as date
      FROM sms_logs
      WHERE sent_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('day', sent_at)
      ORDER BY date DESC
    `);
    
    return result.rows;
  }
  
  static async getTwilioBalance() {
    if (!twilioClient) {
      return { success: false, error: 'Twilio not configured' };
    }
    
    try {
      const balance = await twilioClient.balance.fetch();
      return {
        success: true,
        balance: balance.balance,
        currency: balance.currency
      };
    } catch (error) {
      logger.error('Failed to fetch Twilio balance:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SMSService;