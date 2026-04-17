const { body, param, query } = require('express-validator');

const updateProfile = [
  body('fullLegalName')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full legal name must be between 2 and 100 characters'),
  
  body('streetAddress')
    .optional()
    .isLength({ min: 5, max: 200 })
    .withMessage('Street address must be between 5 and 200 characters'),
  
  body('serviceAddress')
    .optional()
    .isLength({ min: 5, max: 200 })
    .withMessage('Service address must be between 5 and 200 characters')
];

const addAddress = [
  body('address')
    .notEmpty()
    .withMessage('Address is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  
  body('label')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Label must be between 1 and 50 characters'),
  
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be a boolean'),
  
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
];

const updateAddress = [
  param('addressId')
    .isUUID()
    .withMessage('Invalid address ID'),
  
  body('address')
    .optional()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  
  body('label')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Label must be between 1 and 50 characters'),
  
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be a boolean'),
  
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
];

const deleteAddress = [
  param('addressId')
    .isUUID()
    .withMessage('Invalid address ID')
];

const saveArtisan = [
  param('artisanId')
    .isUUID()
    .withMessage('Invalid artisan ID')
];

const removeSavedArtisan = [
  param('artisanId')
    .isUUID()
    .withMessage('Invalid artisan ID')
];

const getJobHistory = [
  query('status')
    .optional()
    .isIn(['pending', 'accepted', 'arrived', 'diagnostics', 'execution', 'completed', 'cancelled'])
    .withMessage('Invalid job status'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const addPaymentMethod = [
  body('paymentMethodId')
    .notEmpty()
    .withMessage('Payment method ID is required'),
  
  body('setAsDefault')
    .optional()
    .isBoolean()
    .withMessage('setAsDefault must be a boolean')
];

const deletePaymentMethod = [
  param('methodId')
    .isUUID()
    .withMessage('Invalid payment method ID')
];

const setDefaultPaymentMethod = [
  param('methodId')
    .isUUID()
    .withMessage('Invalid payment method ID')
];

const getNotifications = [
  query('isRead')
    .optional()
    .isBoolean()
    .withMessage('isRead must be a boolean'),
  
  query('type')
    .optional()
    .isString()
    .withMessage('Type must be a string'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

const markNotificationAsRead = [
  param('notificationId')
    .isUUID()
    .withMessage('Invalid notification ID')
];

const deleteNotification = [
  param('notificationId')
    .isUUID()
    .withMessage('Invalid notification ID')
];

module.exports = {
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  saveArtisan,
  removeSavedArtisan,
  getJobHistory,
  addPaymentMethod,
  deletePaymentMethod,
  setDefaultPaymentMethod,
  getNotifications,
  markNotificationAsRead,
  deleteNotification
};