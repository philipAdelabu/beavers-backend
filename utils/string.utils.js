/**
 * Capitalize first letter of string
 * @param {string} str - Input string
 * @returns {string} Capitalized string
 */
const capitalizeFirstLetter = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Capitalize each word in string
 * @param {string} str - Input string
 * @returns {string} Title case string
 */
const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

/**
 * Truncate string to specified length
 * @param {string} str - Input string
 * @param {number} length - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated string
 */
const truncate = (str, length, suffix = '...') => {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length - suffix.length) + suffix;
};

/**
 * Generate slug from string
 * @param {string} str - Input string
 * @returns {string} URL-friendly slug
 */
const slugify = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Generate random string
 * @param {number} length - Length of random string
 * @returns {string} Random string
 */
const randomString = (length = 10) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Check if string is valid email
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  const re = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;
  return re.test(email);
};

/**
 * Check if string is valid phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean}
 */
const isValidPhone = (phone) => {
  const re = /^\+?[0-9]{10,15}$/;
  return re.test(phone);
};

/**
 * Mask sensitive data (email, phone, etc.)
 * @param {string} str - Input string
 * @param {string} type - Type of masking ('email', 'phone', 'default')
 * @returns {string} Masked string
 */
const maskString = (str, type = 'default') => {
  if (!str) return '';
  
  if (type === 'email') {
    const [local, domain] = str.split('@');
    if (!domain) return str;
    const maskedLocal = local.length > 2 
      ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
      : local;
    return `${maskedLocal}@${domain}`;
  }
  
  if (type === 'phone') {
    if (str.length <= 4) return '*'.repeat(str.length);
    return '*'.repeat(str.length - 4) + str.slice(-4);
  }
  
  if (str.length <= 4) return '*'.repeat(str.length);
  return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
};

/**
 * Extract initials from name
 * @param {string} name - Full name
 * @returns {string} Initials
 */
const getInitials = (name) => {
  if (!name) return '';
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

/**
 * Remove HTML tags from string
 * @param {string} str - Input string with HTML
 * @returns {string} Plain text
 */
const stripHtml = (str) => {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '');
};

/**
 * Escape special characters for regex
 * @param {string} str - Input string
 * @returns {string} Escaped string
 */
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Check if string contains any of the given keywords
 * @param {string} str - Input string
 * @param {Array} keywords - Array of keywords
 * @returns {boolean}
 */
const containsKeywords = (str, keywords) => {
  if (!str) return false;
  const lowerStr = str.toLowerCase();
  return keywords.some(keyword => lowerStr.includes(keyword.toLowerCase()));
};

/**
 * Count words in string
 * @param {string} str - Input string
 * @returns {number} Word count
 */
const wordCount = (str) => {
  if (!str) return 0;
  return str.trim().split(/\s+/).length;
};

/**
 * Extract hashtags from string
 * @param {string} str - Input string
 * @returns {Array} Array of hashtags
 */
const extractHashtags = (str) => {
  if (!str) return [];
  const regex = /#(\w+)/g;
  const matches = str.match(regex);
  return matches ? matches.map(tag => tag.slice(1)) : [];
};

/**
 * Extract mentions from string
 * @param {string} str - Input string
 * @returns {Array} Array of mentions
 */
const extractMentions = (str) => {
  if (!str) return [];
  const regex = /@(\w+)/g;
  const matches = str.match(regex);
  return matches ? matches.map(mention => mention.slice(1)) : [];
};

/**
 * Camel case to snake case
 * @param {string} str - Camel case string
 * @returns {string} Snake case string
 */
const camelToSnake = (str) => {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

/**
 * Snake case to camel case
 * @param {string} str - Snake case string
 * @returns {string} Camel case string
 */
const snakeToCamel = (str) => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

module.exports = {
  capitalizeFirstLetter,
  toTitleCase,
  truncate,
  slugify,
  randomString,
  isValidEmail,
  isValidPhone,
  maskString,
  getInitials,
  stripHtml,
  escapeRegex,
  containsKeywords,
  wordCount,
  extractHashtags,
  extractMentions,
  camelToSnake,
  snakeToCamel
};