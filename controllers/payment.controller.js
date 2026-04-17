const PaymentService = require('../services/payment.service');
const EscrowService = require('../services/escrow.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class PaymentController {
  static async initializePayment(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await PaymentService.initializePayment(req.params.jobId, req.user.id, req.body.paymentMethodId);
      sendSuccess(res, result, 'Payment initialized successfully');
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

  static async createRefund(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const refund = await PaymentService.createRefund(req.params.jobId, req.user.id, req.body.amount, req.body.reason);
      sendSuccess(res, refund, 'Refund initiated successfully');
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

  static async getEscrowBalance(req, res, next) {
    try {
      const balance = await EscrowService.getBalance(req.params.jobId);
      sendSuccess(res, balance, 'Escrow balance retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async releaseEscrowFunds(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await PaymentService.releaseFundsToArtisan(req.params.jobId, req.user.id);
      sendSuccess(res, result, 'Escrow funds released successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getTransactionDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const transaction = await PaymentService.getTransactionDetails(req.params.transactionId, req.user.id);
      sendSuccess(res, transaction, 'Transaction details retrieved successfully');
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