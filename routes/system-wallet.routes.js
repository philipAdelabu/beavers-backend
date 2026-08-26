const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const SystemWalletController = require('../controllers/system-wallet.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const router = express.Router();


// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole(['admin'])); 

// ==================== Wallet Management ====================
router.get('/wallets', SystemWalletController.getAllWallets);
router.get('/wallets/total-balance', SystemWalletController.getTotalSystemBalance);

router.get('/wallets/view/:walletType', [
  param('walletType').isIn(['main', 'commission', 'fees', 'operations'])
], SystemWalletController.getWalletByType);

router.get('/wallets/:walletType/balance', [
  param('walletType').isIn(['main', 'commission', 'fees', 'operations'])
], SystemWalletController.getWalletBalance);

// ==================== Transactions ====================
router.post('/wallets/:walletType/credit', [
  param('walletType').isIn(['main', 'commission', 'fees', 'operations']),
  body('amount').isFloat({ min: 0.01 }),
  body('transactionType').optional().isIn(['adjustment', 'bonus', 'operational_cost']),
  body('description').optional().isString()
], SystemWalletController.creditWallet);

router.post('/wallets/:walletType/debit', [
  param('walletType').isIn(['main', 'commission', 'fees', 'operations']),
  body('amount').isFloat({ min: 0.01 }),
  body('transactionType').isIn(['adjustment', 'penalty', 'operational_cost']),
  body('description').optional().isString()
], SystemWalletController.debitWallet);

router.post('/wallets/transfer', [
  body('fromWallet').isIn(['main', 'commission', 'fees', 'operations']),
  body('toWallet').isIn(['main', 'commission', 'fees', 'operations']),
  body('amount').isFloat({ min: 0.01 }),
  body('reason').optional().isString(),
], SystemWalletController.transferBetweenWallets);

// ==================== Transaction History ====================
router.get('/wallet-transactions', [
  query('walletType').optional().isIn(['main', 'commission', 'fees', 'operations']),
  query('transactionType').optional().isIn([
    'onboarding_fee', 'monthly_fee', 'commission', 'transfer_in', 'transfer_out',
    'refund', 'adjustment', 'bonus', 'penalty', 'operational_cost'
  ]),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], SystemWalletController.getTransactionHistory);


router.get('/wallets/:walletType/balance-history', [
  param('walletType').isIn(['main', 'commission', 'fees', 'operations']),
  query('days').optional().isInt({ min: 1, max: 365 })
], SystemWalletController.getBalanceHistory);

// ==================== Settings ====================

router.get('/wallet-settings', SystemWalletController.getSettings);

router.put('/wallet-settings', [
  body('key').notEmpty(),
  body('value').isObject()
], SystemWalletController.updateSettings);

// ==================== Statistics & Reconciliation ====================
router.get('/wallets/statistics', SystemWalletController.getStatistics);

router.get('/wallets/daily/summary', [
  query('date').optional().isISO8601()
], SystemWalletController.getDailySummary);

router.get('/wallets/:walletType/reconcile', [
  param('walletType').isIn(['main', 'commission', 'fees', 'operations'])
], SystemWalletController.reconcileWallet);

    // User wallet management 

router.get('/wallets/users', SystemWalletController.getUserWallets);

router.get('/wallets/users/:userId', [
  param('userId').isUUID()
], SystemWalletController.getUserWalletById);

router.get('/wallets/transactions/users', SystemWalletController.getUserWalletsTransactions);

router.get('/wallets/transactions/users/:userId', [
  param('userId').isUUID()
], SystemWalletController.getUserWalletTransactionsById);

router.get('/wallets/users/withdrawal/requests', SystemWalletController.getPendingUserWithdrawalRequests);

router.get('/wallets/pending/:userId/withdrawal-requests',[ 
  param('userId').isUUID(),
  query('status').optional().isIn(['pending', 'completed']),
], 
  SystemWalletController.getPendingUserWithdrawalRequestById);

router.post('/wallets/:userId/debit/and/pending', [
    param('userId').isUUID(),
    body('amount').isDecimal().notEmpty(),
    body('reason').notEmpty()
], SystemWalletController.pendDebit);

router.post('/wallets/:userId/reverse/debit/pending', [
    param('userId').isUUID(),
    body('amount').isDecimal().notEmpty(),
    body('reason').notEmpty()
], SystemWalletController.reversePendingDebit);

module.exports = router;