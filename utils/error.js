/**
 * Custom error classes for different HTTP status codes
 */

class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad Request') {
    super(message, 400);
    this.name = 'BadRequestError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation Error', details = null) {
    super(message, 422);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error') {
    super(message, 500);
    this.name = 'InternalServerError';
    this.isOperational = false;
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service Unavailable') {
    super(message, 503);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error handler function for async/await
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function with error handling
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Format error for response
 * @param {Error} error - Error object
 * @param {boolean} includeStack - Include stack trace (default: false)
 * @returns {Object} Formatted error object
 */
const formatError = (error, includeStack = false) => {
  const formattedError = {
    name: error.name || 'Error',
    message: error.message,
    statusCode: error.statusCode || 500,
    timestamp: error.timestamp || new Date().toISOString()
  };
  
  if (includeStack && process.env.NODE_ENV !== 'production') {
    formattedError.stack = error.stack;
  }
  
  if (error.details) {
    formattedError.details = error.details;
  }
  
  return formattedError;
};

/**
 * Log error with context
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
const logError = (error, context = {}) => {
  const logData = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    statusCode: error.statusCode,
    timestamp: new Date().toISOString(),
    ...context
  };
  
  console.error(JSON.stringify(logData, null, 2));
};

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  catchAsync,
  formatError,
  logError
};