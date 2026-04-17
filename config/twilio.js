const twilio = require('twilio');
const { logger } = require('./logger');

let twilioClient = null;
let messagingServiceSid = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  logger.info('Twilio initialized');
} else {
  logger.warn('Twilio credentials not found. SMS features disabled.');
}

/**
 * Send SMS message
 * @param {string} to - Recipient phone number
 * @param {string} body - Message body
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Message object
 */
const sendSMS = async (to, body, options = {}) => {
  if (!twilioClient) throw new Error('Twilio not configured');
  
  try {
    const messageOptions = {
      body,
      to,
      ...options
    };
    
    if (messagingServiceSid) {
      messageOptions.messagingServiceSid = messagingServiceSid;
    } else {
      messageOptions.from = process.env.TWILIO_PHONE_NUMBER;
    }
    
    const message = await twilioClient.messages.create(messageOptions);
    logger.info(`SMS sent to ${to}: ${message.sid}`);
    return message;
  } catch (error) {
    logger.error('SMS send error:', { to, error: error.message });
    throw error;
  }
};

/**
 * Send bulk SMS messages
 * @param {Array} recipients - Array of {to, body} objects
 * @returns {Promise<Array>} Array of message results
 */
const sendBulkSMS = async (recipients) => {
  if (!twilioClient) throw new Error('Twilio not configured');
  
  const results = [];
  for (const recipient of recipients) {
    try {
      const message = await sendSMS(recipient.to, recipient.body);
      results.push({ success: true, to: recipient.to, sid: message.sid });
    } catch (error) {
      results.push({ success: false, to: recipient.to, error: error.message });
    }
    // Rate limiting: wait 1 second between messages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return results;
};

/**
 * Send verification code
 * @param {string} to - Phone number
 * @param {string} code - Verification code
 * @returns {Promise<Object>} Message object
 */
const sendVerificationCode = async (to, code) => {
  const message = `Your BeaverWorks verification code is: ${code}. This code expires in 10 minutes.`;
  return await sendSMS(to, message);
};

/**
 * Send job offer notification
 * @param {string} to - Artisan phone number
 * @param {string} artisanName - Artisan name
 * @param {Object} jobDetails - Job details
 * @returns {Promise<Object>} Message object
 */
const sendJobOfferNotification = async (to, artisanName, jobDetails) => {
  const message = `Hi ${artisanName}, new job offer: ${jobDetails.category} - ${jobDetails.description.substring(0, 80)}. Check app now!`;
  return await sendSMS(to, message);
};

/**
 * Send arrival PIN
 * @param {string} to - Client phone number
 * @param {string} clientName - Client name
 * @param {string} pin - Arrival PIN
 * @returns {Promise<Object>} Message object
 */
const sendArrivalPIN = async (to, clientName, pin) => {
  const message = `Hi ${clientName}, the artisan has arrived. Please provide this PIN: ${pin}`;
  return await sendSMS(to, message);
};

/**
 * Send payment confirmation
 * @param {string} to - Phone number
 * @param {number} amount - Payment amount
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Message object
 */
const sendPaymentConfirmation = async (to, amount, jobId) => {
  const message = `Payment of ₦${amount.toLocaleString()} for job ${jobId.slice(0, 8)} confirmed. Thank you for using BeaverWorks!`;
  return await sendSMS(to, message);
};

/**
 * Get account balance
 * @returns {Promise<Object>} Balance object
 */
const getBalance = async () => {
  if (!twilioClient) throw new Error('Twilio not configured');
  try {
    return await twilioClient.balance.fetch();
  } catch (error) {
    logger.error('Get balance error:', error);
    throw error;
  }
};

/**
 * Get message status
 * @param {string} messageSid - Message SID
 * @returns {Promise<Object>} Message object
 */
const getMessageStatus = async (messageSid) => {
  if (!twilioClient) throw new Error('Twilio not configured');
  try {
    return await twilioClient.messages(messageSid).fetch();
  } catch (error) {
    logger.error('Get message status error:', error);
    throw error;
  }
};

/**
 * Validate phone number
 * @param {string} phoneNumber - Phone number to validate
 * @returns {Promise<Object>} Validation result
 */
const validatePhoneNumber = async (phoneNumber) => {
  if (!twilioClient) throw new Error('Twilio not configured');
  try {
    const result = await twilioClient.lookups.v2.phoneNumbers(phoneNumber).fetch();
    return {
      valid: true,
      countryCode: result.countryCode,
      phoneNumber: result.phoneNumber,
      nationalFormat: result.nationalFormat,
      carrier: result.carrier
    };
  } catch (error) {
    logger.error('Phone validation error:', error);
    return { valid: false, error: error.message };
  }
};

module.exports = {
  twilioClient,
  sendSMS,
  sendBulkSMS,
  sendVerificationCode,
  sendJobOfferNotification,
  sendArrivalPIN,
  sendPaymentConfirmation,
  getBalance,
  getMessageStatus,
  validatePhoneNumber
};