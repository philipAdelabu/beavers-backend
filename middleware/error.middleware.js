const { logger } = require('../config/logger');

class AppError extends Error {
  constructor(statusCode, message, isOperational = true, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(400, message, true, details);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(401, message, true);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, true);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, true);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(409, message, true);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(429, message, true);
    this.name = 'RateLimitError';
  }
}

const errorHandler = (err, req, res, next) => {
  const { statusCode = 500, message, isOperational, details, name } = err;
  
  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    body: req.body,
    query: req.query,
    params: req.params
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details || err.errors
    });
  }

  if (err.code === '23505') { // PostgreSQL unique violation
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: 'A record with this information already exists',
      detail: err.detail
    });
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    return res.status(400).json({
      error: 'Invalid Reference',
      message: 'Referenced record does not exist',
      detail: err.detail
    });
  }

  if (err.code === '42P01') { // PostgreSQL undefined table
    return res.status(500).json({
      error: 'Database Error',
      message: 'An internal database error occurred'
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid Token',
      message: 'The provided token is invalid'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token Expired',
      message: 'Your session has expired. Please login again.'
    });
  }

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File Too Large',
        message: `File size exceeds the ${err.limit / 1024 / 1024}MB limit`
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too Many Files',
        message: `Maximum ${err.limit} files allowed`
      });
    }
    return res.status(400).json({
      error: 'Upload Error',
      message: err.message
    });
  }

  if (err.name === 'StripeCardError') {
    return res.status(400).json({
      error: 'Payment Error',
      message: err.message
    });
  }

  if (err.name === 'StripeRateLimitError') {
    return res.status(429).json({
      error: 'Payment Rate Limit',
      message: 'Too many payment attempts. Please try again later.'
    });
  }

  if (err.name === 'StripeInvalidRequestError') {
    return res.status(400).json({
      error: 'Invalid Payment Request',
      message: err.message
    });
  }

  if (err.name === 'StripeAPIError') {
    return res.status(502).json({
      error: 'Payment Gateway Error',
      message: 'Unable to process payment at this time. Please try again later.'
    });
  }

  if (err.name === 'TwilioError') {
    return res.status(502).json({
      error: 'SMS Service Error',
      message: 'Unable to send SMS at this time'
    });
  }

  // Development vs Production error responses
  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      error: name || 'Internal Server Error',
      message: isOperational ? message : 'An unexpected error occurred',
      details: !isOperational ? err.stack : details,
      path: req.path,
      method: req.method
    });
  }

  // Production error response (don't leak implementation details)
  if (isOperational) {
    return res.status(statusCode).json({
      error: name || 'Error',
      message
    });
  }

  // Unknown error in production
  logger.error('Unhandled error:', err);
  return res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred. Please try again later.'
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`,
    path: req.path,
    method: req.method
  });
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  errorHandler,
  notFoundHandler
};