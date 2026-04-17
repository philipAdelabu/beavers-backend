const helmet = require('helmet');
const xss = require('xss');
const sanitizeHtml = require('sanitize-html');
const { AppError } = require('./error.middleware');

// Helmet security headers configuration
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://maps.googleapis.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      sandbox: ['allow-forms', 'allow-scripts', 'allow-same-origin']
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  xssFilter: true
});

// Sanitize request body to prevent XSS
const sanitizeBody = (req, res, next) => {
  if (req.body) {
    const sanitize = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // Remove HTML tags and sanitize
          obj[key] = sanitizeHtml(obj[key], {
            allowedTags: [],
            allowedAttributes: {},
            textFilter: (text) => xss(text)
          });
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitize(obj[key]);
        }
      }
    };
    
    sanitize(req.body);
  }
  next();
};

// Prevent SQL injection (basic pattern matching)
const sqlInjectionBlocker = (req, res, next) => {
  const sqlPatterns = [
    /(\b(select|insert|update|delete|drop|union|alter|create|truncate)\b)/i,
    /(--)/,
    /(;)/,
    /('|\")/,
    /(\b(and|or)\b.*=)/i
  ];
  
  const checkValue = (value) => {
    if (typeof value === 'string') {
      for (const pattern of sqlPatterns) {
        if (pattern.test(value)) {
          return true;
        }
      }
    }
    return false;
  };
  
  const checkObject = (obj) => {
    for (const key in obj) {
      if (checkValue(obj[key])) {
        return true;
      }
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (checkObject(obj[key])) {
          return true;
        }
      }
    }
    return false;
  };
  
  if (req.body && checkObject(req.body)) {
    return res.status(400).json({ error: 'Invalid characters detected in request' });
  }
  
  if (req.query && checkObject(req.query)) {
    return res.status(400).json({ error: 'Invalid characters detected in query parameters' });
  }
  
  next();
};

// Rate limiting by user (additional to general rate limiting)
const userRateLimiter = async (req, res, next) => {
  if (!req.user) {
    return next();
  }
  
  const { redis } = require('../config/redis');
  const key = `rate:user:${req.user.id}`;
  const limit = 1000; // requests per hour
  const window = 3600; // 1 hour in seconds
  
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, window);
    }
    
    if (current > limit) {
      return res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: 'You have exceeded your hourly request limit',
        retryAfter: window
      });
    }
    
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));
    next();
  } catch (error) {
    next(error);
  }
};

// API Key validation for external services
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validKeys = (process.env.API_KEYS || '').split(',');
  
  // Skip for public endpoints
  const publicPaths = ['/health', '/webhooks'];
  if (publicPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  
  next();
};

// Device fingerprinting (for security)
const deviceFingerprint = (req, res, next) => {
  const fingerprint = {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    acceptLanguage: req.get('accept-language'),
    acceptEncoding: req.get('accept-encoding'),
    platform: req.headers['x-platform'],
    deviceId: req.headers['x-device-id'],
    appVersion: req.headers['x-app-version']
  };
  
  req.deviceFingerprint = fingerprint;
  next();
};

// Session validation for sensitive operations
const validateSession = async (req, res, next) => {
  if (!req.user) {
    return next();
  }
  
  const { redis } = require('../config/redis');
  const sessionKey = `session:${req.user.id}`;
  const session = await redis.get(sessionKey);
  
  if (!session) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
  
  next();
};

// Block suspicious IPs
const blockSuspiciousIPs = async (req, res, next) => {
  const { redis } = require('../config/redis');
  const ip = req.ip;
  const key = `blocked:ip:${ip}`;
  
  const isBlocked = await redis.get(key);
  if (isBlocked) {
    return res.status(403).json({ error: 'Your IP has been blocked due to suspicious activity' });
  }
  
  next();
};

// Request size limiter
const requestSizeLimiter = (limit = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const limitBytes = parseSize(limit);
    
    if (contentLength > limitBytes) {
      return res.status(413).json({
        error: 'Request Entity Too Large',
        message: `Request size exceeds ${limit} limit`
      });
    }
    next();
  };
};

const parseSize = (size) => {
  const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  const match = size.match(/^(\d+)(b|kb|mb|gb)$/i);
  if (match) {
    return parseInt(match[1]) * units[match[2].toLowerCase()];
  }
  return parseInt(size);
};

module.exports = {
  helmetConfig,
  sanitizeBody,
  sqlInjectionBlocker,
  userRateLimiter,
  validateApiKey,
  deviceFingerprint,
  validateSession,
  blockSuspiciousIPs,
  requestSizeLimiter
};