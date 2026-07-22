const express = require('express');
const router = express.Router();
const { body, param, query} = require('express-validator');
const AdminController = require('../controllers/admin.controller');
const TrainingController = require('../controllers/training.controller');
const { authenticateToken, requireRole, requirePermissions } = require('../middleware/auth.middleware');
const { adminLimiter } = require('../middleware/rateLimit.middleware');
const NotificationController = require('../controllers/notification.controller');


router.post('/auth/login', [ 
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
], AdminController.login);

// Forgot password - send reset link or OTP
router.post('/auth/forgot-password', [
  body('email').isEmail(),
], AdminController.forgotPassword);

router.post('/auth/create/basic_admin', [
  body('email').isEmail(),
  body('phone').matches(/^\+?[0-9]{10,15}$/),
  body('password').isLength({ min: 8 }),
  body('fullName').notEmpty(),
], AdminController.createBasicAdmin);

// Reset Password 
router.post('/auth/reset-password', [
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
], AdminController.resetPassword);



// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole(['admin']));
router.use(adminLimiter);


// ==================== Admin User Management ====================

router.get('/admin-roles', AdminController.getAdminRoles);

router.post('/auth/create/admin', [
  body('email').isEmail(),
  body('phone').matches(/^\+?[0-9]{10,15}$/),
  body('password').isLength({ min: 8 }),
  body('fullName').notEmpty(),
  body('roleId').isUUID(),
  body('department').optional().isString(),
], AdminController.createAdmin);


router.put('/admins/:adminId/role', [
  param('adminId').isUUID(),
  body('roleId').isUUID()
], AdminController.updateAdminRole);

router.post('/auth/logout', AdminController.logout);

router.post('/auth/refresh',[
  body('refreshToken').notEmpty(),
], AdminController.refreshToken);

// Change Password (protected route)
router.post('/auth/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
], AdminController.changePassword);

// ==================== Dashboard ====================

router.get('/dashboard/stats', AdminController.getDashboardStats);

router.get('/dashboard/metrics', [
  query('period').optional().isIn(['week', 'month', 'year'])
], AdminController.getDashboardMetrics);

router.get('/dashboard/realtime', AdminController.getRealtimeStats);


// ==================== User Management ====================

router.get('/users', [
  query('type').optional().isIn(['client', 'artisan', 'admin']),
  query('status').optional().isIn(['active', 'inactive', 'pending']),
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], AdminController.getAllUsers);


router.get('/users/:userId', [
  param('userId').isUUID()
], AdminController.getUserDetails);


router.put('/users/:userId/status', [
  param('userId').isUUID(),
  body('isActive').isBoolean(),
  body('reason').optional().isString()
], AdminController.updateUserStatus);


// Suspend user
router.post('/users/:userId/suspend', [
  param('userId').isUUID(),
  body('reason').notEmpty(),
  body('duration').optional().isString(),
], AdminController.suspendUser);

// Activate user
router.post('/users/:userId/activate', [
  param('userId').isUUID(),
], AdminController.activateUser);

router.get('/admins', AdminController.getAllAdmin);


// ==================== Verification Management ====================

