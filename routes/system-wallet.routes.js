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

router.get('/wallets/:walletType', [
  param('walletType').isIn(['main', 'commission', 'fees', 'escrow', 'operations'])
], SystemWalletController.getWalletByType);

router.get('/wallets/:walletType/balance', [
  param('walletType').isIn(['main', 'commission', 'fees', 'escrow', 'operations'])
], SystemWalletController.getWalletBalance);

// ==================== Transactions ====================
router.post('/wallets/:walletType/credit', [
  param('walletType').isIn(['main', 'commission', 'fees', 'escrow', 'operations']),
  body('amount').isFloat({ min: 0.01 }),
  body('transactionType').optional().isIn(['adjustment', 'bonus', 'operational_cost']),
  body('description').optional().isString()
], SystemWalletController.creditWallet);

router.post('/wallets/:walletType/debit', [
  param('walletType').isIn(['main', 'commission', 'fees', 'escrow', 'operations']),
  body('amount').isFloat({ min: 0.01 }),
  body('transactionType').isIn(['adjustment', 'penalty', 'operational_cost']),
  body('description').optional().isString()
], SystemWalletController.debitWallet);

router.post('/wallets/transfer', [
  body('fromWallet').isIn(['main', 'commission', 'fees', 'escrow', 'operations']),
  body('toWallet').isIn(['main', 'commission', 'fees', 'escrow', 'operations']),
  body('amount').isFloat({ min: 0.01 }),
  body('reason').notEmpty()
], SystemWalletController.transferBetweenWallets);

// ==================== Transaction History ====================
router.get('/transactions', [
  query('walletType').optional().isIn(['main', 'commission', 'fees', 'escrow', 'operations']),
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
  param('walletType').isIn(['main', 'commission', 'fees', 'escrow', 'operations']),
  query('days').optional().isInt({ min: 1, max: 365 })
], SystemWalletController.getBalanceHistory);

// ==================== Settings ====================
router.get('/settings', SystemWalletController.getSettings);
router.put('/settings', [
  body('key').notEmpty(),
  body('value').isObject()
], SystemWalletController.updateSettings);

// ==================== Statistics & Reconciliation ====================
router.get('/statistics', SystemWalletController.getStatistics);
router.get('/daily-summary', [
  query('date').optional().isISO8601()
], SystemWalletController.getDailySummary);

router.get('/wallets/:walletType/reconcile', [
  param('walletType').isIn(['main', 'commission', 'fees', 'escrow', 'operations'])
], SystemWalletController.reconcileWallet);

module.exports = router;