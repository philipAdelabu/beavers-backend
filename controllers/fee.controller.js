const FeeService = require('../services/fee.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class FeeController {
  // ==================== Onboarding Fee ====================
  
  /**
   * Pay onboarding fee 
   * @route POST /api/v1/fees/onboarding/pay
   */
  static async payOnboardingFee(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    try {
      const { amount, paymentMethodId } = req.body;
      const result = await FeeService.payOnboardingFee(req.user.id, amount, paymentMethodId);
      sendSuccess(res, result, 'Onboarding fee paid successfully');
    } catch (error) {
      sendError(res, error.message || 'Onboarding Fee payment failed.', error.statusCode || 500);
      next(error);
    }
  }

  static async getPaymentIntents(req, res, next){
         const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    try {
      const result = await FeeService.getPaymentIntents(req.user.id, req.query.status);
      sendSuccess(res, result, 'Payment intents retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Payment intents retrieve failed.', error.statusCode || 500);
      next(error);
    }
  }


  static async verifyPayment(req, res, next){
    const errors = validationResult(req);
    if(!errors.isEmpty()){
       return sendError(res, 'Validation error', 400, errors.array());
    }
    try {
      const { payment_intent_id } = req.params;  
      const result = await FeeService.confirmPayment(payment_intent_id, req.user.id);
      sendSuccess(res, result, 'Payment verified successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to verify payment', error.statusCode || 500);
      next(error);
    }
  }
  
  /**
   * Check onboarding fee status
   * @route GET /api/v1/fees/onboarding/status
   */

  static async getOnboardingFeeStatus(req, res, next) {
    try {
      const hasPaid = await FeeService.hasPaidOnboardingFee(req.user.id);
      const feeConfig = await FeeService.getFeeConfiguration();
      
      sendSuccess(res, {
        hasPaid,
        amount: feeConfig.onboarding.amount,
        currency: feeConfig.onboarding.currency,
        isRequired: !hasPaid
      }, 'Onboarding fee status retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve onboarding status', error.statusCode || 500);
      next(error);
    }
  } 
  
  // ==================== Monthly Fee ====================
  
  /**
   * Pay monthly fee
   * @route POST /api/v1/fees/monthly/pay
   */
  static async payMonthlyFee(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
     }
    
    try {
      const { amount, paymentMethodId } = req.body;
      const result = await FeeService.payMonthlyFee(req.user.id, amount, req.user.email, paymentMethodId);
      sendSuccess(res, result, 'Monthly fee paid successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to pay monthly fee', error.statusCode || 500);
      next(error);
    }
  }
  
  /**
   * Get subscription status
   * @route GET /api/v1/fees/subscription/status
   */
  static async getSubscriptionStatus(req, res, next) {
    try {
      const subscription = await FeeService.getArtisanSubscription(req.user.id);
      const isActive = await FeeService.hasActiveSubscription(req.user.id);
      const feeConfig = await FeeService.getFeeConfiguration();
      
      sendSuccess(res, {
        subscription,
        isActive,
        monthlyFeeAmount: feeConfig.monthly.amount,
        currency: feeConfig.monthly.currency
      }, 'Subscription status retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to get subscription status', error.statusCode || 500);
      next(error);
    }
  }
  
  /**
   * Cancel subscription
   * @route POST /api/v1/fees/subscription/cancel
   */
  static async cancelSubscription(req, res, next) {
    try {
      const result = await FeeService.cancelSubscription(req.user.id);
      sendSuccess(res, result, 'Subscription cancelled');
    } catch (error) {
      sendError(res, error.message || 'Fail to cancel subscription', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Payment History ====================
  
  /**
   * Get payment history
   * @route GET /api/v1/fees/payments
   */
  static async getPaymentHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { feeType, status, page = 1, limit = 20, startDate, endDate } = req.query;
      const result = await FeeService.getPaymentHistory(
        req.user.id,
        { feeType, status, page, limit, startDate, endDate }
      );
      sendPaginated(res, result.payments, page, limit, result.total, 'Payment history retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve payment history', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Admin Endpoints ====================
  
  /**
   * Get fee configuration (Admin)
   * @route GET /api/v1/admin/fees/config
   */
  static async getFeeConfiguration(req, res, next) {
    try {
      const config = await FeeService.getFeeConfiguration();
      sendSuccess(res, config, 'Fee configuration retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to get fee configuration', error.statusCode || 500);
      next(error);
    }
  }
  
  /**
   * Update fee configuration (Admin)
   * @route PUT /api/v1/admin/fees/config
   */
  static async updateFeeConfiguration(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { feeType, amount, gracePeriodDays } = req.body;
      const result = await FeeService.updateFeeConfiguration(feeType, amount, gracePeriodDays, req.user.id);
      sendSuccess(res, result, 'Fee configuration updated');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get expired subscriptions (Admin)
   * @route GET /api/v1/admin/fees/expired-subscriptions
   */
  static async getExpiredSubscriptions(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await FeeService.getExpiredSubscriptions(page, limit);
      sendPaginated(res, result.subscriptions, page, limit, result.total, 'Expired subscriptions retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get fee statistics (Admin)
   * @route GET /api/v1/admin/fees/statistics
   */
  static async getFeeStatistics(req, res, next) {
    try {
      const stats = await FeeService.getFeeStatistics();
      sendSuccess(res, stats, 'Fee statistics retrieved');
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Process auto-renewals manually (Admin)
   * @route POST /api/v1/admin/fees/process-renewals
   */
  static async processAutoRenewals(req, res, next) {
    try {
      const results = await FeeService.processAutoRenewals();
      sendSuccess(res, results, 'Auto-renewals processed');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = FeeController;