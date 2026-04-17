const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const Dispute = require('../models/Dispute');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');

// Create support ticket
router.post('/tickets', authenticateToken, [
  body('subject').notEmpty(),
  body('message').notEmpty(),
  body('category').isIn(['billing', 'technical', 'general', 'dispute', 'other']),
  body('jobId').optional().isUUID(),
  body('attachments').optional().isArray()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // Create ticket logic
    const ticket = {
      id: Date.now(),
      userId: req.user.id,
      ...req.body,
      status: 'open',
      createdAt: new Date()
    };
    
    sendSuccess(res, ticket, 'Support ticket created', 201);
  } catch (error) {
    next(error);
  }
});

// Get user tickets
router.get('/tickets', authenticateToken, [
  query('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // Get tickets logic
    sendPaginated(res, [], 1, 20, 0, 'Tickets retrieved');
  } catch (error) {
    next(error);
  }
});

// Get ticket details
router.get('/tickets/:ticketId', authenticateToken, [
  param('ticketId').isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // Get ticket logic
    sendSuccess(res, { id: req.params.ticketId }, 'Ticket details retrieved');
  } catch (error) {
    next(error);
  }
});

// Reply to ticket
router.post('/tickets/:ticketId/reply', authenticateToken, [
  param('ticketId').isString(),
  body('message').notEmpty(),
  body('attachments').optional().isArray()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // Reply logic
    sendSuccess(res, null, 'Reply sent successfully');
  } catch (error) {
    next(error);
  }
});

// Close ticket
router.put('/tickets/:ticketId/close', authenticateToken, [
  param('ticketId').isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    sendSuccess(res, null, 'Ticket closed');
  } catch (error) {
    next(error);
  }
});

// Create dispute (client)
router.post('/disputes', authenticateToken, requireRole(['client']), [
  body('jobId').isUUID(),
  body('reason').notEmpty(),
  body('description').notEmpty(),
  body('evidence').optional().isArray()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const dispute = await Dispute.create({
      jobId: req.body.jobId,
      clientId: req.user.id,
      reason: req.body.reason,
      description: req.body.description,
      evidence: req.body.evidence || []
    });
    
    sendSuccess(res, dispute, 'Dispute created successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Get user disputes
router.get('/disputes', authenticateToken, [
  query('status').optional().isIn(['pending', 'resolved', 'rejected']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    let result;
    if (req.user.user_type === 'client') {
      result = await Dispute.getDisputesByClient(req.user.id, req.query);
    } else if (req.user.user_type === 'artisan') {
      result = await Dispute.getDisputesByArtisan(req.user.id, req.query);
    } else {
      result = await Dispute.getAllDisputes(req.query);
    }
    
    sendSuccess(res, result.disputes || result, 'Disputes retrieved');
  } catch (error) {
    next(error);
  }
});

// Get dispute details
router.get('/disputes/:disputeId', authenticateToken, [
  param('disputeId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const dispute = await Dispute.findById(req.params.disputeId);
    if (!dispute) {
      throw new AppError(404, 'Dispute not found');
    }
    
    sendSuccess(res, dispute, 'Dispute details retrieved');
  } catch (error) {
    next(error);
  }
});

// Add message to dispute
router.post('/disputes/:disputeId/messages', authenticateToken, [
  param('disputeId').isUUID(),
  body('message').notEmpty(),
  body('attachments').optional().isArray()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const message = await Dispute.addMessage(
      req.params.disputeId,
      req.user.id,
      req.body.message,
      req.body.attachments || []
    );
    
    sendSuccess(res, message, 'Message added successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Get dispute messages
router.get('/disputes/:disputeId/messages', authenticateToken, [
  param('disputeId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const messages = await Dispute.getMessages(req.params.disputeId);
    sendSuccess(res, messages, 'Messages retrieved');
  } catch (error) {
    next(error);
  }
});

// Cancel dispute (client)
router.post('/disputes/:disputeId/cancel', authenticateToken, requireRole(['client']), [
  param('disputeId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const dispute = await Dispute.updateStatus(req.params.disputeId, 'cancelled', null, req.user.id);
    sendSuccess(res, dispute, 'Dispute cancelled');
  } catch (error) {
    next(error);
  }
});

// Get support faqs
router.get('/faqs', async (req, res, next) => {
  try {
    const faqs = [
      { question: 'How do I become an artisan?', answer: 'Register and complete verification...' },
      { question: 'How are payments handled?', answer: 'Payments are held in escrow...' }
    ];
    sendSuccess(res, faqs, 'FAQs retrieved');
  } catch (error) {
    next(error);
  }
});

// Get contact information
router.get('/contact', async (req, res, next) => {
  try {
    const contact = {
      email: 'support@beaverworks.com',
      phone: '+234 123 456 7890',
      hours: 'Monday-Friday, 9am-6pm'
    };
    sendSuccess(res, contact, 'Contact information retrieved');
  } catch (error) {
    next(error);
  }
});

module.exports = router;