router.get('/verifications/pending', [
  query('type').optional().isIn(['client', 'artisan']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
], AdminController.getPendingVerifications);

router.post('/verifications/:userId/verify', [
  param('userId').isUUID(),
  body('status').isIn(['approved', 'rejected']),
  body('notes').optional().isString(),
  body('tier').optional().isInt({ min: 1, max: 3 }),
], AdminController.verifyUser);

// ==================== Artisan Management ====================

// Update artisan tier
router.put('/artisans/:artisanId/tier', [
  param('artisanId').isUUID(),
  body('tier').isInt({ min: 1, max: 3 }),
  body('reason').optional().isString()
], AdminController.updateArtisanTier);

router.get('/artisans/:artisanId/performance', [
  param('artisanId').isUUID()
], AdminController.getArtisanPerformance);

// ==================== Job Management ====================
router.get('/jobs', [
  query('status').optional().isString(),
  query('category').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], AdminController.getAllJobs);

router.get('/jobs/:jobId', [
  param('jobId').isUUID()
], AdminController.getJobDetails);

router.post('/jobs/:jobId/force-cancel', [
  param('jobId').isUUID(),
  body('reason').notEmpty(),
  body('refundAmount').optional().isFloat({ min: 0 })
], AdminController.forceCancelJob);

// ==================== Dispute Management ====================
router.get('/disputes/all', [
  query('status').optional().isIn(['pending', 'resolved', 'rejected']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], AdminController.getAllDisputes);

router.get('/disputes/:disputeId', [
  param('disputeId').isUUID()
], AdminController.getDisputeDetails);

router.post('/disputes/:disputeId/resolve', [
  param('disputeId').isUUID(),
  body('decision').isIn(['refund_client', 'pay_artisan', 'partial_refund', 'dismiss']),
  body('message').notEmpty(),
  body('amount').optional().isFloat({ min: 0 })
], AdminController.resolveDispute);

// ==================== Category Management ==================== 

router.get('/categories', AdminController.getCategories);

router.post('/categories', [
  body('name').notEmpty(),
  body('description').optional().isString(),
  body('requiredCertifications').optional().isArray(),
  body('billingRules').optional().isObject(),
  body('icon').optional().isString(),
  body('displayOrder').optional().isInt({ min: 0 })
], AdminController.createCategory); 

router.put('/categories/:categoryId', [
  param('categoryId').isUUID(),
  body('name').optional().notEmpty(),
  body('is_active').optional().isBoolean()
], AdminController.updateCategory);

router.delete('/categories/:categoryId', [
  param('categoryId').isUUID()
], AdminController.deleteCategory);


// ==================== Subcategory Management ====================
router.get('/subcategories', [
  query('categoryId').optional().isUUID()
], AdminController.getSubcategories);


router.post('/subcategories', [
  body('category_id').isUUID(),
  body('name').notEmpty(),
  body('description').optional().isString(),
  body('icon').optional().isString(),
  body('required_certifications').optional().isArray(),
  body('display_order').optional().isInt({ min: 0 })
], AdminController.createSubcategory);

router.put('/subcategories/:subcategoryId', [
  param('subcategoryId').isUUID(),
  body('name').optional().notEmpty(),
  body('isActive').optional().isBoolean()
], AdminController.updateSubcategory);

router.delete('/subcategories/:subcategoryId', [
  param('subcategoryId').isUUID()
], AdminController.deleteSubcategory);


// ==================== System Configuration ====================

router.get('/configurations', AdminController.getSystemConfigurations);

router.put('/configurations', [
  body('key').notEmpty(),
  body('value').isObject()
], AdminController.updateSystemConfiguration);


// get configure fees 
router.get('/config/fees', AdminController.getFeeConfiguration);


// ==================== Activity Logs ====================

router.get('/activity-logs', [
  query('adminId').optional().isUUID(),
  query('action').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601() 
], AdminController.getActivityLogs);

router.get('/audit-logs',[
  query('userId').optional().isUUID(),
  query('entityType').optional().isString(),
  query('action').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601() 
], AdminController.getAuditLogs);

// ==================== Reports ====================
router.post('/reports/generate', [
  body('type').isIn(['financial', 'users', 'jobs', 'artisans']),
  body('startDate').isISO8601(),
  body('endDate').isISO8601(),
  body('format').optional().isIn(['json', 'csv', 'pdf'])
], AdminController.generateReport);

// ==================== Bulk Notifications ====================

router.post('/notifications/bulk', [
  body('userType').optional().isIn(['client', 'artisan', 'all']),
  body('title').notEmpty(),
  body('message').notEmpty(),
  body('data').optional().isObject()
], AdminController.sendBulkNotification);



 // ==================== Payment Management ====================

 router.get('/payments', authenticateToken, requireRole(['admin']), [
   query('status').optional().isString(),
   query('page').optional().isInt({ min: 1 }),
   query('limit').optional().isInt({ min: 1, max: 100 }),
 ], AdminController.getAllPayments);

  // Get payment analytics
  router.get('/payments/analytics', authenticateToken, requireRole(['admin']), [
      query('period').optional().isIn(['day', 'week', 'month', 'year']),
  ], AdminController.getPaymentAnalytics);

 
router.get('/payments/clients', [
  query('status').optional().isIn(['pending', 'succeeded', 'failed', 'refunded']),
  query('clientId').optional().isUUID(),
  query('artisanId').optional().isUUID(),
  query('jobId').optional().isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], AdminController.getAllPayments);

router.get('/payments/:paymentId', [
  param('paymentId').isUUID()
], AdminController.getPaymentDetails);

router.post('/refunds/:refundId/process', [
  param('refundId').isUUID(),
  body('notes').optional().isString()
], AdminController.processRefund);

router.get('/refunds', [
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
  query('jobId').optional().isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], AdminController.getAllRefunds);

// ==================== BOQ Management ====================
router.get('/boqs', [
  query('status').optional().isIn(['draft', 
    'pending_client_approval', 
    'pending_admin_approval', 
    'approved', 'rejected_by_client', 
    'rejected_by_admin']),
  query('jobId').optional().isUUID(),
  query('artisanId').optional().isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], AdminController.getAllBOQs);

router.get('/boqs/:boqId', [
  param('boqId').isUUID()
], AdminController.getBOQDetails);

router.post('/boqs/:boqId/approve', [
  param('boqId').isUUID(),
  body('notes').optional().isString()
], AdminController.adminApproveBOQ);

router.post('/boqs/:boqId/reject', [
  param('boqId').isUUID(),
  body('reason').notEmpty()
], AdminController.adminRejectBOQ);

// ==================== Settlement Management ====================
router.get('/settlements', [
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
  query('artisanId').optional().isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], AdminController.getAllSettlements);

router.get('/settlements/:payoutId/detail', [
  param('payoutId').isUUID()
], AdminController.settlementDetail);

router.post('/settlements/:payoutId/payout', [
  param('payoutId').isUUID(),
  body('transferReference').optional().isString()
], AdminController.processSettlementByPayoutId);

router.post('/settlements/:artisanId/artisan', [
  param('artisanId').isUUID(),
  body('transactionId').optional().isString()
], AdminController.processSettlementByArtisanId);

router.post('/settlements/:jobId/job', [
  param('jobId').isUUID(),
  body('transactionId').optional().isString()
], AdminController.processSettlementByJobId);

router.post('/settlements/:payoutId/fail', [
  param('payoutId').isUUID(),
  body('reason').notEmpty(),
], AdminController.failSettlement);

// ==================== Withdrawal Management ====================
router.get('/withdrawals', [
  query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
  query('artisanId').optional().isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], AdminController.getAllWithdrawals);

router.post('/withdrawals/:withdrawalId/process', [
  param('withdrawalId').isUUID(),
  body('action').isIn(['approve', 'reject']),
  body('notes').optional().isString()
], AdminController.processWithdrawal);

// ==================== Escrow Management ====================
router.get('/escrow/transactions', [
  query('status').optional().isIn(['held', 'release', 'frozen', 'released', 'refunded']),
  query('jobId').optional().isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], AdminController.getAllEscrowTransactions);

router.post('/escrow/transactions/:transactionId/release_frozen', [
  param('transactionId').isUUID(),
  body('reason').notEmpty()
], AdminController.releaseFrozenEscrow);

router.post('/escrow/transactions/:transactionId/freeze', [
  param('transactionId').isUUID(),
  body('reason').notEmpty()
], AdminController.freezeFunds);

router.post('/escrow/transactions/jobs/:jobId/freeze', [
  param('jobId').isUUID(),
  body('reason').notEmpty()
], AdminController.freezeJobFunds);

router.post('/escrow/transactions/:transactionId/release_funds', [
  param('transactionId').isUUID(),
  body('reason').notEmpty()
], AdminController.releaseFundEscrow);

router.post('/escrow/transactions/:jobId/release', [
  param('jobId').isUUID(),
  body('reason').notEmpty()
], AdminController.releaseJobFunds);


router.get('/escrow/transactions/:jobId/balance', [
  param('jobId').isUUID(),
], AdminController.getJobEscrowBalance);

router.get('/escrow/summary', AdminController.getEscrowSummary);
router.get('/escrow/pending/disbursements', AdminController.getPendingDisbursements);

// get a particular artisan pending disbursements
router.get('/escrow/pending/:artisanId/disbursements', 
   [ param('artisanId').isUUID(),],
   AdminController.getPendingArtisanDisbursements);


// { jobId, clientId, artisanId, status, transactionType, page = 1, limit = 20 } = filters;

router.get('/escrow/transactions/history', [
  query('status').optional().isIn(['held', 'frozen', 'released', 'refund', 'release', 'refunded']),
  query('transactionType').optional().isIn(['base_fee',
    'diagnostics_fee', 'platform_fee', 'materials', 'workmanship ', 'full_payment', 'execution_fee']),
  query('jobId').optional().isUUID(),
  query('clientId').optional().isUUID(),
  query('artisanId').optional().isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], AdminController.getTransactionHistory);
 
// process pending disbursement for a particular job
router.post('/escrow/process/job/:jobId/pending/disbursement', [
  param('jobId').isUUID(),
], AdminController.processJobPendingDisbursement);


// process all pending disbursement for a particular artisan
router.post('/escrow/process/artisan/:artisanId/pending/disbursement', [
  param('artisanId').isUUID(),
], AdminController.processJobPendingDisbursementByArtisanId);

// process  disbursement for a particular escrow transaction
router.post('/escrow/process/transaction/:escrowId/pending/disbursement', [
  param('escrowId').isUUID(),
], AdminController.processJobPendingDisbursementByEscrowId);


// process all pending disbursement for all jobs
router.post('/escrow/transactions/process/pending/disbursement',
   AdminController.processAllJobPendingDisbursement);



// Initiate escrow Refund 
router.post('/escrow/transactions/:escrowTransactionId/initiate_refund', [
  param('escrowTransactionId').isUUID(),
  body('reason').notEmpty()
], AdminController.initiateFunds);

// Complete Refund 
/*
router.post('/escrow/transactions/:escrowTransactionId/complete_refund', [
    param('escrowTransactionId').isUUID(),
], AdminController.completeRefunds);

*/

/* Send a notification (for testing or manual triggers)
 * @route POST /api/v1/notifications/send
 */
router.post('/send', authenticateToken, [
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
  body('data').optional().isObject(),
  body('options').optional().isObject()
], NotificationController.sendNotification);


// ==================== Admin Routes ====================



// Create course
router.post('/training/courses', [
  body('name').notEmpty().withMessage('Course name is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('tierLevel').isInt({ min: 1, max: 3 }),
  body('durationHours').isInt({ min: 1 }),
  body('modules').isArray({ min: 1 }),
  body('modules.*.name').notEmpty(),
  body('price').optional().isFloat({ min: 0 }),
  body('certificationProvided').optional().isBoolean()
], TrainingController.createCourse);

// Update course
router.put('/training/courses/:courseId', [
  param('courseId').isUUID(),
  body('name').optional().notEmpty().withMessage('Course name is required'),
  body('description').optional().notEmpty().withMessage('Description is required'),
  body('tierLevel').optional().isInt({ min: 1, max: 3 }),
  body('durationHours').optional().isInt({ min: 1 }),
  body('modules').optional().isArray({ min: 1 }),
  body('modules.*.name').optional().notEmpty(),
  body('price').optional().optional().isFloat({ min: 0 }),
  body('certificationProvided').optional().isBoolean(),
], TrainingController.updateCourse);

// Delete course

router.delete('/training/courses/:courseId', [
  param('courseId').isUUID()
], TrainingController.deleteCourse);


// Get tier requirements
router.get('/training/tier/requirements', TrainingController.getTierRequirements);

// Update tier requirements
router.put('/training/tier/:tierLevel/requirements', [
  param('tierLevel').isInt({ min: 1, max: 3 }),
  body('minJobsCompleted').optional().isInt({ min: 0 }),
  body('minRating').optional().isFloat({ min: 0, max: 5 }),
  body('minCompletionRate').optional().isFloat({ min: 0, max: 100 }),
  body('requiredCourses').optional().isInt({ min: 0 }),
  body('requiredCertifications').optional().isInt({ min: 0 }),
  body('minTrustScore').optional().isInt({ min: 0, max: 100 }),
  body('benefits').optional().isObject()
], TrainingController.updateTierRequirements);

// Get tier statistics
router.get('/training/tier/statistics', TrainingController.getTierStatistics);

// Get course statistics
router.get('/training/courses/statistics', TrainingController.getCourseStatistics);


module.exports = router;
