const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const PaymentController = require('../controllers/payment.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const { paymentLimiter } = require('../middleware/rateLimit.middleware');

// All payment routes require authentication
router.use(authenticateToken);


router.get('/job/billing/:jobId', [
  param('jobId').isUUID().withMessage('Invalid job ID'),
], PaymentController.getJobBilling);

// Payment initialization and verification
router.post('/initialize/:jobId', paymentLimiter, [
  param('jobId').isUUID().withMessage('Invalid job ID'),
  body('amount').notEmpty().isNumeric(),
], PaymentController.initializePayment);

router.get('/payment/intent/pending', PaymentController.getPaymentIntent);

router.get('/payment/intent/:jobId', [
  param('jobId').isUUID().withMessage('Invalid job ID'),
], PaymentController.getPaymentIntent);

router.get('/status/:paymentIntentId', [
  param('paymentIntentId').notEmpty().withMessage('Invalid payment intent ID'),
], PaymentController.getPaymentStatus);

router.get('/verify/:paymentIntentId', [
  param('paymentIntentId').notEmpty().withMessage('Payment Intent Id is required')
], PaymentController.verifyPayment);

// Transaction history
router.get('/history', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], PaymentController.getTransactionHistory);

// Payment summary
router.get('/summary', PaymentController.getPaymentSummary);

// Refunds (Admin only)
router.post('/refund/:jobId', paymentLimiter, requireRole(['admin']), [
  param('jobId').isUUID(),
  body('amount').isFloat({ min: 0.01 }),
  body('reason').notEmpty()
], PaymentController.createRefund);

// Escrow (Admin only)
router.post('/release-funds/:jobId', requireRole(['admin']), [
  param('jobId').isUUID()
], PaymentController.releaseEscrowFunds);

router.get('/escrow/balance', [
  query('jobId').isUUID()
], PaymentController.getEscrowBalance);

// Receipt
router.get('/receipt/:paymentId/download', [
  param('paymentId').isUUID()
], PaymentController.downloadReceipt);

// Transaction details
router.get('/transaction/:transactionId', PaymentController.getTransactionDetails);



// Get payment methods
router.get('/payment-methods', authenticateToken, requireRole(['client']), 
   PaymentController.getPaymentMethods);


   
// Add payment method
router.post('/payment-methods', authenticateToken, requireRole(['client']), [
  body('type').isIn(['card', 'bank']),
  body('last4').optional().isLength({ min: 4, max: 4 }),
  body('expiryMonth').optional().isInt({ min: (Number(new Date().getMonth()) + 1), max: 12 }),
  body('expiryYear').optional().isInt({ min: new Date().getFullYear(), max: (Number(new Date().getFullYear()) + 15) }),
  body('isDefault').optional().isBoolean(),
], PaymentController.addPaymentMethod);

// Update default payment method
router.put('/payment-methods/:paymentMethodId', authenticateToken, requireRole(['client']), [
  param('paymentMethodId').isUUID(),
  body('isDefault').notEmpty().isBoolean(),
], PaymentController.setDefaultPaymentMethod);


// Delete payment method
router.delete('/payment-methods/:paymentMethodId', authenticateToken, requireRole(['client']), [
  param('paymentMethodId').isUUID()
], PaymentController.deletePaymentMethod);



module.exports = router;
