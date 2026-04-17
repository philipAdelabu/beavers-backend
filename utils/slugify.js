/**
 * Convert string to URL-friendly slug
 * @param {string} text - Text to convert
 * @param {Object} options - Options
 * @param {boolean} options.lowercase - Convert to lowercase (default: true)
 * @param {boolean} options.removeStopWords - Remove common stop words (default: false)
 * @param {string} options.separator - Word separator (default: '-')
 * @returns {string} Slug
 */
const slugify = (text, options = {}) => {
  const {
    lowercase = true,
    removeStopWords = false,
    separator = '-'
  } = options;
  
  if (!text) return '';
  
  let slug = text;
  
  // Remove HTML tags
  slug = slug.replace(/<[^>]*>/g, '');
  
  // Remove special characters
  slug = slug.replace(/[^\w\s-]/g, '');
  
  // Replace spaces with separator
  slug = slug.replace(/\s+/g, separator);
  
  // Remove multiple separators
  slug = slug.replace(new RegExp(`${separator}+`, 'g'), separator);
  
  // Remove stop words if enabled
  if (removeStopWords) {
    const stopWords = ['a', 'an', 'and', 'or', 'but', 'for', 'of', 'the', 'to', 'with'];
    const words = slug.split(separator);
    slug = words.filter(word => !stopWords.includes(word.toLowerCase())).join(separator);
  }
  
  // Convert to lowercase if enabled
  if (lowercase) {
    slug = slug.toLowerCase();
  }
  
  // Remove leading/trailing separators
  slug = slug.replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '');
  
  return slug;
};

/**
 * Generate unique slug by appending number if exists
 * @param {string} text - Base text
 * @param {Function} existsCheck - Function to check if slug exists
 * @param {Object} options - Slugify options
 * @returns {Promise<string>} Unique slug
 */
const generateUniqueSlug = async (text, existsCheck, options = {}) => {
  let slug = slugify(text, options);
  let uniqueSlug = slug;
  let counter = 1;
  
  while (await existsCheck(uniqueSlug)) {
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }
  
  return uniqueSlug;
};

/**
 * Generate slug for username
 * @param {string} username - Username
 * @returns {string} Username slug
 */
const usernameSlug = (username) => {
  return slugify(username, { lowercase: true, separator: '.' });
};

/**
 * Generate slug for category
 * @param {string} categoryName - Category name
 * @returns {string} Category slug
 */
const categorySlug = (categoryName) => {
  return slugify(categoryName, { lowercase: true, removeStopWords: true });
};

/**
 * Generate slug for product/service
 * @param {string} name - Product/service name
 * @returns {string} Product slug
 */
const productSlug = (name) => {
  return slugify(name, { lowercase: true });
};

/**
 * Generate slug for blog post
 * @param {string} title - Blog post title
 * @returns {string} Blog slug
 */
const blogSlug = (title) => {
  return slugify(title, { lowercase: true });
};

/**
 * Convert slug back to readable text
 * @param {string} slug - Slug to convert
 * @param {Object} options - Options
 * @param {boolean} options.capitalize - Capitalize words (default: true)
 * @param {string} options.separator - Word separator (default: '-')
 * @returns {string} Readable text
 */
const unslugify = (slug, options = {}) => {
  const {
    capitalize = true,
    separator = '-'
  } = options;
  
  let text = slug.replace(new RegExp(separator, 'g'), ' ');
  
  if (capitalize) {
    text = text.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
  
  return text;
};

module.exports = {
  slugify,
  generateUniqueSlug,
  usernameSlug,
  categorySlug,
  productSlug,
  blogSlug,
  unslugify
};