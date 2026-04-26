const rateLimit = require('express-rate-limit');
const { redis } = require('../config/redis');
const { logger } = require('../config/logger');

// Check if Redis is properly connected
let redisAvailable = false;
let RedisStore = null;

// Try to load Redis store only if Redis is available
const initRedisStore = async () => {
  try {
    if (redis && redis.status === 'ready') {
      const RedisStoreModule = require('rate-limit-redis');
      RedisStore = RedisStoreModule;
      redisAvailable = true;
      logger.info('Redis store initialized for rate limiting');
      return true;
    }
    return false;
  } catch (error) {
    logger.warn('Redis store not available for rate limiting:', error.message);
    return false;
  }
};

// Initialize Redis store
initRedisStore();

const createRateLimiter = (windowMs, max, message, keyPrefix = 'rl') => {
  const config = {
    windowMs,
    max,
    message: { error: message || 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user?.id || req.ip;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: message || `Too many requests. Please try again in ${windowMs / 1000 / 60} minutes.`,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  };
  
  // Only use Redis store if available and connected
  if (redisAvailable && RedisStore && redis && redis.status === 'ready') {
    try {
      config.store = new RedisStore({
        client: redis,  // Use client instead of sendCommand for newer versions
        prefix: `${keyPrefix}:`,
      });
      logger.debug(`Rate limiter ${keyPrefix} using Redis store`);
    } catch (error) {
      logger.warn(`Failed to create Redis store for ${keyPrefix}:`, error.message);
      // Fall back to memory store
    }
  } else {
    logger.debug(`Rate limiter ${keyPrefix} using memory store (Redis not available)`);
  }
  
  return rateLimit(config);
};

// Create rate limiters
const generalLimiter = createRateLimiter(
  15 * 60 * 1000,
  100,
  'Too many requests from this IP. Please try again later.',
  'general'
);

const authLimiter = createRateLimiter(
  15 * 60 * 1000,
  5,
  'Too many authentication attempts. Please try again after 15 minutes.',
  'auth'
);

const jobLimiter = createRateLimiter(
  60 * 60 * 1000,
  10,
  'Too many job creation attempts. Please wait before creating more jobs.',
  'job'
);

const locationLimiter = createRateLimiter(
  60 * 1000,
  60,
  'Too many location updates. Please reduce update frequency.',
  'location'
);

const paymentLimiter = createRateLimiter(
  60 * 60 * 1000,
  20,
  'Too many payment attempts. Please try again later.',
  'payment'
);

const adminLimiter = createRateLimiter(
  60 * 1000,
  100,
  'Too many admin requests. Please slow down.',
  'admin'
);

const apiKeyLimiter = createRateLimiter(
  60 * 1000,
  1000,
  'API rate limit exceeded.',
  'apikey'
);

const webhookLimiter = createRateLimiter(
  60 * 1000,
  200,
  'Too many webhook requests.',
  'webhook'
);

const mobileLimiter = createRateLimiter(
  60 * 1000,
  120,
  'Too many requests from mobile app.',
  'mobile'
);

const otpLimiter = createRateLimiter(
  10 * 60 * 1000,
  3,
  'Too many OTP requests. Please wait before requesting another code.',
  'otp'
);

const uploadLimiter = createRateLimiter(
  60 * 60 * 1000,
  20,
  'Too many upload attempts. Please try again later.',
  'upload'
);

const createCustomLimiter = (windowMs, max, message, keyPrefix = 'custom') => {
  return createRateLimiter(windowMs, max, message, keyPrefix);
};

module.exports = {
  generalLimiter,
  authLimiter,
  jobLimiter,
  locationLimiter,
  paymentLimiter,
  adminLimiter,
  apiKeyLimiter,
  webhookLimiter,
  mobileLimiter,
  otpLimiter,
  uploadLimiter,
  createCustomLimiter
};