const crypto = require('crypto');
const { cacheSet, cacheGet, cacheDel } = require('../config/redis');

/**
 * Generate random PIN
 * @param {number} length - PIN length (default: 6)
 * @returns {string} PIN
 */
const generatePIN = (length = 6) => {
  let pin = '';
  for (let i = 0; i < length; i++) {
    pin += Math.floor(Math.random() * 10).toString();
  }
  return pin;
};

/**
 * Generate cryptographically secure PIN
 * @param {number} length - PIN length (default: 6)
 * @returns {string} Secure PIN
 */
const generateSecurePIN = (length = 6) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  const range = max - min + 1;
  const randomBytes = crypto.randomBytes(4);
  const randomNumber = min + (randomBytes.readUInt32BE(0) % range);
  return randomNumber.toString().padStart(length, '0');
};

/**
 * Hash PIN for storage
 * @param {string} pin - Plain text PIN
 * @returns {string} Hashed PIN
 */
const hashPIN = (pin) => {
  return crypto.createHash('sha256').update(pin).digest('hex');
};

/**
 * Verify PIN against hash
 * @param {string} pin - Plain text PIN
 * @param {string} hash - Hashed PIN
 * @returns {boolean} True if matches
 */
const verifyPIN = (pin, hash) => {
  const pinHash = hashPIN(pin);
  return crypto.timingSafeEqual(Buffer.from(pinHash), Buffer.from(hash));
};

/**
 * Store PIN in Redis with expiration
 * @param {string} key - Unique key for PIN
 * @param {string} pin - PIN to store
 * @param {number} ttl - Time to live in seconds (default: 1800 - 30 minutes)
 * @returns {Promise<void>}
 */
const storePIN = async (key, pin, ttl = 1800) => {
  await cacheSet(`pin:${key}`, pin, ttl);
};

/**
 * Get stored PIN
 * @param {string} key - Unique key for PIN
 * @returns {Promise<string|null>} Stored PIN or null
 */
const getPIN = async (key) => {
  return await cacheGet(`pin:${key}`);
};

/**
 * Verify stored PIN
 * @param {string} key - Unique key for PIN
 * @param {string} pin - PIN to verify
 * @returns {Promise<boolean>} True if valid
 */
const verifyStoredPIN = async (key, pin) => {
  const storedPIN = await getPIN(key);
  
  if (!storedPIN || storedPIN !== pin) {
    return false;
  }
  
  // Delete PIN after successful verification
  await cacheDel(`pin:${key}`);
  return true;
};

/**
 * Delete stored PIN
 * @param {string} key - Unique key for PIN
 * @returns {Promise<void>}
 */
const deletePIN = async (key) => {
  await cacheDel(`pin:${key}`);
};

/**
 * Generate arrival PIN for job
 * @param {string} jobId - Job ID
 * @returns {string} Arrival PIN
 */
const generateArrivalPIN = (jobId) => {
  // Use job ID as part of seed for uniqueness
  const seed = jobId.slice(0, 8);
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const pin = (parseInt(seed, 16) % 900000 + 100000).toString();
  return pin;
};

/**
 * Generate transaction PIN for user
 * @param {string} userId - User ID
 * @returns {string} Transaction PIN
 */
const generateTransactionPIN = (userId) => {
  const hash = crypto.createHash('md5').update(userId).digest('hex');
  const pin = parseInt(hash.slice(0, 6), 16) % 900000 + 100000;
  return pin.toString();
};

/**
 * Validate PIN format
 * @param {string} pin - PIN to validate
 * @param {number} length - Expected length (default: 6)
 * @returns {boolean} True if valid format
 */
const isValidPINFormat = (pin, length = 6) => {
  const pinRegex = new RegExp(`^\\d{${length}}$`);
  return pinRegex.test(pin);
};

/**
 * Check if PIN is too simple (sequential or repeated)
 * @param {string} pin - PIN to check
 * @returns {boolean} True if PIN is weak
 */
const isWeakPIN = (pin) => {
  // Check for repeated digits
  if (/^(\d)\1+$/.test(pin)) return true;
  
  // Check for sequential digits
  const digits = pin.split('').map(Number);
  let isSequential = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== digits[i - 1] + 1 && digits[i] !== digits[i - 1] - 1) {
      isSequential = false;
      break;
    }
  }
  if (isSequential) return true;
  
  // Check for common patterns
  const commonPins = ['123456', '111111', '000000', '123123', '112233'];
  if (commonPins.includes(pin)) return true;
  
  return false;
};

/**
 * Generate random secure PIN that is not weak
 * @param {number} length - PIN length (default: 6)
 * @param {number} maxAttempts - Maximum attempts to generate non-weak PIN
 * @returns {string} Secure PIN
 */
const generateSecureNonWeakPIN = (length = 6, maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    const pin = generateSecurePIN(length);
    if (!isWeakPIN(pin)) {
      return pin;
    }
  }
  // Fallback to a random PIN even if weak
  return generateSecurePIN(length);
};

module.exports = {
  generatePIN,
  generateSecurePIN,
  hashPIN,
  verifyPIN,
  storePIN,
  getPIN,
  verifyStoredPIN,
  deletePIN,
  generateArrivalPIN,
  generateTransactionPIN,
  isValidPINFormat,
  isWeakPIN,
  generateSecureNonWeakPIN
};