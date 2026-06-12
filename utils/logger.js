const winston = require('winston');
const path = require('path');

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
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 10485760,
      maxFiles: 5,
    }),
    // Audit log file
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/audit.log'),
      level: 'info',
      maxsize: 10485760,
      maxFiles: 5,
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/exceptions.log')
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
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
 * Log audit message (user actions)
 * @param {string} userId - User ID
 * @param {string} action - Action performed
 * @param {Object} details - Action details
 */
const logAudit = (userId, action, details = {}) => {
  logger.info('AUDIT', { userId, action, details });
};

/**
 * Log API request
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
    userId: req.user?.id
  };
  
  if (res.statusCode >= 500) {
    logger.error('REQUEST', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('REQUEST', logData);
  } else {
    logger.info('REQUEST', logData);
  }
};

/**
 * Log database query
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {number} duration - Query duration in ms
 */
const logQuery = (query, params, duration) => {
  if (duration > 100) { // Log slow queries
    logger.warn('SLOW QUERY', { query, params, duration: `${duration}ms` });
  } else {
    logger.debug('QUERY', { query, params, duration: `${duration}ms` });
  }
};


module.exports = {
  logger,
  logInfo,
  logError,
  logWarn,
  logDebug,
  logAudit,
  logRequest,
  logQuery
};