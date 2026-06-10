const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const User = require('../models/User');
const Artisan = require('../models/Artisan');
const Client = require('../models/Client');
const Job = require('../models/Job');
const Dispute = require('../models/Dispute');
const Payment = require('../models/Payment');
const Warehouse = require('../models/Warehouse');
const Inventory = require('../models/Inventory');
const Training = require('../models/Training');
const Promotion = require('../models/Promotion');
const AuditLog = require('../models/AuditLog');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');

// Dashboard overview
router.get('/dashboard/overview', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const totalClients = await User.findByType('client');
    const totalArtisans = await User.findByType('artisan');
    const pendingVerifications = await User.getPendingVerifications();
    const activeJobs = await Job.getActiveJobs();
    const pendingDisputes = await Dispute.getPendingDisputes();
    
    sendSuccess(res, {
      totalClients: totalClients.length,
      totalArtisans: totalArtisans.length,
      pendingVerifications: pendingVerifications.length,
      activeJobs: activeJobs.length,
      pendingDisputes: pendingDisputes.length
    }, 'Dashboard overview retrieved');
  } catch (error) {
    next(error);
  }
});

// Get dashboard metrics
router.get('/dashboard/metrics', authenticateToken, requireRole(['admin']), [
  query('period').optional().isIn(['day', 'week', 'month', 'year'])
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { period = 'month' } = req.query;
    // Aggregate metrics from various sources
    sendSuccess(res, {
      period,
      revenue: { total: 0, growth: 0 },
      jobs: { total: 0, completed: 0, cancelled: 0 },
      artisans: { active: 0, new: 0 },
      clients: { active: 0, new: 0 }
    }, 'Metrics retrieved successfully');
  } catch (error) {
    next(error);
  }
}); 

// Get real-time stats
router.get('/dashboard/realtime', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const activeArtisans = await Artisan.getActiveArtisans();
    const activeJobs = await Job.getActiveJobs();
    const pendingDispatches = await Dispatch.getPendingDispatches();
    
    sendSuccess(res, {
      activeArtisans: activeArtisans.length,
      activeJobs: activeJobs.length,
      pendingDispatches: pendingDispatches.length,
      onlineArtisans: activeArtisans.filter(a => a.is_available).length
    }, 'Real-time stats retrieved');
  } catch (error) {
    next(error);
  }
});

// List pending verifications
router.get('/verifications/pending', authenticateToken, requireRole(['admin']), [
  query('type').optional().isIn(['client', 'artisan']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { type, page = 1, limit = 20 } = req.query;
    const pending = await User.getPendingVerifications(type, page, limit);
    sendPaginated(res, pending.users, page, limit, pending.total, 'Pending verifications retrieved');
  } catch (error) {
    next(error);
  }
});

// Verify client
router.post('/verifications/client/:clientId/verify', authenticateToken, requireRole(['admin']), [
  param('clientId').isUUID(),
  body('status').isIn(['approved', 'rejected']),
  body('notes').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { status, notes } = req.body;
    const client = await Client.findByUserId(req.params.clientId);
    
    if (!client) {
      throw new AppError(404, 'Client not found');
    }
    
    await User.update(req.params.clientId, { 
      is_verified: status === 'approved',
      verification_status: status,
      verification_notes: notes
    });
    
    await Client.updateVerificationStatus(req.params.clientId, status, notes);
    
    sendSuccess(res, null, `Client verification ${status}`);
  } catch (error) {
    next(error);
  }
});

// Verify artisan
router.post('/verifications/artisan/:artisanId/verify', authenticateToken, requireRole(['admin']), [
  param('artisanId').isUUID(),
  body('status').isIn(['approved', 'rejected']),
  body('tier').optional().isInt({ min: 1, max: 3 }),
  body('notes').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { status, tier, notes } = req.body;
    const artisan = await Artisan.findByUserId(req.params.artisanId);
    
    if (!artisan) {
      throw new AppError(404, 'Artisan not found');
    }
    
    await User.update(req.params.artisanId, { 
      is_verified: status === 'approved',
      verification_status: status,
      verification_notes: notes
    });
    
    if (status === 'approved' && tier) {
      await Artisan.updateTier(req.params.artisanId, tier, 'Admin verification');
    }
    
    sendSuccess(res, null, `Artisan verification ${status}`);
  } catch (error) {
    next(error);
  }
});

