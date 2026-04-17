const nodemailer = require('nodemailer');
const { logger } = require('./logger');
const path = require('path');
const fs = require('fs');

let transporter = null;

// Email templates directory
const templatesDir = path.join(__dirname, '../templates/email');

/**
 * Create email transporter based on configuration
 */
const createTransporter = () => {
  if (process.env.SENDGRID_API_KEY) {
    // Use SendGrid
    transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
    logger.info('SendGrid email transporter created');
  } else if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
    // Use SMTP
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    logger.info('SMTP email transporter created');
  } else {
    logger.warn('Email credentials not found. Email features disabled.');
  }
};

createTransporter();

/**
 * Send email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 * @param {string} html - HTML body
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Send result
 */
const sendEmail = async (to, subject, text, html = null, options = {}) => {
  if (!transporter) throw new Error('Email not configured');
  
  try {
    const mailOptions = {
      from: `"BeaverWorks" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@beaverworks.com'}>`,
      to,
      subject,
      text,
      ...options
    };
    
    if (html) {
      mailOptions.html = html;
    }
    
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Email send error:', { to, subject, error: error.message });
    throw error;
  }
};

/**
 * Send email with template
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} templateName - Template name
 * @param {Object} data - Template data
 * @returns {Promise<Object>} Send result
 */
const sendTemplateEmail = async (to, subject, templateName, data) => {
  try {
    const templatePath = path.join(templatesDir, `${templateName}.html`);
    let html = null;
    
    if (fs.existsSync(templatePath)) {
      let template = fs.readFileSync(templatePath, 'utf8');
      // Simple template replacement
      for (const [key, value] of Object.entries(data)) {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
      html = template;
    }
    
    const text = `Hello ${data.name || 'there'},\n\n${data.message || 'Please check your BeaverWorks account for details.'}\n\nThank you for using BeaverWorks!`;
    
    return await sendEmail(to, subject, text, html);
  } catch (error) {
    logger.error('Template email error:', error);
    throw error;
  }
};

/**
 * Send verification email
 * @param {string} to - Recipient email
 * @param {string} name - User name
 * @param {string} code - Verification code
 * @returns {Promise<Object>} Send result
 */
const sendVerificationEmail = async (to, name, code) => {
  const subject = 'Verify Your Email Address';
  const text = `Hello ${name},\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nThank you for using BeaverWorks!`;
  const html = `
    <h2>Verify Your Email Address</h2>
    <p>Hello ${name},</p>
    <p>Your verification code is: <strong>${code}</strong></p>
    <p>This code expires in 10 minutes.</p>
    <p>Thank you for using BeaverWorks!</p>
  `;
  return await sendEmail(to, subject, text, html);
};

/**
 * Send welcome email
 * @param {string} to - Recipient email
 * @param {string} name - User name
 * @param {string} userType - User type (client/artisan)
 * @returns {Promise<Object>} Send result
 */
const sendWelcomeEmail = async (to, name, userType) => {
  const subject = `Welcome to BeaverWorks, ${name}!`;
  const text = `Hello ${name},\n\nWelcome to BeaverWorks! ${userType === 'client' ? 'Post your first job and get connected with verified professionals.' : 'Complete your profile and start receiving job offers.'}\n\nGet started today!\n\nThank you for joining BeaverWorks!`;
  const html = `
    <h2>Welcome to BeaverWorks!</h2>
    <p>Hello ${name},</p>
    <p>Welcome to BeaverWorks! ${userType === 'client' ? 'Post your first job and get connected with verified professionals.' : 'Complete your profile and start receiving job offers.'}</p>
    <p><a href="${process.env.APP_FRONTEND_URL}/login" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Get Started</a></p>
    <p>Thank you for joining BeaverWorks!</p>
  `;
  return await sendEmail(to, subject, text, html);
};

/**
 * Send password reset email
 * @param {string} to - Recipient email
 * @param {string} name - User name
 * @param {string} resetToken - Password reset token
 * @returns {Promise<Object>} Send result
 */
const sendPasswordResetEmail = async (to, name, resetToken) => {
  const resetUrl = `${process.env.APP_FRONTEND_URL}/reset-password?token=${resetToken}`;
  const subject = 'Reset Your Password';
  const text = `Hello ${name},\n\nClick here to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\nThank you for using BeaverWorks!`;
  const html = `
    <h2>Reset Your Password</h2>
    <p>Hello ${name},</p>
    <p>Click <a href="${resetUrl}">here</a> to reset your password.</p>
    <p>This link expires in 1 hour.</p>
    <p>If you didn't request this, please ignore this email.</p>
    <p>Thank you for using BeaverWorks!</p>
  `;
  return await sendEmail(to, subject, text, html);
};

/**
 * Send job accepted email
 * @param {string} to - Recipient email
 * @param {string} name - Client name
 * @param {Object} jobDetails - Job details
 * @returns {Promise<Object>} Send result
 */
const sendJobAcceptedEmail = async (to, name, jobDetails) => {
  const subject = 'Your Job Has Been Accepted!';
  const text = `Hello ${name},\n\nAn artisan has accepted your job: ${jobDetails.category}\n\nTrack them in real-time in the app.\n\nThank you for using BeaverWorks!`;
  const html = `
    <h2>Your Job Has Been Accepted!</h2>
    <p>Hello ${name},</p>
    <p>An artisan has accepted your job: <strong>${jobDetails.category}</strong></p>
    <p>Track them in real-time in the app.</p>
    <p><a href="${process.env.APP_FRONTEND_URL}/jobs/${jobDetails.jobId}/track" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Track Artisan</a></p>
    <p>Thank you for using BeaverWorks!</p>
  `;
  return await sendEmail(to, subject, text, html);
};

/**
 * Send payment confirmation email
 * @param {string} to - Recipient email
 * @param {string} name - User name
 * @param {Object} paymentDetails - Payment details
 * @returns {Promise<Object>} Send result
 */
const sendPaymentConfirmationEmail = async (to, name, paymentDetails) => {
  const subject = 'Payment Confirmed';
  const text = `Hello ${name},\n\nYour payment of ₦${paymentDetails.amount.toLocaleString()} for job ${paymentDetails.jobId.slice(0, 8)} has been confirmed.\n\nThank you for using BeaverWorks!`;
  const html = `
    <h2>Payment Confirmed</h2>
    <p>Hello ${name},</p>
    <p>Your payment of <strong>₦${paymentDetails.amount.toLocaleString()}</strong> for job <strong>${paymentDetails.jobId.slice(0, 8)}</strong> has been confirmed.</p>
    <p><a href="${process.env.APP_FRONTEND_URL}/jobs/${paymentDetails.jobId}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Job</a></p>
    <p>Thank you for using BeaverWorks!</p>
  `;
  return await sendEmail(to, subject, text, html);
};

/**
 * Verify email configuration
 * @returns {Promise<boolean>} True if configured
 */
const verifyConnection = async () => {
  if (!transporter) return false;
  try {
    await transporter.verify();
    return true;
  } catch (error) {
    logger.error('Email connection verification failed:', error);
    return false;
  }
};

module.exports = {
  transporter,
  sendEmail,
  sendTemplateEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendJobAcceptedEmail,
  sendPaymentConfirmationEmail,
  verifyConnection
};