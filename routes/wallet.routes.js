const express = require('express');
const router = express.Router();
const { body, param, query} = require('express-validator');
const AdminController = require('../controllers/admin.controller');
const TrainingController = require('../controllers/training.controller');
const { authenticateToken, requireRole, requirePermissions } = require('../middleware/auth.middleware');
const { adminLimiter } = require('../middleware/rateLimit.middleware');
const NotificationController = require('../controllers/notification.controller');
const WalletController = require('../controllers/wallet.controller');
const PaymentController = require('../controllers/payment.controller');
const { paymentLimiter } = require('../middleware/rateLimit.middleware');
const WalletService = require('../services/wallet.service');


router.use(authenticateToken);

// Get enrollment details
router.post('/add-fund/users/:userId', [
  param('userId').isUUID(), 
  body('amount').notEmpty().isNumeric(),
], WalletController.fundWallet);

router.get('/balance/:userId',[
     param('userId').isUUID(), 
], WalletController.getBalance);

router.get('/:userId/history',[
     param('userId').isUUID(), 
], WalletController.getWalletHistory);

router.post('/pay/completed/jobs/:jobId',[
    param('jobId').isUUID(),
    body('amount').notEmpty().isNumeric(), 
], WalletController.payCompletedJob);

router.get('/withdrawal-history', WalletController.getWithdrawalHistory);

///// Paystack activities ////////

// Payment initialization and verification
router.post('/initialize/funding/', paymentLimiter, [
  body('amount').notEmpty().isNumeric(),
], WalletController.initializeFunding);

router.get('/funding/intents', WalletController.getFundingIntent);

router.get('/funding/intent/status/:paymentIntentId', [
  param('paymentIntentId').notEmpty().withMessage('Invalid payment intent ID'),
], WalletController.getFundingStatus);

router.get('/verify/funding/:paymentIntentId', [
  param('paymentIntentId').notEmpty().withMessage('Payment Intent Id is required')
], WalletController.verifyFunding);

router.get('/list/banks', WalletController.getBankList);

router.post('/verify/bank-account',[
  body('accountNumber').notEmpty(),
  body('bankCode').notEmpty(),
], WalletController.verifyBank);

router.post('/bank/transferrecipient',[
  body('accountNumber').notEmpty(),
  body('bankCode').notEmpty(),
  body('name').notEmpty(),
], WalletController.bankTransferrecipient);


router.post('/cashout-fund', [
     body('accountNumber').notEmpty(),
     body('bankCode').notEmpty(),
     body('bankName').notEmpty(),
     body('accountName').notEmpty(),
     body('amount').isDecimal().notEmpty(),
], WalletController.cashoutFund);

router.post('/reverse/pending/debit', [
  body('amount').notEmpty().isDecimal()
], WalletController.reversePendingDebit);

router.get('/cashout/pending/request', WalletController.getCashoutPendingRequest);

module.exports = router;