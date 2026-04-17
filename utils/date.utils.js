const moment = require('moment');

/**
 * Format date to ISO string
 * @param {Date|string} date - Date to format
 * @returns {string} ISO formatted date
 */
const toISOString = (date) => {
  return moment(date).toISOString();
};

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @param {string} format - Date format (default: 'MMM D, YYYY')
 * @returns {string} Formatted date
 */
const formatDate = (date, format = 'MMM D, YYYY') => {
  return moment(date).format(format);
};

/**
 * Format time for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted time (e.g., "2:30 PM")
 */
const formatTime = (date) => {
  return moment(date).format('h:mm A');
};

/**
 * Format date and time for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted datetime (e.g., "Jan 15, 2024, 2:30 PM")
 */
const formatDateTime = (date) => {
  return moment(date).format('MMM D, YYYY, h:mm A');
};

/**
 * Get relative time (e.g., "2 hours ago", "just now")
 * @param {Date|string} date - Date to compare
 * @returns {string} Relative time string
 */
const getRelativeTime = (date) => {
  const now = moment();
  const target = moment(date);
  const diffSeconds = now.diff(target, 'seconds');
  
  if (diffSeconds < 60) return 'just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} minutes ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} hours ago`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)} days ago`;
  if (diffSeconds < 2592000) return `${Math.floor(diffSeconds / 604800)} weeks ago`;
  if (diffSeconds < 31536000) return `${Math.floor(diffSeconds / 2592000)} months ago`;
  return `${Math.floor(diffSeconds / 31536000)} years ago`;
};

/**
 * Check if date is today
 * @param {Date|string} date - Date to check
 * @returns {boolean}
 */
const isToday = (date) => {
  return moment(date).isSame(moment(), 'day');
};

/**
 * Check if date is this week
 * @param {Date|string} date - Date to check
 * @returns {boolean}
 */
const isThisWeek = (date) => {
  return moment(date).isSame(moment(), 'week');
};

/**
 * Check if date is this month
 * @param {Date|string} date - Date to check
 * @returns {boolean}
 */
const isThisMonth = (date) => {
  return moment(date).isSame(moment(), 'month');
};

/**
 * Get start of day
 * @param {Date|string} date - Date (default: now)
 * @returns {Date}
 */
const startOfDay = (date = new Date()) => {
  return moment(date).startOf('day').toDate();
};

/**
 * Get end of day
 * @param {Date|string} date - Date (default: now)
 * @returns {Date}
 */
const endOfDay = (date = new Date()) => {
  return moment(date).endOf('day').toDate();
};

/**
 * Get start of week
 * @param {Date|string} date - Date (default: now)
 * @returns {Date}
 */
const startOfWeek = (date = new Date()) => {
  return moment(date).startOf('week').toDate();
};

/**
 * Get end of week
 * @param {Date|string} date - Date (default: now)
 * @returns {Date}
 */
const endOfWeek = (date = new Date()) => {
  return moment(date).endOf('week').toDate();
};

/**
 * Get start of month
 * @param {Date|string} date - Date (default: now)
 * @returns {Date}
 */
const startOfMonth = (date = new Date()) => {
  return moment(date).startOf('month').toDate();
};

/**
 * Get end of month
 * @param {Date|string} date - Date (default: now)
 * @returns {Date}
 */
const endOfMonth = (date = new Date()) => {
  return moment(date).endOf('month').toDate();
};

/**
 * Get start of year
 * @param {Date|string} date - Date (default: now)
 * @returns {Date}
 */
const startOfYear = (date = new Date()) => {
  return moment(date).startOf('year').toDate();
};

/**
 * Get end of year
 * @param {Date|string} date - Date (default: now)
 * @returns {Date}
 */
const endOfYear = (date = new Date()) => {
  return moment(date).endOf('year').toDate();
};

/**
 * Add days to date
 * @param {Date|string} date - Starting date
 * @param {number} days - Number of days to add
 * @returns {Date}
 */
const addDays = (date, days) => {
  return moment(date).add(days, 'days').toDate();
};

/**
 * Subtract days from date
 * @param {Date|string} date - Starting date
 * @param {number} days - Number of days to subtract
 * @returns {Date}
 */
const subtractDays = (date, days) => {
  return moment(date).subtract(days, 'days').toDate();
};

/**
 * Get date range for a period
 * @param {string} period - 'day', 'week', 'month', 'year'
 * @returns {Object} { startDate, endDate }
 */
const getDateRange = (period) => {
  const now = new Date();
  let startDate, endDate;
  
  switch (period) {
    case 'day':
      startDate = startOfDay(now);
      endDate = endOfDay(now);
      break;
    case 'week':
      startDate = startOfWeek(now);
      endDate = endOfWeek(now);
      break;
    case 'month':
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
      break;
    case 'year':
      startDate = startOfYear(now);
      endDate = endOfYear(now);
      break;
    default:
      startDate = startOfDay(now);
      endDate = endOfDay(now);
  }
  
  return { startDate, endDate };
};

/**
 * Get age from birthdate
 * @param {Date|string} birthdate - Birthdate
 * @returns {number} Age in years
 */
const getAge = (birthdate) => {
  return moment().diff(moment(birthdate), 'years');
};

/**
 * Get days between two dates
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number}
 */
const daysBetween = (date1, date2) => {
  return moment(date2).diff(moment(date1), 'days');
};

/**
 * Get hours between two dates
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number}
 */
const hoursBetween = (date1, date2) => {
  return moment(date2).diff(moment(date1), 'hours');
};

/**
 * Get minutes between two dates
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number}
 */
const minutesBetween = (date1, date2) => {
  return moment(date2).diff(moment(date1), 'minutes');
};

/**
 * Get seconds between two dates
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number}
 */
const secondsBetween = (date1, date2) => {
  return moment(date2).diff(moment(date1), 'seconds');
};

/**
 * Check if date is within range
 * @param {Date|string} date - Date to check
 * @param {Date|string} start - Start of range
 * @param {Date|string} end - End of range
 * @returns {boolean}
 */
const isWithinRange = (date, start, end) => {
  const d = moment(date);
  return d.isBetween(moment(start), moment(end));
};

/**
 * Get next occurrence of a day of week
 * @param {number} dayOfWeek - Day of week (0-6, 0=Sunday)
 * @returns {Date}
 */
const getNextDayOfWeek = (dayOfWeek) => {
  return moment().day(dayOfWeek + 7).toDate();
};

/**
 * Get previous occurrence of a day of week
 * @param {number} dayOfWeek - Day of week (0-6, 0=Sunday)
 * @returns {Date}
 */
const getPreviousDayOfWeek = (dayOfWeek) => {
  return moment().day(dayOfWeek - 7).toDate();
};

module.exports = {
  toISOString,
  formatDate,
  formatTime,
  formatDateTime,
  getRelativeTime,
  isToday,
  isThisWeek,
  isThisMonth,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addDays,
  subtractDays,
  getDateRange,
  getAge,
  daysBetween,
  hoursBetween,
  minutesBetween,
  secondsBetween,
  isWithinRange,
  getNextDayOfWeek,
  getPreviousDayOfWeek
};