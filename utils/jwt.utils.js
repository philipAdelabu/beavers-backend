const jwt = require('jsonwebtoken');
const { cacheGet, cacheSet } = require('../config/redis');

/**
 * Generate access and refresh tokens
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} userType - User type (client/artisan/admin)
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokens = (userId, email, userType) => {
  const accessToken = jwt.sign(
    { userId, email, userType },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );

  return { accessToken, refreshToken };
};

/**
 * Verify access token
 * @param {string} token - JWT token
 * @returns {Object} Decoded payload
 * @throws {Error} If token is invalid
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw error;
  }
};

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Object} Decoded payload
 * @throws {Error} If token is invalid
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw error;
  }
};

/**
 * Decode token without verification
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null
 */
const decodeToken = (token) => {
  return jwt.decode(token);
};

/**
 * Blacklist token (logout)
 * @param {string} token - Token to blacklist
 * @param {number} expiresIn - Expiration time in seconds
 * @returns {Promise<void>}
 */
const blacklistToken = async (token, expiresIn) => {
  await cacheSet(`blacklist:${token}`, 'true', expiresIn);
};

/**
 * Check if token is blacklisted
 * @param {string} token - Token to check
 * @returns {Promise<boolean>} True if blacklisted
 */
const isTokenBlacklisted = async (token) => {
  const result = await cacheGet(`blacklist:${token}`);
  return !!result;
};

/**
 * Generate password reset token
 * @param {string} userId - User ID
 * @returns {string} Reset token
 */
const generatePasswordResetToken = (userId) => {
  return jwt.sign(
    { userId, purpose: 'password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

/**
 * Verify password reset token
 * @param {string} token - Reset token
 * @returns {Object} Decoded payload
 * @throws {Error} If token is invalid
 */
const verifyPasswordResetToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.purpose !== 'password_reset') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
};

/**
 * Generate email verification token
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @returns {string} Verification token
 */
const generateEmailVerificationToken = (userId, email) => {
  return jwt.sign(
    { userId, email, purpose: 'email_verification' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

/**
 * Verify email verification token
 * @param {string} token - Verification token
 * @returns {Object} Decoded payload
 * @throws {Error} If token is invalid
 */
const verifyEmailVerificationToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.purpose !== 'email_verification') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
};

/**
 * Generate API token for external services
 * @param {string} clientId - Client ID
 * @param {string} scope - Token scope
 * @returns {string} API token
 */
const generateAPIToken = (clientId, scope) => {
  return jwt.sign(
    { clientId, scope, type: 'api_token' },
    process.env.JWT_SECRET,
    { expiresIn: '365d' }
  );
};

/**
 * Verify API token
 * @param {string} token - API token
 * @returns {Object} Decoded payload
 * @throws {Error} If token is invalid
 */
const verifyAPIToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.type !== 'api_token') {
    throw new Error('Invalid token type');
  }
  return decoded;
};

/**
 * Get token expiration time
 * @param {string} token - JWT token
 * @returns {number} Expiration timestamp in seconds
 */
const getTokenExpiration = (token) => {
  const decoded = decodeToken(token);
  return decoded?.exp || 0;
};

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} True if expired
 */
const isTokenExpired = (token) => {
  const exp = getTokenExpiration(token);
  return Date.now() >= exp * 1000;
};

/**
 * Refresh access token
 * @param {string} refreshToken - Refresh token
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} userType - User type
 * @returns {Promise<Object>} New tokens
 */
const refreshAccessToken = async (refreshToken, userId, email, userType) => {
  // Verify refresh token
  verifyRefreshToken(refreshToken);
  
  // Check if refresh token is stored
  const storedToken = await cacheGet(`refresh_token:${userId}`);
  if (storedToken !== refreshToken) {
    throw new Error('Invalid refresh token');
  }
  
  // Generate new tokens
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(userId, email, userType);
  
  // Store new refresh token
  await cacheSet(`refresh_token:${userId}`, newRefreshToken, 2592000);
  
  // Blacklist old refresh token
  await cacheSet(`blacklist:${refreshToken}`, 'true', 2592000);
  
  return { accessToken, refreshToken: newRefreshToken };
};

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  blacklistToken,
  isTokenBlacklisted,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  generateEmailVerificationToken,
  verifyEmailVerificationToken,
  generateAPIToken,
  verifyAPIToken,
  getTokenExpiration,
  isTokenExpired,
  refreshAccessToken
};