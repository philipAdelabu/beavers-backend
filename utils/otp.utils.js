const crypto = require('crypto');
const { cacheSet, cacheGet, cacheDel } = require('../config/redis');

/**
 * Generate numeric OTP
 * @param {number} length - OTP length (default: 6)
 * @returns {string} OTP
 */
const generateNumericOTP = (length = 6) => {
  return crypto.randomInt(10 ** (length - 1), 10 ** length).toString();
};

/**
 * Generate alphanumeric OTP
 * @param {number} length - OTP length (default: 6)
 * @returns {string} OTP
 */
const generateAlphanumericOTP = (length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += chars[Math.floor(Math.random() * chars.length)];
  }
  return otp;
};

/**
 * Store OTP in Redis
 * @param {string} identifier - Unique identifier (email, phone, etc.)
 * @param {string} otp - OTP code
 * @param {number} ttl - Time to live in seconds (default: 300)
 * @returns {Promise<void>}
 */
const storeOTP = async (identifier, otp, ttl = 300) => {
  const key = `otp:${identifier}`;
  await cacheSet(key, otp, ttl);
};

/**
 * Verify OTP
 * @param {string} identifier - Unique identifier
 * @param {string} otp - OTP to verify
 * @returns {Promise<boolean>} True if valid
 */
const verifyOTP = async (identifier, otp) => {
  const key = `otp:${identifier}`;
  const storedOTP = await cacheGet(key);
  
  if (!storedOTP || storedOTP !== otp) {
    return false;
  }
  
  // Delete OTP after successful verification
  await cacheDel(key);
  return true;
};

/**
 * Generate and store OTP in one operation
 * @param {string} identifier - Unique identifier
 * @param {number} ttl - Time to live in seconds (default: 300)
 * @param {boolean} alphanumeric - Use alphanumeric OTP (default: false)
 * @returns {Promise<string>} Generated OTP
 */
const generateAndStoreOTP = async (identifier, ttl = 300, alphanumeric = false) => {
  const otp = alphanumeric ? generateAlphanumericOTP(6) : generateNumericOTP(6);
  await storeOTP(identifier, otp, ttl);
  return otp;
};

/**
 * Check if OTP exists for identifier
 * @param {string} identifier - Unique identifier
 * @returns {Promise<boolean>} True if OTP exists
 */
const hasOTP = async (identifier) => {
  const key = `otp:${identifier}`;
  const otp = await cacheGet(key);
  return !!otp;
};

/**
 * Get remaining TTL for OTP
 * @param {string} identifier - Unique identifier
 * @returns {Promise<number>} Remaining TTL in seconds
 */
const getOTPTTL = async (identifier) => {
  const key = `otp:${identifier}`;
  const { redis } = require('../config/redis');
  return await redis.ttl(key);
};

/**
 * Delete OTP
 * @param {string} identifier - Unique identifier
 * @returns {Promise<void>}
 */
const deleteOTP = async (identifier) => {
  const key = `otp:${identifier}`;
  await cacheDel(key);
};

/**
 * Generate TOTP (Time-based OTP)
 * @param {string} secret - Secret key
 * @param {number} digits - Number of digits (default: 6)
 * @param {number} interval - Time interval in seconds (default: 30)
 * @returns {string} TOTP
 */
const generateTOTP = (secret, digits = 6, interval = 30) => {
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / interval);
  
  // Create HMAC
  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'utf8'));
  const counterBuffer = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = counter & 0xff;
    counter >>= 8;
  }
  hmac.update(counterBuffer);
  const hash = hmac.digest();
  
  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const binary = ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  
  let otp = (binary % 10 ** digits).toString();
  while (otp.length < digits) {
    otp = '0' + otp;
  }
  
  return otp;
};

/**
 * Verify TOTP
 * @param {string} secret - Secret key
 * @param {string} otp - OTP to verify
 * @param {number} window - Time window in intervals (default: 1)
 * @returns {boolean} True if valid
 */
const verifyTOTP = (secret, otp, window = 1) => {
  for (let i = -window; i <= window; i++) {
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / 30) + i;
    const generatedOTP = generateTOTP(secret, otp.length, 30, counter);
    if (generatedOTP === otp) {
      return true;
    }
  }
  return false;
};

/**
 * Generate backup codes for 2FA
 * @param {number} count - Number of backup codes (default: 10)
 * @param {number} length - Code length (default: 8)
 * @returns {Array} Array of backup codes
 */
const generateBackupCodes = (count = 10, length = 8) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(length).toString('hex').slice(0, length).toUpperCase());
  }
  return codes;
};

module.exports = {
  generateNumericOTP,
  generateAlphanumericOTP,
  storeOTP,
  verifyOTP,
  generateAndStoreOTP,
  hasOTP,
  getOTPTTL,
  deleteOTP,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes
};