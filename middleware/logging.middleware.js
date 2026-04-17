const morgan = require('morgan');
const { logger } = require('../config/logger');

// Create a stream object for morgan
const stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Skip logging for certain routes
const skip = (req) => {
  const skipPaths = ['/health', '/metrics', '/ping'];
  return skipPaths.includes(req.path) || req.method === 'OPTIONS';
};

// Custom token for user ID
morgan.token('userId', (req) => {
  return req.user?.id || 'anonymous';
});

// Custom token for request body (limited)
morgan.token('body', (req) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    const body = { ...req.body };
    // Remove sensitive data
    delete body.password;
    delete body.password_confirmation;
    delete body.currentPassword;
    delete body.newPassword;
    delete body.token;
    delete body.apiKey;
    return JSON.stringify(body);
  }
  return '-';
});

// Custom token for response time
morgan.token('response-time-ms', (req, res) => {
  const time = res.getHeader('X-Response-Time');
  return time || '-';
});

// Development format
const devFormat = ':method :url :status :response-time-ms ms - :res[content-length] - :userId - :body';

// Production format
const prodFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time-ms ms - :userId';

// Morgan middleware
const httpLogger = morgan(process.env.NODE_ENV === 'production' ? prodFormat : devFormat, {
  stream,
  skip
});

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.debug({
    type: 'request',
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    params: req.params,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id
  });
  
  // Capture response
  const oldSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    res.setHeader('X-Response-Time', `${duration}ms`);
    
    // Log response
    const statusCode = res.statusCode;
    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]({
      type: 'response',
      method: req.method,
      url: req.url,
      statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
      responseSize: res.get('Content-Length')
    });
    
    oldSend.apply(res, arguments);
  };
  
  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  logger.error({
    type: 'error',
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userId: req.user?.id,
    body: req.body,
    query: req.query,
    params: req.params
  });
  next(err);
};

// Performance logging middleware
const performanceLogger = (threshold = 1000) => {
  return (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (duration > threshold) {
        logger.warn({
          type: 'performance',
          method: req.method,
          url: req.url,
          duration: `${duration}ms`,
          threshold: `${threshold}ms`,
          userId: req.user?.id
        });
      }
    });
    
    next();
  };
};

// Database query logger (for debugging)
const queryLogger = (query, params, duration) => {
  if (duration > 100) { // Log slow queries
    logger.debug({
      type: 'database',
      query,
      params,
      duration: `${duration}ms`,
      slow: duration > 500
    });
  }
};

module.exports = {
  httpLogger,
  requestLogger,
  errorLogger,
  performanceLogger,
  queryLogger
};