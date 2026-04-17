const { body, param, query } = require('express-validator');

const verifyClient = [
  param('clientId')
    .isUUID()
    .withMessage('Invalid client ID'),
  
  body('status')
    .isIn(['approved', 'rejected'])
    .withMessage('Status must be approved or rejected'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const verifyArtisan = [
  param('artisanId')
    .isUUID()
    .withMessage('Invalid artisan ID'),
  
  body('status')
    .isIn(['approved', 'rejected'])
    .withMessage('Status must be approved or rejected'),
  
  body('tier')
    .optional()
    .isInt({ min: 1, max: 3 })
    .withMessage('Tier must be 1, 2, or 3'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const rejectVerification = [
  param('userId')
    .isUUID()
    .withMessage('Invalid user ID'),
  
  body('reason')
    .notEmpty()
    .withMessage('Rejection reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

const getAllUsers = [
  query('type')
    .optional()
    .isIn(['client', 'artisan', 'admin'])
    .withMessage('Type must be client, artisan, or admin'),
  
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'pending'])
    .withMessage('Status must be active, inactive, or pending'),
  
  query('search')
    .optional()
    .isString()
    .withMessage('Search must be a string'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const suspendUser = [
  param('userId')
    .isUUID()
    .withMessage('Invalid user ID'),
  
  body('reason')
    .notEmpty()
    .withMessage('Suspension reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  
  body('duration')
    .optional()
    .isString()
    .withMessage('Duration must be a string')
];

const activateUser = [
  param('userId')
    .isUUID()
    .withMessage('Invalid user ID')
];

const updateArtisanTier = [
  param('artisanId')
    .isUUID()
    .withMessage('Invalid artisan ID'),
  
  body('tier')
    .isInt({ min: 1, max: 3 })
    .withMessage('Tier must be 1, 2, or 3'),
  
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

const getAllJobs = [
  query('status')
    .optional()
    .isString()
    .withMessage('Status must be a string'),
  
  query('category')
    .optional()
    .isString()
    .withMessage('Category must be a string'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const forceCancelJob = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('reason')
    .notEmpty()
    .withMessage('Cancellation reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  
  body('refundAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Refund amount must be a positive number')
];

const getAllDisputes = [
  query('status')
    .optional()
    .isIn(['pending', 'resolved', 'rejected'])
    .withMessage('Status must be pending, resolved, or rejected'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

const resolveDispute = [
  param('disputeId')
    .isUUID()
    .withMessage('Invalid dispute ID'),
  
  body('decision')
    .isIn(['refund_client', 'pay_artisan', 'partial_refund', 'dismiss'])
    .withMessage('Invalid decision'),
  
  body('resolution')
    .notEmpty()
    .withMessage('Resolution details are required')
    .isLength({ max: 1000 })
    .withMessage('Resolution cannot exceed 1000 characters'),
  
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number')
];

const createCategory = [
  body('name')
    .notEmpty()
    .withMessage('Category name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Category name must be between 2 and 100 characters'),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  
  body('requiredCertifications')
    .optional()
    .isArray()
    .withMessage('Required certifications must be an array'),
  
  body('billingRules')
    .optional()
    .isObject()
    .withMessage('Billing rules must be an object'),
  
  body('icon')
    .optional()
    .isString()
    .withMessage('Icon must be a string')
];

const updateCategory = [
  param('categoryId')
    .isInt()
    .withMessage('Invalid category ID'),
  
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Category name must be between 2 and 100 characters'),
  
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

const getAuditLogs = [
  query('entityType')
    .optional()
    .isString()
    .withMessage('Entity type must be a string'),
  
  query('action')
    .optional()
    .isString()
    .withMessage('Action must be a string'),
  
  query('userId')
    .optional()
    .isUUID()
    .withMessage('Invalid user ID'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const generateReport = [
  body('type')
    .isIn(['financial', 'users', 'jobs', 'performance'])
    .withMessage('Invalid report type'),
  
  body('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),
  
  body('endDate')
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),
  
  body('format')
    .optional()
    .isIn(['json', 'csv', 'pdf'])
    .withMessage('Format must be json, csv, or pdf')
];

const sendBulkNotification = [
  body('userType')
    .optional()
    .isIn(['client', 'artisan', 'all'])
    .withMessage('User type must be client, artisan, or all'),
  
  body('tier')
    .optional()
    .isInt({ min: 1, max: 3 })
    .withMessage('Tier must be 1, 2, or 3'),
  
  body('title')
    .notEmpty()
    .withMessage('Notification title is required')
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),
  
  body('message')
    .notEmpty()
    .withMessage('Notification message is required')
    .isLength({ max: 500 })
    .withMessage('Message cannot exceed 500 characters'),
  
  body('type')
    .isString()
    .withMessage('Type is required')
];

const updateFeeConfiguration = [
  body('baseFee')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Base fee must be a positive number'),
  
  body('diagnosticsRatePerMinute')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Diagnostics rate must be a positive number'),
  
  body('executionRatePerMinute')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Execution rate must be a positive number'),
  
  body('platformCommissionPercent')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Platform commission must be between 0 and 100'),
  
  body('monthlyTechnologyFee')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly technology fee must be a positive number'),
  
  body('onboardingFee')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Onboarding fee must be a positive number')
];

module.exports = {
  verifyClient,
  verifyArtisan,
  rejectVerification,
  getAllUsers,
  suspendUser,
  activateUser,
  updateArtisanTier,
  getAllJobs,
  forceCancelJob,
  getAllDisputes,
  resolveDispute,
  createCategory,
  updateCategory,
  getAuditLogs,
  generateReport,
  sendBulkNotification,
  updateFeeConfiguration
};