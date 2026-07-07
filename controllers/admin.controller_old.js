const AdminService = require('../services/admin.service');
const UserService = require('../services/user.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class AdminController {
  static async getDashboardStats(req, res, next) {
    try {
      const stats = await AdminService.getDashboardStats();
      sendSuccess(res, stats, 'Dashboard statistics retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to retrieve dashboard statistics', error.statusCode || 500);
      next(error);
    }
  }

  static async getDashboardMetrics(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { period = 'month' } = req.query;
      const metrics = await AdminService.getDashboardMetrics(period);
      sendSuccess(res, metrics, 'Dashboard metrics retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to retrieve dashboard metrics', error.statusCode || 500);
      next(error);
    }
  }

  static async getRealtimeStats(req, res, next) {
    try {
      const stats = await AdminService.getRealtimeStats();
      sendSuccess(res, stats, 'Real-time statistics retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to retrieve dashboard statistics', error.statusCode || 500);
      next(error);
    }
  }

  static async getPendingVerifications(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { type, page = 1, limit = 20 } = req.query;
      const result = await AdminService.getPendingVerifications(type, page, limit);
      sendPaginated(res, result.users, page, limit, result.total, 'Pending verifications retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async verifyClient(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, notes } = req.body;
      const result = await AdminService.verifyUser(req.params.clientId, status, notes);
      sendSuccess(res, result, `Client verification ${status}`);
    } catch (error) {
      next(error);
    }
  }

  static async verifyArtisan(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, tier, notes } = req.body;
      const result = await AdminService.verifyUser(req.params.artisanId, status, notes, tier);
      sendSuccess(res, result, `Artisan verification ${status}`);
    } catch (error) {
      next(error);
    }
  }

  static async rejectVerification(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await AdminService.verifyUser(req.params.userId, 'rejected', req.body.reason);
      sendSuccess(res, result, 'Verification rejected');
    } catch (error) {
      next(error);
    }
  }

  static async getAllUsers(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { type, status, search, page = 1, limit = 20 } = req.query;
      const result = await AdminService.getAllUsers({ type, status, search, page, limit });
      sendPaginated(res, result.users, page, limit, result.total, 'Users retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getUserDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const user = await UserService.getUserById(req.params.userId);
      sendSuccess(res, user, 'User details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async suspendUser(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await AdminService.suspendUser(req.params.userId, req.body.reason, req.body.duration);
      sendSuccess(res, result, 'User suspended successfully');
    } catch (error) {
      next(error);
    }
  }

  static async activateUser(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await AdminService.activateUser(req.params.userId);
      sendSuccess(res, result, 'User activated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updateArtisanTier(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await AdminService.updateArtisanTier(req.params.artisanId, req.body.tier, req.body.reason);
      sendSuccess(res, result, 'Artisan tier updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getAllJobs(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, category, page = 1, limit = 20 } = req.query;
      const result = await AdminService.getAllJobs({ status, category, page, limit });
      sendPaginated(res, result.jobs, page, limit, result.total, 'Jobs retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async forceCancelJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await AdminService.forceCancelJob(req.params.jobId, req.body.reason, req.body.refundAmount);
      sendSuccess(res, result, 'Job force cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getAllDisputes(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, page = 1, limit = 20 } = req.query;
      const result = await AdminService.getAllDisputes({ status, page, limit });
      sendPaginated(res, result.disputes, page, limit, result.total, 'Disputes retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async resolveDispute(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await AdminService.resolveDispute(req.params.disputeId, req.body);
      sendSuccess(res, result, 'Dispute resolved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getCategories(req, res, next) {
    try {
      const categories = await AdminService.getCategories();
      sendSuccess(res, categories, 'Categories retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async createCategory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const category = await AdminService.createCategory(req.body);
      sendSuccess(res, category, 'Category created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateCategory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const category = await AdminService.updateCategory(req.params.categoryId, req.body);
      sendSuccess(res, category, 'Category updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getAuditLogs(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { entityType, action, userId, startDate, endDate, page = 1, limit = 50 } = req.query;
      const result = await AdminService.getAuditLogs({ entityType, action, userId, startDate, endDate, page, limit });
      sendPaginated(res, result.logs, page, limit, result.total, 'Audit logs retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getSystemHealth(req, res, next) {
    try {
      const health = await AdminService.getSystemHealth();
      sendSuccess(res, health, 'System health check completed');
    } catch (error) {
      next(error);
    }
  }

  static async generateReport(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { type, startDate, endDate, format = 'json' } = req.body;
      const report = await AdminService.generateReport(type, { startDate, endDate, format });
      
      if (format === 'pdf' || format === 'excel') {
        res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=report_${type}_${Date.now()}.${format}`);
        return res.send(report);
      }
      
      sendSuccess(res, report, 'Report generated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async sendBulkNotification(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { userType, tier, title, message, type } = req.body;
      const result = await AdminService.sendBulkNotification({ userType, tier, title, message, type });
      sendSuccess(res, result, 'Bulk notification sent successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updateFeeConfiguration(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const config = await AdminService.updateFeeConfiguration(req.user.id, req.body);
      sendSuccess(res, config, 'Fee configuration updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getFeeConfiguration(req, res, next) {
    try {
      const config = await AdminService.getFeeConfiguration();
      sendSuccess(res, config, 'Fee configuration retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AdminController;