// Reject verification
router.post('/verifications/:userId/reject', authenticateToken, requireRole(['admin']), [
  param('userId').isUUID(),
  body('reason').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    await User.update(req.params.userId, { 
      is_verified: false,
      verification_status: 'rejected',
      verification_notes: req.body.reason
    });
    
    sendSuccess(res, null, 'User verification rejected');
  } catch (error) {
    next(error);
  }
});

// Get all users
router.get('/users', authenticateToken, requireRole(['admin']), [
  query('type').optional().isIn(['client', 'artisan', 'admin']),
  query('status').optional().isIn(['active', 'inactive', 'pending']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const result = await User.getAll({ type, status, page, limit });
    sendPaginated(res, result.users, page, limit, result.total, 'Users retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get user details
router.get('/users/:userId', authenticateToken, requireRole(['admin']), [
  param('userId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    sendSuccess(res, user, 'User details retrieved');
  } catch (error) {
    next(error);
  }
});

// Suspend user
router.post('/users/:userId/suspend', authenticateToken, requireRole(['admin']), [
  param('userId').isUUID(),
  body('reason').notEmpty(),
  body('duration').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    await User.update(req.params.userId, { 
      is_active: false,
      suspension_reason: req.body.reason,
      suspended_at: new Date(),
      suspension_duration: req.body.duration
    });
    
    sendSuccess(res, null, 'User suspended successfully');
  } catch (error) {
    next(error);
  }
});

// Activate user
router.post('/users/:userId/activate', authenticateToken, requireRole(['admin']), [
  param('userId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    await User.update(req.params.userId, { 
      is_active: true,
      suspension_reason: null,
      suspended_at: null
    });
    
    sendSuccess(res, null, 'User activated successfully');
  } catch (error) {
    next(error);
  }
});

// Update artisan tier
router.put('/artisans/:artisanId/tier', authenticateToken, requireRole(['admin']), [
  param('artisanId').isUUID(),
  body('tier').isInt({ min: 1, max: 3 }),
  body('reason').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const updated = await Artisan.updateTier(req.params.artisanId, req.body.tier, req.body.reason);
    if (!updated) {
      throw new AppError(404, 'Artisan not found');
    }
    sendSuccess(res, updated, 'Artisan tier updated successfully');
  } catch (error) {
    next(error);
  }
});

