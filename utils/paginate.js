/**
 * Paginate query results
 * @param {Object} query - Database query builder
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10)
 * @returns {Object} Query with pagination
 */
const paginate = (query, page = 1, limit = 10) => {
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;
  
  const offset = (page - 1) * limit;
  
  return {
    ...query,
    limit,
    offset
  };
};

/**
 * Get pagination metadata
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} Pagination metadata
 */
const getPaginationMetadata = (total, page, limit) => {
  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;
  
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
    startIndex: (page - 1) * limit,
    endIndex: Math.min(page * limit, total)
  };
};

/**
 * Format paginated response
 * @param {Array} data - Paginated data
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {Object} Formatted paginated response
 */
const formatPaginatedResponse = (data, total, page, limit) => {
  const metadata = getPaginationMetadata(total, page, limit);
  
  return {
    data,
    pagination: metadata
  };
};

/**
 * Parse pagination parameters from request query
 * @param {Object} query - Request query object
 * @param {number} defaultLimit - Default items per page (default: 10)
 * @param {number} maxLimit - Maximum items per page (default: 100)
 * @returns {Object} { page, limit }
 */
const parsePaginationParams = (query, defaultLimit = 10, maxLimit = 100) => {
  let page = parseInt(query.page) || 1;
  let limit = parseInt(query.limit) || defaultLimit;
  
  if (page < 1) page = 1;
  if (limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  
  return { page, limit };
};

/**
 * Generate pagination links
 * @param {string} baseUrl - Base URL for links
 * @param {number} page - Current page
 * @param {number} totalPages - Total pages
 * @param {Object} queryParams - Additional query parameters
 * @returns {Object} Pagination links
 */
const generatePaginationLinks = (baseUrl, page, totalPages, queryParams = {}) => {
  const links = {
    first: null,
    last: null,
    prev: null,
    next: null
  };
  
  const buildUrl = (pageNum) => {
    const params = new URLSearchParams({ ...queryParams, page: pageNum });
    return `${baseUrl}?${params.toString()}`;
  };
  
  if (totalPages > 0) {
    links.first = buildUrl(1);
    links.last = buildUrl(totalPages);
    
    if (page > 1) {
      links.prev = buildUrl(page - 1);
    }
    
    if (page < totalPages) {
      links.next = buildUrl(page + 1);
    }
  }
  
  return links;
};

/**
 * Create paginated query for database
 * @param {Object} model - Database model
 * @param {Object} where - WHERE conditions
 * @param {Object} options - Additional options (order, include, etc.)
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Promise<Object>} Paginated results
 */
const paginatedQuery = async (model, where = {}, options = {}, page = 1, limit = 10) => {
  const { page: parsedPage, limit: parsedLimit } = parsePaginationParams({ page, limit });
  const offset = (parsedPage - 1) * parsedLimit;
  
  const { rows, count } = await model.findAndCountAll({
    where,
    ...options,
    limit: parsedLimit,
    offset
  });
  
  return formatPaginatedResponse(rows, count, parsedPage, parsedLimit);
};

module.exports = {
  paginate,
  getPaginationMetadata,
  formatPaginatedResponse,
  parsePaginationParams,
  generatePaginationLinks,
  paginatedQuery
};