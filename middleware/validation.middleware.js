const { validationResult, body, param, query } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Common validation rules
const commonValidations = {
  // User validations
  email: body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  phone: body('phone').matches(/^\+?[0-9]{10,15}$/).withMessage('Valid phone number is required'),
  password: body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  
  // ID validations
  id: param('id').isUUID().withMessage('Invalid ID format'),
  jobId: param('jobId').isUUID().withMessage('Invalid job ID format'),
  userId: param('userId').isUUID().withMessage('Invalid user ID format'),
  
  // Pagination
  page: query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),
  limit: query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be between 1 and 100'),
  
  // Date validations
  startDate: query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
  endDate: query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
  
  // Location
  latitude: body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  longitude: body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  
  // Amount
  amount: body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  
  // Rating
  rating: body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
};

const jobValidations = {
  create: [
    body('category').notEmpty().withMessage('Category is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('serviceType').isIn(['inspection', 'repair', 'installation', 'emergency']).withMessage('Invalid service type'),
    body('location').isObject().withMessage('Location is required'),
    body('location.latitude').isFloat({ min: -90, max: 90 }),
    body('location.longitude').isFloat({ min: -180, max: 180 }),
  ],
  accept: [
    param('jobId').isUUID().withMessage('Invalid job ID'),
  ],
  cancel: [
    param('jobId').isUUID(),
    body('reason').notEmpty().withMessage('Cancellation reason is required'),
  ],
};

const paymentValidations = {
  initialize: [
    param('jobId').isUUID(),
  ],
  webhook: [
    body('event').notEmpty(),
    body('data').notEmpty(),
  ],
};

const adminValidations = {
  verifyUser: [
    param('userId').isUUID(),
    body('status').isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected'),
    body('notes').optional().isString(),
  ],
  updateTier: [
    param('artisanId').isUUID(),
    body('tier').isInt({ min: 1, max: 3 }).withMessage('Tier must be 1, 2, or 3'),
  ],
};

module.exports = {
  validate,
  commonValidations,
  jobValidations,
  paymentValidations,
  adminValidations,
};