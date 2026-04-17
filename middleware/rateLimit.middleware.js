const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { redis } = require('../config/redis');

const createRateLimiter = (windowMs, max, message, keyPrefix = 'rl') => {
  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: `${keyPrefix}:`,
    }),
    windowMs,
    max,
    message: { error: message || 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?.id || req.ip;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: message || `Too many requests. Please try again in ${windowMs / 1000 / 60} minutes.`,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// General rate limiter for all API endpoints
const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per 15 minutes
  'Too many requests from this IP. Please try again later.'
);

// Authentication endpoints (stricter)
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts per 15 minutes
  'Too many authentication attempts. Please try again after 15 minutes.',
  'auth'
);

// Job creation endpoints
const jobLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  10, // 10 job creations per hour
  'Too many job creation attempts. Please wait before creating more jobs.',
  'job'
);

// Location update endpoints (permissive)
const locationLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  60, // 60 location updates per minute
  'Too many location updates. Please reduce update frequency.',
  'location'
);

// Payment endpoints
const paymentLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  20, // 20 payment attempts per hour
  'Too many payment attempts. Please try again later.',
  'payment'
);

// Admin endpoints (stricter)
const adminLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  100, // 100 requests per minute for admin
  'Too many admin requests. Please slow down.',
  'admin'
);

// API key based rate limiter for external services
const apiKeyLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  1000, // 1000 requests per minute for API keys
  'API rate limit exceeded.',
  'apikey'
);

// Webhook endpoints (more permissive)
const webhookLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  200, // 200 webhook requests per minute
  'Too many webhook requests.',
  'webhook'
);

// Mobile app endpoints
const mobileLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  120, // 120 requests per minute
  'Too many requests from mobile app.',
  'mobile'
);

// Custom rate limiter for specific routes
const createCustomLimiter = (windowMs, max, message) => {
  return createRateLimiter(windowMs, max, message, 'custom');
};

// Rate limiter for OTP requests
const otpLimiter = createRateLimiter(
  10 * 60 * 1000, // 10 minutes
  3, // 3 OTP requests per 10 minutes
  'Too many OTP requests. Please wait before requesting another code.',
  'otp'
);

// Rate limiter for file uploads
const uploadLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  20, // 20 uploads per hour
  'Too many upload attempts. Please try again later.',
  'upload'
);

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