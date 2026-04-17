const { body, param, query } = require('express-validator');

const updateProfile = [
  body('fullLegalName')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full legal name must be between 2 and 100 characters'),
  
  body('residentialAddress')
    .optional()
    .isLength({ min: 5, max: 200 })
    .withMessage('Residential address must be between 5 and 200 characters'),
  
  body('skillCategory')
    .optional()
    .isIn(['plumbing', 'electrical', 'carpentry', 'painting', 'tiling', 'hvac', 'generator', 'cctv', 'appliance', 'landscaping'])
    .withMessage('Invalid skill category'),
  
  body('subCategories')
    .optional()
    .isArray()
    .withMessage('Sub categories must be an array')
];

const updateAvailability = [
  body('isAvailable')
    .isBoolean()
    .withMessage('isAvailable must be a boolean'),
  
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object'),
  
  body('location.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('location.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
];

const getEarnings = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date')
];

const requestWithdrawal = [
  body('amount')
    .isFloat({ min: 1000 })
    .withMessage('Amount must be at least ₦1,000'),
  
  body('bankCode')
    .notEmpty()
    .withMessage('Bank code is required'),
  
  body('accountNumber')
    .notEmpty()
    .withMessage('Account number is required')
    .matches(/^[0-9]{10}$/)
    .withMessage('Account number must be 10 digits'),
  
  body('accountName')
    .notEmpty()
    .withMessage('Account name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Account name must be between 2 and 100 characters')
];

const getWithdrawalHistory = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

const updateBankAccount = [
  body('bankCode')
    .notEmpty()
    .withMessage('Bank code is required'),
  
  body('accountNumber')
    .notEmpty()
    .withMessage('Account number is required')
    .matches(/^[0-9]{10}$/)
    .withMessage('Account number must be 10 digits'),
  
  body('accountName')
    .notEmpty()
    .withMessage('Account name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Account name must be between 2 and 100 characters')
];

const getSchedule = [
  query('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date')
];

const setSchedule = [
  body('dayOfWeek')
    .isInt({ min: 0, max: 6 })
    .withMessage('Day of week must be between 0 (Sunday) and 6 (Saturday)'),
  
  body('startTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  
  body('endTime')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  
  body('isAvailable')
    .isBoolean()
    .withMessage('isAvailable must be a boolean')
];

const addTool = [
  body('name')
    .notEmpty()
    .withMessage('Tool name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Tool name must be between 2 and 100 characters'),
  
  body('quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  
  body('condition')
    .optional()
    .isIn(['new', 'good', 'fair', 'poor'])
    .withMessage('Condition must be new, good, fair, or poor'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const updateTool = [
  param('toolId')
    .isUUID()
    .withMessage('Invalid tool ID'),
  
  body('quantity')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Quantity must be at least 0'),
  
  body('condition')
    .optional()
    .isIn(['new', 'good', 'fair', 'poor'])
    .withMessage('Condition must be new, good, fair, or poor'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const getUpcomingJobs = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

const getRatings = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

const enrollCourse = [
  param('courseId')
    .isUUID()
    .withMessage('Invalid course ID')
];

const completeModule = [
  param('courseId')
    .isUUID()
    .withMessage('Invalid course ID'),
  
  param('moduleIndex')
    .isInt({ min: 0 })
    .withMessage('Module index must be a non-negative integer')
];

const getCourseProgress = [
  param('courseId')
    .isUUID()
    .withMessage('Invalid course ID')
];

const getCertificate = [
  param('courseId')
    .isUUID()
    .withMessage('Invalid course ID')
];

const payMonthlyFee = [
  body('paymentMethodId')
    .notEmpty()
    .withMessage('Payment method ID is required')
];

module.exports = {
  updateProfile,
  updateAvailability,
  getEarnings,
  requestWithdrawal,
  getWithdrawalHistory,
  updateBankAccount,
  getSchedule,
  setSchedule,
  addTool,
  updateTool,
  getUpcomingJobs,
  getRatings,
  enrollCourse,
  completeModule,
  getCourseProgress,
  getCertificate,
  payMonthlyFee
};