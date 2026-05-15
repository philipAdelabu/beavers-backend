const PaymentService = require('../services/payment.service');
const EscrowService = require('../services/escrow.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');
const { logger } = require('../config/logger');

class PaymentController {
  /**
   * Initialize payment for a job
   * @route POST /api/v1/payments/initialize/:jobId
   */
  static async initializePayment(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { jobId } = req.params;
      const clientId = req.user.id;
      const email = req.user.email;
      logger.info(`Initializing payment for job ${jobId} by client ${clientId}`);
      const result = await PaymentService.initializePayment(jobId, clientId, email);
      sendSuccess(res, result, 'Payment initialized successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to initialize payment', error.statusCode || 500);
      next(error);
    }
  }
  
  /**
   * Verify payment after callback
   * @route GET /api/v1/payments/verify
   */
  static async verifyPayment(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { reference } = req.query;
      const clientId = req.user.id;
      
      const result = await PaymentService.verifyPayment(reference, clientId);
      sendSuccess(res, result, 'Payment verified successfully');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get transaction history
   * @route GET /api/v1/payments/history
   */
  static async getTransactionHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await PaymentService.getTransactionHistory(
        req.user.id, 
        req.user.user_type, 
        { page: parseInt(page), limit: parseInt(limit) }
      );
      sendPaginated(res, result.transactions, page, limit, result.total, 'Transaction history retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get payment summary
   * @route GET /api/v1/payments/summary
   */
  static async getPaymentSummary(req, res, next) {
    try {
      const summary = await PaymentService.getPaymentSummary(req.user.id, req.user.user_type);
      sendSuccess(res, summary, 'Payment summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Create refund
   * @route POST /api/v1/payments/refund/:jobId
   */
  static async createRefund(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { jobId } = req.params;
      const { amount, reason } = req.body;
      const refund = await PaymentService.createRefund(jobId, req.user.id, amount, reason);
      sendSuccess(res, refund, 'Refund initiated successfully');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Release escrow funds to artisan (Admin only)
   * @route POST /api/v1/payments/release-funds/:jobId
   */
  static async releaseEscrowFunds(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { jobId } = req.params;
      const result = await PaymentService.releaseFundsToArtisan(jobId, req.user.id);
      sendSuccess(res, result, 'Escrow funds released successfully');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get escrow balance for job
   * @route GET /api/v1/payments/escrow/balance
   */
  static async getEscrowBalance(req, res, next) {
    try {
      const balance = await EscrowService.getBalance(req.query.jobId);
      sendSuccess(res, balance, 'Escrow balance retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get transaction details
   * @route GET /api/v1/payments/transaction/:transactionId
   */
  static async getTransactionDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { transactionId } = req.params;
      // Implement transaction details retrieval
      sendSuccess(res, { transactionId }, 'Transaction details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Download payment receipt
   * @route GET /api/v1/payments/receipt/:paymentId/download
   */
  static async downloadReceipt(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { paymentId } = req.params;
      // Implement receipt generation
      sendSuccess(res, { paymentId }, 'Receipt downloaded successfully');
    } catch (error) {
      next(error);
    }
  }

   
  static async confirmPayment(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await PaymentService.confirmPayment(req.params.paymentIntentId, req.user.id);
      sendSuccess(res, result, 'Payment status retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async getPaymentMethods(req, res, next) {
    try {
      const methods = await PaymentService.getPaymentMethods(req.user.id);
      sendSuccess(res, methods, 'Payment methods retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async addPaymentMethod(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const method = await PaymentService.addPaymentMethod(req.user.id, req.body.paymentMethodId, req.body.setAsDefault);
      sendSuccess(res, method, 'Payment method added successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async deletePaymentMethod(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      await PaymentService.deletePaymentMethod(req.params.methodId, req.user.id);
      sendSuccess(res, null, 'Payment method deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  static async setDefaultPaymentMethod(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const method = await PaymentService.setDefaultPaymentMethod(req.params.methodId, req.user.id);
      sendSuccess(res, method, 'Default payment method updated');
    } catch (error) {
      next(error);
    }
  }


  static async getPaymentHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await PaymentService.getTransactionHistory(req.user.id, req.user.user_type, { page, limit });
      sendPaginated(res, result.transactions, page, limit, result.total, 'Payment history retrieved successfully');
    } catch (error) {
      next(error);
    }
  }




  static async webhook(req, res, next) {
    try {
      await PaymentService.processWebhook(req.body);
      sendSuccess(res, null, 'Webhook processed successfully');
    } catch (error) {
      next(error);
    }
  }

}

module.exports = PaymentController;
