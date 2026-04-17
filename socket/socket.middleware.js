const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { redis } = require('../config/redis');
const { logger } = require('../config/logger');

/**
 * Authenticate socket connection
 * @param {socketIO.Socket} socket - Socket instance
 * @param {Function} next - Next middleware function
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      logger.warn('Socket connection attempt without token');
      return next(new Error('Authentication required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists and is active
    const userResult = await pool.query(
      'SELECT id, user_type, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return next(new Error('User not found'));
    }
    
    if (!userResult.rows[0].is_active) {
      return next(new Error('Account is deactivated'));
    }
    
    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return next(new Error('Token has been revoked'));
    }
    
    // Attach user info to socket
    socket.userId = decoded.userId;
    socket.userType = userResult.rows[0].user_type;
    socket.token = token;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid socket token:', error.message);
      return next(new Error('Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      logger.warn('Expired socket token');
      return next(new Error('Token expired'));
    }
    logger.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
};

/**
 * Rate limiting for socket events
 * @param {Object} limits - Rate limit configuration
 * @returns {Function} Middleware function
 */
const rateLimitSocket = (limits = {}) => {
  const defaultLimits = {
    'location:update': { windowMs: 60000, max: 60 }, // 60 per minute
    'chat:message': { windowMs: 60000, max: 30 }, // 30 per minute
    'typing:start': { windowMs: 60000, max: 20 }, // 20 per minute
    'diagnostics:progress': { windowMs: 60000, max: 30 } // 30 per minute
  };
  
  const userCounts = new Map();
  
  return async (socket, event, next) => {
    const limit = limits[event] || defaultLimits[event];
    
    if (!limit) {
      return next();
    }
    
    const key = `${socket.userId}:${event}`;
    const now = Date.now();
    
    if (!userCounts.has(key)) {
      userCounts.set(key, []);
    }
    
    const timestamps = userCounts.get(key);
    const windowStart = now - limit.windowMs;
    
    // Filter timestamps within the current window
    const recentTimestamps = timestamps.filter(ts => ts > windowStart);
    
    if (recentTimestamps.length >= limit.max) {
      logger.warn(`Rate limit exceeded for user ${socket.userId} on event ${event}`);
      socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
      return next(new Error('Rate limit exceeded'));
    }
    
    recentTimestamps.push(now);
    userCounts.set(key, recentTimestamps);
    
    // Clean up old entries periodically
    if (Math.random() < 0.1) {
      for (const [k, ts] of userCounts.entries()) {
        const oldestAllowed = Date.now() - 60000;
        const filtered = ts.filter(t => t > oldestAllowed);
        if (filtered.length === 0) {
          userCounts.delete(k);
        } else {
          userCounts.set(k, filtered);
        }
      }
    }
    
    next();
  };
};

/**
 * Validate event data schema
 * @param {Object} schema - Validation schema
 * @returns {Function} Middleware function
 */
const validateEventData = (schema) => {
  return (socket, data, next) => {
    try {
      // Basic validation - check required fields
      if (schema.required) {
        for (const field of schema.required) {
          if (data[field] === undefined || data[field] === null) {
            socket.emit('error', { message: `Missing required field: ${field}` });
            return next(new Error(`Missing required field: ${field}`));
          }
        }
      }
      
      // Type validation
      if (schema.types) {
        for (const [field, type] of Object.entries(schema.types)) {
          if (data[field] !== undefined && typeof data[field] !== type) {
            socket.emit('error', { message: `Invalid type for field ${field}. Expected ${type}` });
            return next(new Error(`Invalid type for field ${field}`));
          }
        }
      }
      
      next();
    } catch (error) {
      logger.error('Event validation error:', error);
      next(error);
    }
  };
};

/**
 * Log socket events
 * @param {socketIO.Socket} socket - Socket instance
 * @param {string} event - Event name
 * @param {*} data - Event data
 * @param {Function} next - Next middleware function
 */
const logSocketEvent = (socket, event, data, next) => {
  const startTime = Date.now();
  
  // Log event receipt
  logger.debug(`Socket event: ${event} from user ${socket.userId}`, {
    event,
    userId: socket.userId,
    dataSize: JSON.stringify(data).length
  });
  
  // Add response time tracking
  const originalEmit = socket.emit;
  socket.emit = function(eventName, ...args) {
    const duration = Date.now() - startTime;
    logger.debug(`Socket response: ${eventName} to user ${socket.userId}`, {
      event: eventName,
      userId: socket.userId,
      duration: `${duration}ms`
    });
    return originalEmit.apply(this, [eventName, ...args]);
  };
  
  next();
};

/**
 * Check if user is authorized for job-related events
 * @param {socketIO.Socket} socket - Socket instance
 * @param {string} jobId - Job ID
 * @returns {Promise<boolean>} True if authorized
 */
const checkJobAuthorization = async (socket, jobId) => {
  try {
    const result = await pool.query(
      `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return false;
    }
    
    const job = result.rows[0];
    return job.client_id === socket.userId || job.artisan_id === socket.userId;
  } catch (error) {
    logger.error('Job authorization check error:', error);
    return false;
  }
};

/**
 * Middleware for job events to verify authorization
 * @param {socketIO.Socket} socket - Socket instance
 * @param {Object} data - Event data
 * @param {Function} next - Next middleware function
 */
const requireJobAccess = async (socket, data, next) => {
  const { jobId } = data;
  
  if (!jobId) {
    socket.emit('error', { message: 'Job ID required' });
    return next(new Error('Job ID required'));
  }
  
  const isAuthorized = await checkJobAuthorization(socket, jobId);
  
  if (!isAuthorized) {
    socket.emit('error', { message: 'Unauthorized access to this job' });
    return next(new Error('Unauthorized access to this job'));
  }
  
  next();
};

/**
 * Middleware to check if user is an artisan
 * @param {socketIO.Socket} socket - Socket instance
 * @param {Object} data - Event data
 * @param {Function} next - Next middleware function
 */
const requireArtisan = (socket, data, next) => {
  if (socket.userType !== 'artisan') {
    socket.emit('error', { message: 'This action requires artisan privileges' });
    return next(new Error('Artisan privileges required'));
  }
  next();
};

/**
 * Middleware to check if user is a client
 * @param {socketIO.Socket} socket - Socket instance
 * @param {Object} data - Event data
 * @param {Function} next - Next middleware function
 */
const requireClient = (socket, data, next) => {
  if (socket.userType !== 'client') {
    socket.emit('error', { message: 'This action requires client privileges' });
    return next(new Error('Client privileges required'));
  }
  next();
};

/**
 * Create event middleware chain
 * @param {Array} middlewares - Array of middleware functions
 * @returns {Function} Composed middleware
 */
const composeMiddleware = (middlewares) => {
  return (socket, data, next) => {
    let index = 0;
    
    const run = (err) => {
      if (err) {
        return next(err);
      }
      if (index >= middlewares.length) {
        return next();
      }
      const middleware = middlewares[index++];
      middleware(socket, data, run);
    };
    
    run();
  };
};

module.exports = {
  authenticateSocket,
  rateLimitSocket,
  validateEventData,
  logSocketEvent,
  checkJobAuthorization,
  requireJobAccess,
  requireArtisan,
  requireClient,
  composeMiddleware
};