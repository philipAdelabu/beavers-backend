const { body, param, query } = require('express-validator');

const initializePayment = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('paymentMethodId')
    .optional()
    .notEmpty()
    .withMessage('Payment method ID is required if provided')
];

const confirmPayment = [
  param('paymentIntentId')
    .notEmpty()
    .withMessage('Payment intent ID is required')
];

const createRefund = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  
  body('reason')
    .notEmpty()
    .withMessage('Refund reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

const getPaymentHistory = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date')
];

const getTransactionDetails = [
  param('transactionId')
    .isUUID()
    .withMessage('Invalid transaction ID')
];

const getEscrowBalance = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const releaseEscrowFunds = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const createDispute = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('reason')
    .isIn(['work_not_completed', 'poor_workmanship', 'damage_to_property', 'overcharging', 'unauthorized_work', 'other'])
    .withMessage('Invalid dispute reason'),
  
  body('description')
    .notEmpty()
    .withMessage('Dispute description is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  
  body('evidence')
    .optional()
    .isArray()
    .withMessage('Evidence must be an array')
];

const getDisputeStatus = [
  param('disputeId')
    .isUUID()
    .withMessage('Invalid dispute ID')
];

const cancelDispute = [
  param('disputeId')
    .isUUID()
    .withMessage('Invalid dispute ID')
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

const getPaymentSummary = [
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Period must be day, week, month, or year')
];

module.exports = {
  initializePayment,
  confirmPayment,
  createRefund,
  getPaymentHistory,
  getTransactionDetails,
  getEscrowBalance,
  releaseEscrowFunds,
  createDispute,
  getDisputeStatus,
  cancelDispute,
  addPaymentMethod,
  deletePaymentMethod,
  setDefaultPaymentMethod,
  getPaymentSummary
};