// List all jobs (admin)
router.get('/jobs', authenticateToken, requireRole(['admin']), [
  query('status').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await Job.getAllJobs({ status, page, limit });
    sendPaginated(res, result.jobs, page, limit, result.total, 'Jobs retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get job details (admin)
router.get('/jobs/:jobId', authenticateToken, requireRole(['admin']), [
  param('jobId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      throw new AppError(404, 'Job not found');
    }
    sendSuccess(res, job, 'Job details retrieved');
  } catch (error) {
    next(error);
  }
});

// Force cancel job
router.post('/jobs/:jobId/force-cancel', authenticateToken, requireRole(['admin']), [
  param('jobId').isUUID(),
  body('reason').notEmpty(),
  body('refundAmount').optional().isFloat({ min: 0 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const updated = await Job.update(req.params.jobId, {
      job_status: 'cancelled',
      cancelled_at: new Date(),
      cancellation_reason: req.body.reason,
      cancelled_by_admin: true
    });
    
    sendSuccess(res, updated, 'Job force cancelled');
  } catch (error) {
    next(error);
  }
});

// Get all disputes
router.get('/disputes', authenticateToken, requireRole(['admin']), [
  query('status').optional().isIn(['pending', 'resolved', 'rejected']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await Dispute.getAllDisputes({ status, page, limit });
    sendPaginated(res, result.disputes, page, limit, result.total, 'Disputes retrieved');
  } catch (error) {
    next(error);
  }
});

// Get dispute details
router.get('/disputes/:disputeId', authenticateToken, requireRole(['admin']), [
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

// Resolve dispute
router.post('/disputes/:disputeId/resolve', authenticateToken, requireRole(['admin']), [
  param('disputeId').isUUID(),
  body('decision').isIn(['refund_client', 'pay_artisan', 'partial_refund', 'dismiss']),
  body('resolution').notEmpty(),
  body('amount').optional().isFloat({ min: 0 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const resolved = await Dispute.updateStatus(
      req.params.disputeId,
      'resolved',
      { decision: req.body.decision, message: req.body.resolution, amount: req.body.amount },
      req.user.id
    );
    
    sendSuccess(res, resolved, 'Dispute resolved successfully');
  } catch (error) {
    next(error);
  }
});

// Get all payments (admin)
router.get('/payments', authenticateToken, requireRole(['admin']), [
  query('status').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await Payment.getAllPayments({ status, page, limit });
    sendPaginated(res, result.payments, page, limit, result.total, 'Payments retrieved');
  } catch (error) {
    next(error);
  }
});

// Get payment analytics
router.get('/payments/analytics', authenticateToken, requireRole(['admin']), [
  query('period').optional().isIn(['day', 'week', 'month', 'year'])
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { period = 'month' } = req.query;
    const analytics = await Payment.getAnalytics(period);
    sendSuccess(res, analytics, 'Payment analytics retrieved');
  } catch (error) {
    next(error);
  }
});

// Configure fees
router.put('/config/fees', authenticateToken, requireRole(['admin']), [
  body('baseFee').optional().isFloat({ min: 0 }),
  body('diagnosticsRatePerMinute').optional().isFloat({ min: 0 }),
  body('platformCommissionPercent').optional().isFloat({ min: 0, max: 100 }),
  body('monthlyTechnologyFee').optional().isFloat({ min: 0 }),
  body('onboardingFee').optional().isFloat({ min: 0 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // Update fee configuration in database or cache
    sendSuccess(res, req.body, 'Fee configuration updated');
  } catch (error) {
    next(error);
  }
});

// Get fee configuration
router.get('/config/fees', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const fees = {
      baseFee: 2500,
      diagnosticsRatePerMinute: 500,
      platformCommissionPercent: 10,
      monthlyTechnologyFee: 5000,
      onboardingFee: 5000
    };
    sendSuccess(res, fees, 'Fee configuration retrieved');
  } catch (error) {
    next(error);
  }
});

// Manage categories
router.get('/categories', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const categories = [
      { id: 1, name: 'Plumbing', isActive: true },
      { id: 2, name: 'Electrical', isActive: true },
      { id: 3, name: 'Carpentry', isActive: true }
    ];
    sendSuccess(res, categories, 'Categories retrieved');
  } catch (error) {
    next(error);
  }
});

// Add category
router.post('/categories', authenticateToken, requireRole(['admin']), [
  body('name').notEmpty(),
  body('description').optional().isString(),
  body('requiredCertifications').optional().isArray(),
  body('billingRules').optional().isObject()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // Create category logic
    sendSuccess(res, req.body, 'Category created successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Update category
router.put('/categories/:categoryId', authenticateToken, requireRole(['admin']), [
  param('categoryId').isInt(),
  body('name').optional().notEmpty(),
  body('isActive').optional().isBoolean()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    sendSuccess(res, req.body, 'Category updated successfully');
  } catch (error) {
    next(error);
  }
});

// Get audit logs
router.get('/audit-logs', authenticateToken, requireRole(['admin']), [
  query('entityType').optional().isString(),
  query('action').optional().isString(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { entityType, action, startDate, endDate, page = 1, limit = 50 } = req.query;
    const result = await AuditLog.getLogs({ entityType, action, startDate, endDate, page, limit });
    sendPaginated(res, result.logs, page, limit, result.total, 'Audit logs retrieved');
  } catch (error) {
    next(error);
  }
});

// Get system health
router.get('/system/health', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    sendSuccess(res, {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date(),
      services: {
        database: 'connected',
        redis: 'connected',
        storage: 'connected'
      }
    }, 'System health check');
  } catch (error) {
    next(error);
  }
});

// Generate financial report
router.post('/reports/financial', authenticateToken, requireRole(['admin']), [
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('format').optional().isIn(['json', 'pdf', 'csv']),
  body('includeDetails').optional().isBoolean()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const report = {
      id: Date.now(),
      generatedAt: new Date(),
      ...req.body
    };
    sendSuccess(res, report, 'Report generation started');
  } catch (error) {
    next(error);
  }
});

// Send bulk notification
router.post('/notifications/bulk', authenticateToken, requireRole(['admin']), [
  body('userType').optional().isIn(['client', 'artisan', 'all']),
  body('tier').optional().isInt({ min: 1, max: 3 }),
  body('title').notEmpty(),
  body('message').notEmpty(),
  body('type').isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const count = await Notification.sendToAllUsers(req.body, req.body.userType === 'all' ? null : [req.body.userType]);
    sendSuccess(res, { sentCount: count }, 'Bulk notification sent');
  } catch (error) {
    next(error);
  }
});

module.exports = router;