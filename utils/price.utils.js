/**
 * Format amount to currency string
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: 'NGN')
 * @param {string} locale - Locale (default: 'en-NG')
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount, currency = 'NGN', locale = 'en-NG') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

/**
 * Format amount without currency symbol
 * @param {number} amount - Amount to format
 * @param {string} locale - Locale (default: 'en-NG')
 * @returns {string} Formatted number string
 */
const formatNumber = (amount, locale = 'en-NG') => {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

/**
 * Calculate percentage
 * @param {number} value - Value to calculate percentage of
 * @param {number} total - Total value
 * @returns {number} Percentage
 */
const calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return (value / total) * 100;
};

/**
 * Calculate discount amount
 * @param {number} originalPrice - Original price
 * @param {number} discountPercent - Discount percentage
 * @returns {number} Discount amount
 */
const calculateDiscountAmount = (originalPrice, discountPercent) => {
  return (originalPrice * discountPercent) / 100;
};

/**
 * Calculate price after discount
 * @param {number} originalPrice - Original price
 * @param {number} discountPercent - Discount percentage
 * @returns {number} Final price
 */
const calculateDiscountedPrice = (originalPrice, discountPercent) => {
  return originalPrice - calculateDiscountAmount(originalPrice, discountPercent);
};

/**
 * Calculate tax amount
 * @param {number} price - Price before tax
 * @param {number} taxRate - Tax rate percentage
 * @returns {number} Tax amount
 */
const calculateTax = (price, taxRate) => {
  return (price * taxRate) / 100;
};

/**
 * Calculate price with tax
 * @param {number} price - Price before tax
 * @param {number} taxRate - Tax rate percentage
 * @returns {number} Price with tax
 */
const calculatePriceWithTax = (price, taxRate) => {
  return price + calculateTax(price, taxRate);
};

/**
 * Calculate platform fee
 * @param {number} amount - Transaction amount
 * @param {number} feePercent - Fee percentage
 * @param {number} minFee - Minimum fee (optional)
 * @param {number} maxFee - Maximum fee (optional)
 * @returns {number} Platform fee
 */
const calculatePlatformFee = (amount, feePercent, minFee = null, maxFee = null) => {
  let fee = (amount * feePercent) / 100;
  
  if (minFee !== null && fee < minFee) {
    fee = minFee;
  }
  
  if (maxFee !== null && fee > maxFee) {
    fee = maxFee;
  }
  
  return Math.ceil(fee);
};

/**
 * Calculate artisan payout
 * @param {number} amount - Total amount paid by client
 * @param {number} platformFee - Platform fee amount
 * @returns {number} Artisan payout
 */
const calculateArtisanPayout = (amount, platformFee) => {
  return amount - platformFee;
};

/**
 * Calculate subtotal from items
 * @param {Array} items - Array of items with price and quantity
 * @returns {number} Subtotal
 */
const calculateSubtotal = (items) => {
  return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
};

/**
 * Apply rounding to amount
 * @param {number} amount - Amount to round
 * @param {number} decimals - Number of decimals (default: 2)
 * @returns {number} Rounded amount
 */
const roundAmount = (amount, decimals = 2) => {
  const multiplier = Math.pow(10, decimals);
  return Math.round(amount * multiplier) / multiplier;
};

/**
 * Convert kobo/cents to main currency unit
 * @param {number} amount - Amount in smallest unit
 * @returns {number} Amount in main unit
 */
const fromSmallestUnit = (amount) => {
  return amount / 100;
};

/**
 * Convert to kobo/cents
 * @param {number} amount - Amount in main unit
 * @returns {number} Amount in smallest unit
 */
const toSmallestUnit = (amount) => {
  return Math.round(amount * 100);
};

/**
 * Calculate price per unit
 * @param {number} totalPrice - Total price
 * @param {number} quantity - Quantity
 * @returns {number} Price per unit
 */
const calculateUnitPrice = (totalPrice, quantity) => {
  if (quantity === 0) return 0;
  return totalPrice / quantity;
};

/**
 * Calculate average price from multiple items
 * @param {Array} prices - Array of prices
 * @returns {number} Average price
 */
const calculateAveragePrice = (prices) => {
  if (prices.length === 0) return 0;
  const sum = prices.reduce((a, b) => a + b, 0);
  return sum / prices.length;
};

/**
 * Validate price range
 * @param {number} price - Price to validate
 * @param {number} min - Minimum allowed price
 * @param {number} max - Maximum allowed price
 * @returns {boolean} True if within range
 */
const isPriceInRange = (price, min, max) => {
  return price >= min && price <= max;
};

/**
 * Calculate price adjustment for bulk purchase
 * @param {number} quantity - Purchase quantity
 * @param {number} basePrice - Base price per unit
 * @param {Object} tiers - Bulk pricing tiers
 * @returns {number} Adjusted price per unit
 */
const calculateBulkPrice = (quantity, basePrice, tiers) => {
  let pricePerUnit = basePrice;
  
  for (const tier of tiers) {
    if (quantity >= tier.minQuantity) {
      pricePerUnit = tier.pricePerUnit;
    } else {
      break;
    }
  }
  
  return pricePerUnit;
};

module.exports = {
  formatCurrency,
  formatNumber,
  calculatePercentage,
  calculateDiscountAmount,
  calculateDiscountedPrice,
  calculateTax,
  calculatePriceWithTax,
  calculatePlatformFee,
  calculateArtisanPayout,
  calculateSubtotal,
  roundAmount,
  fromSmallestUnit,
  toSmallestUnit,
  calculateUnitPrice,
  calculateAveragePrice,
  isPriceInRange,
  calculateBulkPrice
};