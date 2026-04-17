const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

// Email transporter
let emailTransporter = null;

if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
  emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

// Load email templates
const templateCache = {};

const loadTemplate = (templateName) => {
  if (templateCache[templateName]) {
    return templateCache[templateName];
  }
  
  const templatePath = path.join(__dirname, '../templates/email', `${templateName}.hbs`);
  
  try {
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateContent);
    templateCache[templateName] = template;
    return template;
  } catch (error) {
    logger.error(`Failed to load email template ${templateName}:`, error);
    return null;
  }
};

class EmailService {
  static async sendEmail(to, subject, text, html = null, options = {}) {
    if (!emailTransporter) {
      logger.warn('Email transporter not configured. Email not sent.');
      return { success: false, error: 'Email not configured' };
    }
    
    try {
      const mailOptions = {
        from: `"BeaverWorks" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        ...options
      };
      
      if (html) {
        mailOptions.html = html;
      }
      
      const info = await emailTransporter.sendMail(mailOptions);
      
      // Log email
      await this.logEmail(to, subject, info.messageId, 'sent');
      
      logger.info(`Email sent to ${to}: ${info.messageId}`);
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      logger.error('Email sending failed:', error);
      
      await this.logEmail(to, subject, null, 'failed', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  static async sendTemplateEmail(to, subject, templateName, templateData) {
    const template = loadTemplate(templateName);
    
    if (!template) {
      return await this.sendEmail(to, subject, `Template ${templateName} not found. Please check your email.`);
    }
    
    const html = template(templateData);
    const text = this.generatePlainText(html);
    
    return await this.sendEmail(to, subject, text, html);
  }
  
  static generatePlainText(html) {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  static async sendVerificationEmail(email, code, name) {
    const templateData = {
      name,
      code,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks'
    };
    
    return await this.sendTemplateEmail(
      email,
      'Verify Your Email Address',
      'verification',
      templateData
    );
  }
  
  static async sendWelcomeEmail(email, name, userType) {
    const templateData = {
      name,
      userType,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks',
      loginUrl: `${process.env.APP_FRONTEND_URL}/login`
    };
    
    return await this.sendTemplateEmail(
      email,
      `Welcome to BeaverWorks, ${name}!`,
      'welcome',
      templateData
    );
  }
  
  static async sendPasswordResetEmail(email, name, resetToken) {
    const resetUrl = `${process.env.APP_FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const templateData = {
      name,
      resetUrl,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks',
      expiresIn: '1 hour'
    };
    
    return await this.sendTemplateEmail(
      email,
      'Reset Your Password',
      'password_reset',
      templateData
    );
  }
  
  static async sendJobOfferEmail(artisanEmail, artisanName, jobDetails) {
    const templateData = {
      name: artisanName,
      jobTitle: jobDetails.category,
      jobDescription: jobDetails.description,
      distance: jobDetails.distance,
      serviceType: jobDetails.serviceType,
      acceptUrl: `${process.env.APP_FRONTEND_URL}/jobs/${jobDetails.jobId}/accept`,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks'
    };
    
    return await this.sendTemplateEmail(
      artisanEmail,
      'New Job Offer!',
      'job_offer',
      templateData
    );
  }
  
  static async sendJobAcceptedEmail(clientEmail, clientName, jobDetails) {
    const templateData = {
      name: clientName,
      jobId: jobDetails.jobId.slice(0, 8),
      artisanName: jobDetails.artisanName,
      estimatedArrival: jobDetails.estimatedArrival,
      trackUrl: `${process.env.APP_FRONTEND_URL}/jobs/${jobDetails.jobId}/track`,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks'
    };
    
    return await this.sendTemplateEmail(
      clientEmail,
      'Your Job Has Been Accepted!',
      'job_accepted',
      templateData
    );
  }
  
  static async sendJobCompletedEmail(clientEmail, clientName, jobDetails) {
    const templateData = {
      name: clientName,
      jobId: jobDetails.jobId.slice(0, 8),
      artisanName: jobDetails.artisanName,
      amount: jobDetails.amount,
      paymentUrl: `${process.env.APP_FRONTEND_URL}/jobs/${jobDetails.jobId}/payment`,
      reviewUrl: `${process.env.APP_FRONTEND_URL}/jobs/${jobDetails.jobId}/review`,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks'
    };
    
    return await this.sendTemplateEmail(
      clientEmail,
      'Job Completed - Payment Required',
      'job_completed',
      templateData
    );
  }
  
  static async sendPaymentConfirmationEmail(email, name, jobDetails) {
    const templateData = {
      name,
      jobId: jobDetails.jobId.slice(0, 8),
      amount: jobDetails.amount,
      paymentMethod: jobDetails.paymentMethod,
      date: new Date().toLocaleDateString(),
      invoiceUrl: `${process.env.APP_FRONTEND_URL}/invoices/${jobDetails.invoiceId}`,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks'
    };
    
    return await this.sendTemplateEmail(
      email,
      'Payment Confirmed',
      'payment_confirmation',
      templateData
    );
  }
  
  static async sendDisputeResolutionEmail(email, name, disputeDetails) {
    const templateData = {
      name,
      disputeId: disputeDetails.id.slice(0, 8),
      resolution: disputeDetails.resolution,
      decision: disputeDetails.decision,
      amount: disputeDetails.amount,
      message: disputeDetails.message,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks'
    };
    
    return await this.sendTemplateEmail(
      email,
      'Dispute Resolution Update',
      'dispute_resolution',
      templateData
    );
  }
  
  static async sendMonthlyStatementEmail(email, name, statementData, userType) {
    const templateData = {
      name,
      userType,
      month: statementData.month,
      jobsCompleted: statementData.jobsCompleted,
      totalSpent: statementData.totalSpent,
      totalEarned: statementData.totalEarned,
      averageRating: statementData.averageRating,
      reportUrl: `${process.env.APP_FRONTEND_URL}/reports/monthly`,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks'
    };
    
    return await this.sendTemplateEmail(
      email,
      `Your ${statementData.month} Activity Summary`,
      'monthly_statement',
      templateData
    );
  }
  
  static async sendVerificationStatusEmail(email, name, status, reason = null) {
    const templateData = {
      name,
      status,
      reason,
      year: new Date().getFullYear(),
      appName: 'BeaverWorks',
      supportEmail: 'support@beaverworks.com'
    };
    
    const subject = status === 'approved' 
      ? 'Your Account Has Been Verified!' 
      : 'Account Verification Status Update';
    
    return await this.sendTemplateEmail(
      email,
      subject,
      'verification_status',
      templateData
    );
  }
  
  static async sendBulkEmail(recipients, subject, templateName, templateData) {
    const results = [];
    
    for (const recipient of recipients) {
      const result = await this.sendTemplateEmail(recipient.email, subject, templateName, {
        ...templateData,
        name: recipient.name
      });
      
      results.push({ email: recipient.email, ...result });
      
      // Rate limiting: wait 1 second between emails
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const successCount = results.filter(r => r.success).length;
    logger.info(`Bulk email sent: ${successCount}/${recipients.length} successful`);
    
    return {
      total: recipients.length,
      successful: successCount,
      failed: recipients.length - successCount,
      results
    };
  }
  
  static async logEmail(to, subject, messageId, status, error = null) {
    await pool.query(
      `INSERT INTO email_logs (recipient, subject, message_id, status, error, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [to, subject, messageId, status, error]
    );
  }
  
  static async getEmailLogs(filters = {}) {
    const { recipient, status, startDate, endDate, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM email_logs WHERE 1=1`;
    const params = [];
    let paramIndex = 1;
    
    if (recipient) {
      query += ` AND recipient = $${paramIndex}`;
      params.push(recipient);
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
      SELECT COUNT(*) FROM email_logs
      WHERE 1=1
      ${recipient ? `AND recipient = '${recipient}'` : ''}
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
  
  static async getEmailStats(days = 30) {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_sent,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        DATE_TRUNC('day', sent_at) as date
      FROM email_logs
      WHERE sent_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('day', sent_at)
      ORDER BY date DESC
    `);
    
    return result.rows;
  }
  
  static async verifyEmailConnection() {
    if (!emailTransporter) {
      return { success: false, error: 'Email transporter not configured' };
    }
    
    try {
      await emailTransporter.verify();
      return { success: true };
    } catch (error) {
      logger.error('Email connection verification failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = EmailService;