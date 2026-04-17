/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} JSON response
 */
const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString()
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {*} errors - Additional error details
 * @returns {Object} JSON response
 */
const sendError = (res, message = 'Error', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Send paginated response
 * @param {Object} res - Express response object
 * @param {Array} data - Paginated data
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @param {string} message - Success message
 * @returns {Object} JSON response
 */
const sendPaginated = (res, data, page, limit, total, message = 'Success') => {
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;
  
  const totalPages = Math.ceil(total / limit);
  
  const response = {
    success: true,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    timestamp: new Date().toISOString()
  };
  
  return res.status(200).json(response);
};

/**
 * Send created response (201)
 * @param {Object} res - Express response object
 * @param {*} data - Created resource data
 * @param {string} message - Success message
 * @returns {Object} JSON response
 */
const sendCreated = (res, data = null, message = 'Resource created successfully') => {
  return sendSuccess(res, data, message, 201);
};

/**
 * Send no content response (204)
 * @param {Object} res - Express response object
 * @returns {Object} Empty response
 */
const sendNoContent = (res) => {
  return res.status(204).send();
};

/**
 * Send validation error response
 * @param {Object} res - Express response object
 * @param {Array} errors - Validation errors
 * @returns {Object} JSON response
 */
const sendValidationError = (res, errors) => {
  return sendError(res, 'Validation failed', 422, errors);
};

/**
 * Send unauthorized response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @returns {Object} JSON response
 */
const sendUnauthorized = (res, message = 'Unauthorized') => {
  return sendError(res, message, 401);
};

/**
 * Send forbidden response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @returns {Object} JSON response
 */
const sendForbidden = (res, message = 'Forbidden') => {
  return sendError(res, message, 403);
};

/**
 * Send not found response
 * @param {Object} res - Express response object
 * @param {string} resource - Resource name
 * @returns {Object} JSON response
 */
const sendNotFound = (res, resource = 'Resource') => {
  return sendError(res, `${resource} not found`, 404);
};

/**
 * Send conflict response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @returns {Object} JSON response
 */
const sendConflict = (res, message = 'Resource already exists') => {
  return sendError(res, message, 409);
};

/**
 * Send rate limit response
 * @param {Object} res - Express response object
 * @param {number} retryAfter - Seconds to wait before retrying
 * @returns {Object} JSON response
 */
const sendRateLimit = (res, retryAfter = 60) => {
  const response = sendError(res, 'Too many requests, please try again later', 429);
  res.setHeader('Retry-After', retryAfter);
  return response;
};

/**
 * Send download response
 * @param {Object} res - Express response object
 * @param {Buffer|string} file - File data or path
 * @param {string} filename - Download filename
 * @param {string} contentType - MIME type
 * @returns {Object} Download response
 */
const sendDownload = (res, file, filename, contentType = 'application/octet-stream') => {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(file);
};

module.exports = {
  sendSuccess,
  sendError,
  sendPaginated,
  sendCreated,
  sendNoContent,
  sendValidationError,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict,
  sendRateLimit,
  sendDownload
};