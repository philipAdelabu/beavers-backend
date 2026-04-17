const AnalyticsService = require('../services/analytics.service');
const { sendSuccess, sendError } = require('../utils/response');
const { validationResult } = require('express-validator');

class AnalyticsController {
  static async getPlatformAnalytics(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { period = 'month', startDate, endDate } = req.query;
      const analytics = await AnalyticsService.getPlatformMetrics(period, { startDate, endDate });
      sendSuccess(res, analytics, 'Platform analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getUserGrowth(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { days = 30 } = req.query;
      const growth = await AnalyticsService.getUserGrowth(parseInt(days));
      sendSuccess(res, growth, 'User growth analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getJobTrends(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { days = 30 } = req.query;
      const trends = await AnalyticsService.getJobTrends(parseInt(days));
      sendSuccess(res, trends, 'Job trends retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getCategoryAnalytics(req, res, next) {
    try {
      const analytics = await AnalyticsService.getCategoryAnalytics();
      sendSuccess(res, analytics, 'Category analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getArtisanPerformance(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { tier, minRating, limit = 20 } = req.query;
      const performance = await AnalyticsService.getArtisanPerformance({ tier, minRating, limit });
      sendSuccess(res, performance, 'Artisan performance analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getClientAnalytics(req, res, next) {
    try {
      const analytics = await AnalyticsService.getClientAnalytics(req.user.id);
      sendSuccess(res, analytics, 'Client analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getRevenueAnalytics(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { period = 'month' } = req.query;
      const analytics = await AnalyticsService.getRevenueAnalytics(period);
      sendSuccess(res, analytics, 'Revenue analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getGeographicAnalytics(req, res, next) {
    try {
      const analytics = await AnalyticsService.getGeographicDistribution();
      sendSuccess(res, analytics, 'Geographic analytics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getRealTimeMetrics(req, res, next) {
    try {
      const metrics = await AnalyticsService.getRealTimeMetrics();
      sendSuccess(res, metrics, 'Real-time metrics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getRetentionMetrics(req, res, next) {
    try {
      const metrics = await AnalyticsService.getRetentionMetrics();
      sendSuccess(res, metrics, 'Retention metrics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getConversionFunnel(req, res, next) {
    try {
      const funnel = await AnalyticsService.getConversionFunnel();
      sendSuccess(res, funnel, 'Conversion funnel retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async exportAnalytics(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { type, format = 'json', period = 'month' } = req.query;
      const exportData = await AnalyticsService.exportAnalytics(type, format, period);
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=analytics_${type}_${Date.now()}.csv`);
        return res.send(exportData);
      } else if (format === 'excel') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=analytics_${type}_${Date.now()}.xlsx`);
        return res.send(exportData);
      }
      
      sendSuccess(res, exportData, 'Analytics exported successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AnalyticsController;