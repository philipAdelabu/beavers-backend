const { body, param } = require('express-validator');

const createBOQ = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  
  body('items.*.name')
    .notEmpty()
    .withMessage('Item name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Item name must be between 2 and 100 characters'),
  
  body('items.*.specifications')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Specifications cannot exceed 200 characters'),
  
  body('items.*.quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than 0'),
  
  body('items.*.unitCost')
    .isFloat({ min: 0 })
    .withMessage('Unit cost must be a positive number'),
  
  body('workmanshipCost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Workmanship cost must be a positive number'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const updateBOQ = [
  param('boqId')
    .isUUID()
    .withMessage('Invalid BOQ ID'),
  
  body('items')
    .optional()
    .isArray()
    .withMessage('Items must be an array'),
  
  body('items.*.name')
    .optional()
    .notEmpty()
    .withMessage('Item name cannot be empty'),
  
  body('items.*.quantity')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than 0'),
  
  body('items.*.unitCost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Unit cost must be a positive number'),
  
  body('workmanshipCost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Workmanship cost must be a positive number'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const submitBOQ = [
  param('boqId')
    .isUUID()
    .withMessage('Invalid BOQ ID')
];

const clientApproveBOQ = [
  param('boqId')
    .isUUID()
    .withMessage('Invalid BOQ ID')
];

const clientRejectBOQ = [
  param('boqId')
    .isUUID()
    .withMessage('Invalid BOQ ID'),
  
  body('reason')
    .notEmpty()
    .withMessage('Rejection reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

const adminApproveBOQ = [
  param('boqId')
    .isUUID()
    .withMessage('Invalid BOQ ID')
];

const getBOQ = [
  param('boqId')
    .isUUID()
    .withMessage('Invalid BOQ ID')
];

const getBOQByJob = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const getBOQHistory = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const requestSubstitution = [
  body('boqId')
    .isUUID()
    .withMessage('Invalid BOQ ID'),
  
  body('itemIndex')
    .isInt({ min: 0 })
    .withMessage('Item index must be a non-negative integer'),
  
  body('alternativeItem')
    .isObject()
    .withMessage('Alternative item is required'),
  
  body('alternativeItem.name')
    .notEmpty()
    .withMessage('Alternative item name is required'),
  
  body('alternativeItem.quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than 0'),
  
  body('alternativeItem.unitCost')
    .isFloat({ min: 0 })
    .withMessage('Unit cost must be a positive number'),
  
  body('reason')
    .notEmpty()
    .withMessage('Substitution reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

const approveSubstitution = [
  param('requestId')
    .isUUID()
    .withMessage('Invalid request ID')
];

const rejectSubstitution = [
  param('requestId')
    .isUUID()
    .withMessage('Invalid request ID'),
  
  body('reason')
    .notEmpty()
    .withMessage('Rejection reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
];

module.exports = {
  createBOQ,
  updateBOQ,
  submitBOQ,
  clientApproveBOQ,
  clientRejectBOQ,
  adminApproveBOQ,
  getBOQ,
  getBOQByJob,
  getBOQHistory,
  requestSubstitution,
  approveSubstitution,
  rejectSubstitution
};