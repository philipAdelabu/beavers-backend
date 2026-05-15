const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const BOQController = require('../controllers/boq.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

// All BOQ routes require authentication
router.use(authenticateToken);

// ==================== BOQ CRUD Operations ====================

// Create BOQ (Artisan only)
router.post('/create/:jobId', requireRole(['artisan']), [
  param('jobId').isUUID().withMessage('Invalid job ID'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.name').notEmpty().withMessage('Item name is required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
  body('items.*.unitCost').isFloat({ min: 0 }).withMessage('Unit cost must be a positive number'),
  body('workmanshipCost').optional().isFloat({ min: 0 }),
  body('notes').optional().isString(),
], BOQController.createBOQ);

// Update BOQ (Artisan only - draft only)
router.put('/:boqId', requireRole(['artisan']), [
  param('boqId').isUUID().withMessage('Invalid BOQ ID'),
  body('items').optional().isArray(),
  body('items.*.name').optional().notEmpty(),
  body('items.*.quantity').optional().isFloat({ min: 0.01 }),
  body('items.*.unitCost').optional().isFloat({ min: 0 }),
  body('workmanshipCost').optional().isFloat({ min: 0 }),
  body('notes').optional().isString(),
], BOQController.updateBOQ);

// Submit BOQ for approval (Artisan only)
router.post('/:boqId/submit', requireRole(['artisan']), [
  param('boqId').isUUID().withMessage('Invalid BOQ ID')
], BOQController.submitBOQ);

// ==================== Approval Workflow ====================

// Client approve BOQ
router.post('/:boqId/client-approve', requireRole(['client']), [
  param('boqId').isUUID().withMessage('Invalid BOQ ID'),
], BOQController.clientApprove);

// Client reject BOQ
router.post('/:boqId/client-reject', requireRole(['client']), [
  param('boqId').isUUID().withMessage('Invalid BOQ ID'),
  body('reason').notEmpty().withMessage('Rejection reason is required')
], BOQController.clientReject);

// Admin approve BOQ
router.post('/:boqId/admin-approve', requireRole(['admin']), [
  param('boqId').isUUID().withMessage('Invalid BOQ ID')
], BOQController.adminApprove);

// Admin reject BOQ
router.post('/:boqId/admin-reject', requireRole(['admin']), [
  param('boqId').isUUID().withMessage('Invalid BOQ ID'),
  body('reason').notEmpty().withMessage('Rejection reason is required')
], BOQController.adminReject);

// ==================== Retrieval Endpoints ====================

// Get BOQ by ID
router.get('/:boqId', [
  param('boqId').isUUID().withMessage('Invalid BOQ ID')
], BOQController.getBOQ);

// Get BOQ by Job ID
router.get('/job/:jobId', [
  param('jobId').isUUID().withMessage('Invalid job ID')
], BOQController.getBOQByJob);

// Get BOQ history for a job
router.get('/job/:jobId/history', [
  param('jobId').isUUID().withMessage('Invalid job ID')
], BOQController.getBOQHistory);

// Download BOQ as PDF
router.get('/:boqId/download', [
  param('boqId').isUUID().withMessage('Invalid BOQ ID')
], BOQController.downloadBOQ);

// ==================== Substitution Requests ====================

// Request material substitution (Artisan only)
router.post('/substitution-request', requireRole(['artisan']), [
  body('boqId').isUUID().withMessage('Invalid BOQ ID'),
  body('itemIndex').isInt({ min: 0 }).withMessage('Invalid item index'),
  body('alternativeItem').isObject().withMessage('Alternative item is required'),
  body('alternativeItem.name').notEmpty().withMessage('Alternative item name is required'),
  body('alternativeItem.quantity').isFloat({ min: 0.01 }),
  body('alternativeItem.unitCost').isFloat({ min: 0 }),
  body('reason').notEmpty().withMessage('Substitution reason is required'),
], BOQController.requestSubstitution);


// Approve substitution request (Admin only)
router.post('/substitution/:requestId/approve', requireRole(['admin']), [
  param('requestId').isUUID().withMessage('Invalid request ID')
], BOQController.approveSubstitution);

// Reject substitution request (Admin only)
router.post('/substitution/:requestId/reject', requireRole(['admin']), [
  param('requestId').isUUID().withMessage('Invalid request ID'),
  body('reason').notEmpty().withMessage('Rejection reason is required')
], BOQController.rejectSubstitution);

// Get substitution requests (Admin only)
router.get('/substitution-requests', requireRole(['admin']), [
  query('status').optional().isIn(['pending', 'approved', 'rejected']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], BOQController.getSubstitutionRequests);

// ==================== Statistics (Admin only) ====================

router.get('/statistics', requireRole(['admin']), BOQController.getBOQStatistics);

module.exports = router;
