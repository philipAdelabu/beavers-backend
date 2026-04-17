const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
        // Error log file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: parseInt(process.env.LOG_MAX_SIZE || '10485760'), // 10MB
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
      tailable: true
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: parseInt(process.env.LOG_MAX_SIZE || '10485760'),
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
      tailable: true
    }),
    // Audit log file
    new winston.transports.File({
      filename: path.join(logDir, 'audit.log'),
      level: 'info',
      maxsize: parseInt(process.env.LOG_MAX_SIZE || '10485760'),
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
      tailable: true
    }),
    // HTTP access log file
    new winston.transports.File({
      filename: path.join(logDir, 'access.log'),
      level: 'http',
      maxsize: parseInt(process.env.LOG_MAX_SIZE || '10485760'),
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
      tailable: true
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: parseInt(process.env.LOG_MAX_SIZE || '10485760'),
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      maxsize: parseInt(process.env.LOG_MAX_SIZE || '10485760'),
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '5')
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    level: 'debug'
  }));
}

/**
 * Log info message
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 */
const logInfo = (message, meta = {}) => {
  logger.info(message, meta);
};

/**
 * Log error message
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 */
const logError = (message, meta = {}) => {
  logger.error(message, meta);
};

/**
 * Log warning message
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 */
const logWarn = (message, meta = {}) => {
  logger.warn(message, meta);
};

/**
 * Log debug message
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 */
const logDebug = (message, meta = {}) => {
  logger.debug(message, meta);
};

/**
 * Log HTTP request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in ms
 */
const logRequest = (req, res, duration) => {
  const logData = {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id,
    userType: req.user?.user_type
  };
  
  if (res.statusCode >= 500) {
    logger.error('HTTP_REQUEST', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('HTTP_REQUEST', logData);
  } else {
    logger.http('HTTP_REQUEST', logData);
  }
};

/**
 * Log audit action
 * @param {string} userId - User ID
 * @param {string} action - Action performed
 * @param {Object} details - Action details
 * @param {string} ipAddress - IP address
 */
const logAudit = (userId, action, details = {}, ipAddress = null) => {
  logger.info('AUDIT', {
    userId,
    action,
    details,
    ipAddress,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log database query
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {number} duration - Query duration in ms
 */
const logQuery = (query, params, duration) => {
  if (duration > 1000) {
    logger.warn('SLOW_QUERY', {
      query: query.substring(0, 500),
      params: JSON.stringify(params),
      duration: `${duration}ms`
    });
  } else if (duration > 500) {
    logger.debug('QUERY', {
      query: query.substring(0, 300),
      duration: `${duration}ms`
    });
  }
};

/**
 * Log API call to external service
 * @param {string} service - Service name
 * @param {string} endpoint - Endpoint called
 * @param {number} duration - Call duration in ms
 * @param {boolean} success - Whether call succeeded
 * @param {Object} error - Error if any
 */
const logExternalCall = (service, endpoint, duration, success, error = null) => {
  const logData = {
    service,
    endpoint,
    duration: `${duration}ms`,
    success
  };
  
  if (error) {
    logData.error = error.message;
    logger.error('EXTERNAL_CALL', logData);
  } else {
    logger.info('EXTERNAL_CALL', logData);
  }
};

/**
 * Create a child logger with additional context
 * @param {Object} context - Additional context
 * @returns {Object} Child logger
 */
const createChildLogger = (context) => {
  return {
    info: (message, meta = {}) => logInfo(message, { ...context, ...meta }),
    error: (message, meta = {}) => logError(message, { ...context, ...meta }),
    warn: (message, meta = {}) => logWarn(message, { ...context, ...meta }),
    debug: (message, meta = {}) => logDebug(message, { ...context, ...meta })
  };
};

/**
 * Get request-specific logger
 * @param {Object} req - Express request object
 * @returns {Object} Request logger
 */
const getRequestLogger = (req) => {
  const requestId = req.id || Math.random().toString(36).substring(7);
  return createChildLogger({
    requestId,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
};

module.exports = {
  logger,
  logInfo,
  logError,
  logWarn,
  logDebug,
  logRequest,
  logAudit,
  logQuery,
  logExternalCall,
  createChildLogger,
  getRequestLogger
};