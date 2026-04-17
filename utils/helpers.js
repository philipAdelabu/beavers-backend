const crypto = require('crypto');
const { promisify } = require('util');

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after timeout
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Pick specific fields from object
 * @param {Object} obj - Source object
 * @param {Array} keys - Keys to pick
 * @returns {Object} Object with picked fields
 */
const pick = (obj, keys) => {
  return keys.reduce((result, key) => {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

/**
 * Omit specific fields from object
 * @param {Object} obj - Source object
 * @param {Array} keys - Keys to omit
 * @returns {Object} Object without omitted fields
 */
const omit = (obj, keys) => {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
};

/**
 * Check if object is empty
 * @param {Object} obj - Object to check
 * @returns {boolean} True if empty
 */
const isEmpty = (obj) => {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

/**
 * Check if value is null or undefined
 * @param {*} value - Value to check
 * @returns {boolean} True if null or undefined
 */
const isNil = (value) => {
  return value === null || value === undefined;
};

/**
 * Convert object to query string
 * @param {Object} params - Query parameters
 * @returns {string} Query string
 */
const toQueryString = (params) => {
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
};

/**
 * Parse query string to object
 * @param {string} queryString - Query string
 * @returns {Object} Parsed object
 */
const parseQueryString = (queryString) => {
  const params = {};
  const searchParams = new URLSearchParams(queryString);
  for (const [key, value] of searchParams) {
    params[key] = value;
  }
  return params;
};

/**
 * Retry async function on failure
 * @param {Function} fn - Async function to retry
 * @param {number} retries - Number of retries (default: 3)
 * @param {number} delay - Delay between retries in ms (default: 1000)
 * @returns {Promise} Result of function
 */
const retry = async (fn, retries = 3, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await sleep(delay);
    return retry(fn, retries - 1, delay);
  }
};

/**
 * Debounce function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
const debounce = (fn, delay) => {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
};

/**
 * Throttle function
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Limit in ms
 * @returns {Function} Throttled function
 */
const throttle = (fn, limit) => {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * Generate random number between min and max
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random number
 */
const randomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Generate random color in hex format
 * @returns {string} Random hex color
 */
const randomColor = () => {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
};

/**
 * Format bytes to human readable size
 * @param {number} bytes - Bytes to format
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} Formatted size
 */
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Calculate percentage
 * @param {number} part - Part value
 * @param {number} total - Total value
 * @returns {number} Percentage
 */
const calculatePercentage = (part, total) => {
  if (total === 0) return 0;
  return (part / total) * 100;
};

/**
 * Generate unique ID
 * @param {string} prefix - Optional prefix
 * @returns {string} Unique ID
 */
const generateUniqueId = (prefix = '') => {
  const id = crypto.randomBytes(16).toString('hex');
  return prefix ? `${prefix}_${id}` : id;
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
const isValidEmail = (email) => {
  const re = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;
  return re.test(email);
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid
 */
const isValidPhone = (phone) => {
  const re = /^\+?[0-9]{10,15}$/;
  return re.test(phone);
};

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Truncate string to specified length
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated string
 */
const truncate = (str, length, suffix = '...') => {
  if (str.length <= length) return str;
  return str.substring(0, length - suffix.length) + suffix;
};

/**
 * Capitalize first letter of each word
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
const capitalizeWords = (str) => {
  return str.replace(/\b\w/g, char => char.toUpperCase());
};

/**
 * Convert string to camel case
 * @param {string} str - String to convert
 * @returns {string} Camel case string
 */
const toCamelCase = (str) => {
  return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '');
};

/**
 * Convert string to snake case
 * @param {string} str - String to convert
 * @returns {string} Snake case string
 */
const toSnakeCase = (str) => {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
};

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
const escapeHtml = (str) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Unescape HTML special characters
 * @param {string} str - String to unescape
 * @returns {string} Unescaped string
 */
const unescapeHtml = (str) => {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

/**
 * Get environment variable with fallback
 * @param {string} key - Environment variable key
 * @param {*} defaultValue - Default value if not set
 * @returns {*} Environment variable value or default
 */
const env = (key, defaultValue = null) => {
  const value = process.env[key];
  return value !== undefined ? value : defaultValue;
};

/**
 * Check if environment is production
 * @returns {boolean} True if production
 */
const isProduction = () => {
  return process.env.NODE_ENV === 'production';
};

/**
 * Check if environment is development
 * @returns {boolean} True if development
 */
const isDevelopment = () => {
  return process.env.NODE_ENV === 'development';
};

/**
 * Check if environment is test
 * @returns {boolean} True if test
 */
const isTest = () => {
  return process.env.NODE_ENV === 'test';
};

/**
 * Get current timestamp in seconds
 * @returns {number} Current timestamp in seconds
 */
const timestamp = () => {
  return Math.floor(Date.now() / 1000);
};

/**
 * Get current ISO date string
 * @returns {string} ISO date string
 */
const isoDate = () => {
  return new Date().toISOString();
};

/**
 * Compare two objects deeply
 * @param {Object} obj1 - First object
 * @param {Object} obj2 - Second object
 * @returns {boolean} True if equal
 */
const deepEqual = (obj1, obj2) => {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
};

/**
 * Merge multiple objects deeply
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
const deepMerge = (...objects) => {
  const result = {};
  
  for (const obj of objects) {
    for (const key in obj) {
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        result[key] = deepMerge(result[key] || {}, obj[key]);
      } else {
        result[key] = obj[key];
      }
    }
  }
  
  return result;
};

/**
 * Group array by key
 * @param {Array} array - Array to group
 * @param {string|Function} key - Key to group by
 * @returns {Object} Grouped object
 */
const groupBy = (array, key) => {
  return array.reduce((result, item) => {
    const groupKey = typeof key === 'function' ? key(item) : item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
};

/**
 * Chunk array into smaller arrays
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array} Chunked array
 */
const chunk = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

/**
 * Remove duplicates from array
 * @param {Array} array - Array to deduplicate
 * @param {string|Function} key - Key to compare (optional)
 * @returns {Array} Deduplicated array
 */
const unique = (array, key = null) => {
  if (!key) {
    return [...new Set(array)];
  }
  
  const seen = new Set();
  return array.filter(item => {
    const value = typeof key === 'function' ? key(item) : item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

/**
 * Shuffle array randomly
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
const shuffle = (array) => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Promisify callback-based function
 * @param {Function} fn - Function to promisify
 * @returns {Function} Promisified function
 */
const promisify = (fn) => {
  return promisify(fn);
};

/**
 * Wait for condition to be true
 * @param {Function} condition - Condition function
 * @param {number} interval - Check interval in ms (default: 100)
 * @param {number} timeout - Timeout in ms (default: 5000)
 * @returns {Promise} Promise that resolves when condition is true
 */
const waitFor = async (condition, interval = 100, timeout = 5000) => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await sleep(interval);
  }
  
  return false;
};

module.exports = {
  sleep,
  deepClone,
  pick,
  omit,
  isEmpty,
  isNil,
  toQueryString,
  parseQueryString,
  retry,
  debounce,
  throttle,
  randomNumber,
  randomColor,
  formatBytes,
  calculatePercentage,
  generateUniqueId,
  isValidEmail,
  isValidPhone,
  isValidUrl,
  truncate,
  capitalizeWords,
  toCamelCase,
  toSnakeCase,
  escapeHtml,
  unescapeHtml,
  env,
  isProduction,
  isDevelopment,
  isTest,
  timestamp,
  isoDate,
  deepEqual,
  deepMerge,
  groupBy,
  chunk,
  unique,
  shuffle,
  promisify,
  waitFor
};