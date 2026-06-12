const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const FeeController = require('../controllers/fee.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

// All fee routes require authentication
router.use(authenticateToken);

// ==================== Onboarding Fee ====================
router.post('/onboarding/pay', [
  body('paymentMethodId').optional().isString()
], FeeController.payOnboardingFee);

router.get('/onboarding/status', FeeController.getOnboardingFeeStatus);

// ==================== Monthly Fee ====================
router.post('/monthly/pay', [
  body('paymentMethodId').optional().isString()
], FeeController.payMonthlyFee);

router.get('/subscription/status', FeeController.getSubscriptionStatus);
router.post('/subscription/cancel', FeeController.cancelSubscription);

// ==================== Payment History ====================
router.get('/payments', [
  query('feeType').optional().isIn(['onboarding', 'monthly']),
  query('status').optional().isIn(['pending', 'completed', 'failed', 'refunded']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], FeeController.getPaymentHistory);

// ==================== Admin Routes ====================
router.get('/admin/fees/config', requireRole(['admin']), FeeController.getFeeConfiguration);
router.put('/admin/fees/config', requireRole(['admin']), [
  body('feeType').isIn(['onboarding', 'monthly']),
  body('amount').isFloat({ min: 0 }),
  body('gracePeriodDays').optional().isInt({ min: 0 })
], FeeController.updateFeeConfiguration);

router.get('/admin/fees/expired-subscriptions', requireRole(['admin']), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], FeeController.getExpiredSubscriptions);

router.get('/admin/fees/statistics', requireRole(['admin']), FeeController.getFeeStatistics);

router.post('/admin/fees/process-renewals', requireRole(['admin']), FeeController.processAutoRenewals);

module.exports = router;