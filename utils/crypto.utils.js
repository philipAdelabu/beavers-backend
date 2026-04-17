const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Generate random bytes as hex string
 * @param {number} bytes - Number of bytes (default: 16)
 * @returns {string} Hex string
 */
const generateRandomBytes = (bytes = 16) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Generate random token
 * @param {number} length - Token length (default: 32)
 * @returns {string} Random token
 */
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @param {number} rounds - Salt rounds (default: 10)
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password, rounds = 10) => {
  return await bcrypt.hash(password, rounds);
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if matches
 */
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate HMAC signature
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {string} HMAC signature
 */
const generateHMAC = (data, secret, algorithm = 'sha256') => {
  return crypto.createHmac(algorithm, secret).update(data).digest('hex');
};

/**
 * Verify HMAC signature
 * @param {string} data - Original data
 * @param {string} signature - Signature to verify
 * @param {string} secret - Secret key
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {boolean} True if valid
 */
const verifyHMAC = (data, signature, secret, algorithm = 'sha256') => {
  const expectedSignature = generateHMAC(data, secret, algorithm);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

/**
 * Encrypt data using AES-256-CBC
 * @param {string} text - Plain text to encrypt
 * @param {string} key - Encryption key (32 bytes)
 * @returns {Object} { iv, encryptedData }
 */
const encrypt = (text, key) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted
  };
};

/**
 * Decrypt data using AES-256-CBC
 * @param {string} encryptedData - Encrypted data
 * @param {string} iv - Initialization vector
 * @param {string} key - Encryption key (32 bytes)
 * @returns {string} Decrypted text
 */
const decrypt = (encryptedData, iv, key) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

/**
 * Generate RSA key pair
 * @param {number} modulusLength - Key size in bits (default: 2048)
 * @returns {Promise<Object>} { publicKey, privateKey }
 */
const generateRSAKeyPair = async (modulusLength = 2048) => {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair('rsa', {
      modulusLength,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    }, (err, publicKey, privateKey) => {
      if (err) reject(err);
      else resolve({ publicKey, privateKey });
    });
  });
};

/**
 * Sign data with RSA private key
 * @param {string} data - Data to sign
 * @param {string} privateKey - RSA private key
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {string} Signature
 */
const signRSA = (data, privateKey, algorithm = 'sha256') => {
  const sign = crypto.createSign(algorithm);
  sign.update(data);
  sign.end();
  return sign.sign(privateKey, 'hex');
};

/**
 * Verify RSA signature
 * @param {string} data - Original data
 * @param {string} signature - Signature to verify
 * @param {string} publicKey - RSA public key
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {boolean} True if valid
 */
const verifyRSA = (data, signature, publicKey, algorithm = 'sha256') => {
  const verify = crypto.createVerify(algorithm);
  verify.update(data);
  verify.end();
  return verify.verify(publicKey, signature, 'hex');
};

/**
 * Generate API key
 * @param {string} prefix - Optional prefix
 * @returns {string} API key
 */
const generateAPIKey = (prefix = 'bw') => {
  const random = crypto.randomBytes(24).toString('hex');
  return `${prefix}_${random}`;
};

/**
 * Generate OTP (One-Time Password)
 * @param {number} length - OTP length (default: 6)
 * @returns {string} OTP
 */
const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
};

/**
 * Generate reference ID
 * @param {string} prefix - Optional prefix
 * @returns {string} Reference ID
 */
const generateReference = (prefix = 'REF') => {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${timestamp}_${random}`.toUpperCase();
};

/**
 * Hash data using SHA-256
 * @param {string} data - Data to hash
 * @returns {string} Hash
 */
const sha256 = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Hash data using MD5
 * @param {string} data - Data to hash
 * @returns {string} Hash
 */
const md5 = (data) => {
  return crypto.createHash('md5').update(data).digest('hex');
};

module.exports = {
  generateRandomBytes,
  generateToken,
  hashPassword,
  comparePassword,
  generateHMAC,
  verifyHMAC,
  encrypt,
  decrypt,
  generateRSAKeyPair,
  signRSA,
  verifyRSA,
  generateAPIKey,
  generateOTP,
  generateReference,
  sha256,
  md5
};