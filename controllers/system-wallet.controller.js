const SystemWalletService = require('../services/system-wallet.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class SystemWalletController {
  // ==================== Wallet Management ====================
  
  /**
   * Get all system wallets
   * @route GET /api/v1/admin/wallets
   */
  static async getAllWallets(req, res, next) {
    try {
      const wallets = await SystemWalletService.getAllWallets();
      sendSuccess(res, wallets, 'System wallets retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get wallet by type
   * @route GET /api/v1/admin/wallets/:walletType
   */
  static async getWalletByType(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { walletType } = req.params;
      const wallet = await SystemWalletService.getWalletByType(walletType);
      sendSuccess(res, wallet, 'Wallet retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get wallet balance
   * @route GET /api/v1/admin/wallets/:walletType/balance
   */
  static async getWalletBalance(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { walletType } = req.params;
      const balance = await SystemWalletService.getWalletBalance(walletType);
      sendSuccess(res, balance, 'Wallet balance retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get total system balance
   * @route GET /api/v1/admin/wallets/total-balance
   */
  static async getTotalSystemBalance(req, res, next) {
    try {
      const balance = await SystemWalletService.getTotalSystemBalance();
      sendSuccess(res, balance, 'Total system balance retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Transactions ====================
  
  /**
   * Credit wallet (Admin)
   * @route POST /api/v1/admin/wallets/:walletType/credit
   */
  static async creditWallet(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { walletType } = req.params;
      const { amount, transactionType, description } = req.body;
      
      const transaction = await SystemWalletService.creditWallet(
        walletType,
        amount,
        transactionType,
        { description, sourceType: 'admin', sourceId: req.user.id }
      );
      
      sendSuccess(res, transaction, 'Wallet credited successfully');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Debit wallet (Admin)
   * @route POST /api/v1/admin/wallets/:walletType/debit
   */
  static async debitWallet(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { walletType } = req.params;
      const { amount, transactionType, description } = req.body;
      
      const transaction = await SystemWalletService.debitWallet(
        walletType,
        amount,
        transactionType,
        { description, destinationType: 'admin', destinationId: req.user.id }
      );
      
      sendSuccess(res, transaction, 'Wallet debited successfully');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Transfer between wallets
   * @route POST /api/v1/admin/wallets/transfer
   */
  static async transferBetweenWallets(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { fromWallet, toWallet, amount, reason } = req.body;
      
      const result = await SystemWalletService.transferBetweenWallets(
        fromWallet,
        toWallet,
        amount,
        reason,
        { initiatedBy: req.user.id }
      );
      
      sendSuccess(res, result, 'Transfer completed successfully');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Transaction History ====================
  
  /**
   * Get transaction history
   * @route GET /api/v1/admin/wallets/transactions
   */
  static async getTransactionHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { walletType, transactionType, page = 1, limit = 20, startDate, endDate } = req.query;
      
      const result = await SystemWalletService.getTransactionHistory({
        walletType,
        transactionType,
        page: parseInt(page),
        limit: parseInt(limit),
        startDate,
        endDate
      });
      
      sendPaginated(res, result.transactions, page, limit, result.total, 'Transactions retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get balance history
   * @route GET /api/v1/admin/wallets/:walletType/balance-history
   */
  static async getBalanceHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { walletType } = req.params;
      const { days = 30 } = req.query;
      
      const history = await SystemWalletService.getBalanceHistory(walletType, parseInt(days));
      sendSuccess(res, history, 'Balance history retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Settings ====================
  
  /**
   * Get settings
   * @route GET /api/v1/admin/wallets/settings
   */
  static async getSettings(req, res, next) {
    try {
      const settings = await SystemWalletService.getSettings();
      sendSuccess(res, settings, 'Settings retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Update settings
   * @route PUT /api/v1/admin/wallets/settings
   */
  static async updateSettings(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { key, value } = req.body;
      const settings = await SystemWalletService.updateSettings(key, value, req.user.id);
      sendSuccess(res, settings, 'Settings updated');
    } catch (error) {
      next(error);
    }
  }
  
  // ==================== Statistics & Reconciliation ====================
  
  /**
   * Get statistics
   * @route GET /api/v1/admin/wallets/statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const stats = await SystemWalletService.getStatistics();
      sendSuccess(res, stats, 'Statistics retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get daily summary
   * @route GET /api/v1/admin/wallets/daily-summary
   */
  static async getDailySummary(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { date } = req.query;
      const summary = await SystemWalletService.getDailySummary(date || new Date().toISOString().split('T')[0]);
      sendSuccess(res, summary, 'Daily summary retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Reconcile wallet
   * @route GET /api/v1/admin/wallets/:walletType/reconcile
   */
  static async reconcileWallet(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { walletType } = req.params;
      const result = await SystemWalletService.reconcileWallet(walletType);
      sendSuccess(res, result, 'Reconciliation completed');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SystemWalletController;