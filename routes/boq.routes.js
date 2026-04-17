const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole, requireVerification } = require('../middleware/auth.middleware');
const BillOfQuantities = require('../models/BillOfQuantities');
const Job = require('../models/Job');
const { sendSuccess, sendError } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');

// Create BoQ (Artisan)
router.post('/create/:jobId', authenticateToken, requireRole(['artisan']), [
  param('jobId').isUUID(),
  body('items').isArray().notEmpty(),
  body('items.*.name').notEmpty(),
  body('items.*.quantity').isFloat({ min: 0.01 }),
  body('items.*.unitCost').isFloat({ min: 0 }),
  body('workmanshipCost').optional().isFloat({ min: 0 }),
  body('notes').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // Verify artisan is assigned to this job
    const job = await Job.findById(req.params.jobId);
    if (!job || job.artisan_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to create BoQ for this job');
    }

    const totalMaterialsCost = req.body.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
    
    const boq = await BillOfQuantities.create({
      jobId: req.params.jobId,
      artisanId: req.user.id,
      items: req.body.items,
      totalMaterialsCost,
      totalWorkmanshipCost: req.body.workmanshipCost || 0,
      notes: req.body.notes
    });
    
    sendSuccess(res, boq, 'BoQ created successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Get BoQ by job
router.get('/job/:jobId', authenticateToken, [
  param('jobId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const job = await Job.findById(req.params.jobId);
    if (!job || (job.client_id !== req.user.id && job.artisan_id !== req.user.id && req.user.user_type !== 'admin')) {
      throw new AppError(403, 'Not authorized to view this BoQ');
    }
    
    const boq = await BillOfQuantities.findByJobId(req.params.jobId);
    sendSuccess(res, boq, 'BoQ retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get BoQ details
router.get('/:boqId', authenticateToken, [
  param('boqId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const boq = await BillOfQuantities.findById(req.params.boqId);
    if (!boq) {
      throw new AppError(404, 'BoQ not found');
    }
    
    const job = await Job.findById(boq.job_id);
    if (job.client_id !== req.user.id && job.artisan_id !== req.user.id && req.user.user_type !== 'admin') {
      throw new AppError(403, 'Not authorized to view this BoQ');
    }
    
    sendSuccess(res, boq, 'BoQ retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Update BoQ (Artisan - draft only)
router.put('/:boqId', authenticateToken, requireRole(['artisan']), [
  param('boqId').isUUID(),
  body('items').optional().isArray(),
  body('items.*.name').optional().notEmpty(),
  body('items.*.quantity').optional().isFloat({ min: 0.01 }),
  body('items.*.unitCost').optional().isFloat({ min: 0 }),
  body('workmanshipCost').optional().isFloat({ min: 0 }),
  body('notes').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const boq = await BillOfQuantities.findById(req.params.boqId);
    if (!boq) {
      throw new AppError(404, 'BoQ not found');
    }
    
    if (boq.artisan_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to update this BoQ');
    }
    
    if (boq.status !== 'draft') {
      throw new AppError(400, 'Cannot update BoQ after submission');
    }
    
    if (req.body.items) {
      req.body.total_materials_cost = req.body.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
    }
    
    const updated = await BillOfQuantities.update(req.params.boqId, req.body);
    sendSuccess(res, updated, 'BoQ updated successfully');
  } catch (error) {
    next(error);
  }
});

// Submit BoQ for approval (Artisan)
router.post('/:boqId/submit', authenticateToken, requireRole(['artisan']), [
  param('boqId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const boq = await BillOfQuantities.findById(req.params.boqId);
    if (!boq) {
      throw new AppError(404, 'BoQ not found');
    }
    
    if (boq.artisan_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to submit this BoQ');
    }
    
    if (boq.status !== 'draft') {
      throw new AppError(400, 'BoQ has already been submitted');
    }
    
    const submitted = await BillOfQuantities.submitForApproval(req.params.boqId);
    sendSuccess(res, submitted, 'BoQ submitted for approval');
  } catch (error) {
    next(error);
  }
});

// Client approve BoQ
router.post('/:boqId/client-approve', authenticateToken, requireRole(['client']), [
  param('boqId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const boq = await BillOfQuantities.findById(req.params.boqId);
    if (!boq) {
      throw new AppError(404, 'BoQ not found');
    }
    
    const job = await Job.findById(boq.job_id);
    if (job.client_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to approve this BoQ');
    }
    
    if (boq.status !== 'pending_client_approval') {
      throw new AppError(400, 'BoQ is not pending client approval');
    }
    
    const approved = await BillOfQuantities.clientApprove(req.params.boqId, req.user.id);
    sendSuccess(res, approved, 'BoQ approved by client');
  } catch (error) {
    next(error);
  }
});

// Client reject BoQ
router.post('/:boqId/client-reject', authenticateToken, requireRole(['client']), [
  param('boqId').isUUID(),
  body('reason').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const boq = await BillOfQuantities.findById(req.params.boqId);
    if (!boq) {
      throw new AppError(404, 'BoQ not found');
    }
    
    const job = await Job.findById(boq.job_id);
    if (job.client_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to reject this BoQ');
    }
    
    if (boq.status !== 'pending_client_approval') {
      throw new AppError(400, 'BoQ is not pending client approval');
    }
    
    const rejected = await BillOfQuantities.clientReject(req.params.boqId, req.user.id, req.body.reason);
    sendSuccess(res, rejected, 'BoQ rejected by client');
  } catch (error) {
    next(error);
  }
});

// Get BoQ history
router.get('/job/:jobId/history', authenticateToken, [
  param('jobId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const job = await Job.findById(req.params.jobId);
    if (!job || (job.client_id !== req.user.id && job.artisan_id !== req.user.id && req.user.user_type !== 'admin')) {
      throw new AppError(403, 'Not authorized to view BoQ history');
    }
    
    const history = await BillOfQuantities.getHistory(req.params.jobId);
    sendSuccess(res, history, 'BoQ history retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Request material substitution (Artisan)
router.post('/substitution-request', authenticateToken, requireRole(['artisan']), [
  body('boqId').isUUID(),
  body('itemIndex').isInt({ min: 0 }),
  body('alternativeItem').isObject(),
  body('reason').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const boq = await BillOfQuantities.findById(req.body.boqId);
    if (!boq) {
      throw new AppError(404, 'BoQ not found');
    }
    
    if (boq.artisan_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to request substitution');
    }
    
    const request = await BillOfQuantities.requestSubstitution(
      req.body.boqId,
      req.body.itemIndex,
      req.body.alternativeItem,
      req.body.reason
    );
    
    sendSuccess(res, request, 'Substitution request submitted', 201);
  } catch (error) {
    next(error);
  }
});

// Admin approve substitution
router.post('/substitution/:requestId/approve', authenticateToken, requireRole(['admin']), [
  param('requestId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const approved = await BillOfQuantities.approveSubstitution(req.params.requestId, req.user.id);
    if (!approved) {
      throw new AppError(404, 'Substitution request not found');
    }
    sendSuccess(res, approved, 'Substitution approved');
  } catch (error) {
    next(error);
  }
});

// Admin reject substitution
router.post('/substitution/:requestId/reject', authenticateToken, requireRole(['admin']), [
  param('requestId').isUUID(),
  body('reason').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const rejected = await BillOfQuantities.rejectSubstitution(req.params.requestId, req.user.id, req.body.reason);
    if (!rejected) {
      throw new AppError(404, 'Substitution request not found');
    }
    sendSuccess(res, rejected, 'Substitution rejected');
  } catch (error) {
    next(error);
  }
});

module.exports = router;