const ArtisanService = require('../services/artisan.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');
const { logger }  = require('../config/logger');

class ArtisanController {
  static async getProfile(req, res, next) {
    try {
      const profile = await ArtisanService.getProfile(req.user.id);
      sendSuccess(res, profile, 'Profile retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve profile', error.statusCode || 500);
      next(error);
    }
  }


  static async updateProfile(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const profile = await ArtisanService.updateProfile(req.user.id, req.body);
      sendSuccess(res, profile, 'Profile updated successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to update profile', error.statusCode || 500);
      next(error);
    }
  }

    static async uploadDocuments(req, res, next) {
    try {
      const documents = {};
      if (req.files?.passportPhoto) documents.passportPhoto = req.files.passportPhoto[0].path;
      if (req.files?.ninPhoto) documents.ninPhoto = req.files.ninPhoto[0].path;
      if (req.files?.utilityBill) documents.utilityBill = req.files.utilityBill[0].path;
      if (req.files?.certificates) documents.certificates = req.files.certificates[0].path;
      if (req.files?.tradeTestimony) documents.tradeTestimony = req.files.tradeTestimony[0].path;
      const profile = await ArtisanService.updateProfile(req.user.id, { documents });
      sendSuccess(res, profile, 'Documents uploaded successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to upload documents', error.statusCode || 500);
      next(error);
    }
  }

  static async updateAvailability(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { isAvailable, currentLocation } = req.body;
      const profile = await ArtisanService.updateAvailability(req.user.id, isAvailable, currentLocation);
      sendSuccess(res, profile, `Availability set to ${isAvailable}`);
    } catch (error) {
      sendError(res, error.message || 'Failed to update availability', error.statusCode || 500);
      next(error);
    }
  }

  static async uploadDocuments(req, res, next) {
    try {
      const documents = {};
      if (req.files?.passportPhoto) documents.passportPhoto = req.files.passportPhoto[0].path;
      if (req.files?.ninPhoto) documents.ninPhoto = req.files.ninPhoto[0].path;
      if (req.files?.certificates) documents.certificates = req.files.certificates.map(f => f.path);
      if (req.files?.tradeTestimony) documents.tradeTestimony = req.files.tradeTestimony.map(f => f.path);
      
      const profile = await ArtisanService.updateProfile(req.user.id, { documents });
      sendSuccess(res, profile, 'Documents uploaded successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to upload documents', error.statusCode || 500);
      next(error);
    }
  }

  static async getEarnings(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { startDate, endDate } = req.query;
      const earnings = await ArtisanService.getEarnings(req.user.id, startDate, endDate);
      sendSuccess(res, earnings, 'Earnings retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve earnings', error.statusCode || 500);
      next(error);
    }
  }

  static async requestWithdrawal(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { amount, bankCode, accountNumber, accountName } = req.body;
      const withdrawal = await ArtisanService.requestWithdrawal(req.user.id, amount, { bankCode, accountNumber, accountName });
      sendSuccess(res, withdrawal, 'Withdrawal request submitted successfully', 201);
    } catch (error) {
      sendError(res, error.message || 'Failed to request withdrawal', error.statusCode || 500);
      next(error);
    }
  }

  static async getWithdrawalHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await ArtisanService.getWithdrawalHistory(req.user.id, page, limit);
      sendPaginated(res, result.withdrawals, page, limit, result.total, 'Withdrawal history retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve withdrawal history', error.statusCode || 500);
      next(error);
    }
  }

  static async updateBankAccount(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const profile = await ArtisanService.updateProfile(req.user.id, { bank_details: req.body });
      sendSuccess(res, profile, 'Bank account updated successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to update bank account', error.statusCode || 500);
      next(error);
    }
  } 

  static async getPerformanceMetrics(req, res, next) {
    try {
      const metrics = await ArtisanService.getPerformanceMetrics(req.user.id);
      sendSuccess(res, metrics, 'Performance metrics retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve performance metrics', error.statusCode || 500);
      next(error);
    }
  }
 
  static async getRatings(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await ReviewService.getArtisanReviews(req.user.id, { page, limit });
      sendPaginated(res, result.ratings, page, limit, result.total, 'Ratings retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve ratings', error.statusCode || 500);
      next(error);
    }
  }

  static async getSchedule(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { date } = req.query;
      const schedule = await ArtisanService.getSchedule(req.user.id, date || new Date().toISOString().split('T')[0]);
      sendSuccess(res, schedule, 'Schedule retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve schedule', error.statusCode || 500);
      next(error);
    }
  }

  static async setSchedule(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const schedule = await ArtisanService.setSchedule(req.user.id, req.body);
      sendSuccess(res, schedule, 'Schedule set successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to set schedule', error.statusCode || 500);
      next(error);
    }
  }

  static async getTools(req, res, next) {
    try {
      const tools = await ArtisanService.getTools(req.user.id);
      sendSuccess(res, tools, 'Tools retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve tools', error.statusCode || 500);
      next(error);
    }
  }

  static async addTool(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const tool = await ArtisanService.addTool(req.user.id, req.body);
      sendSuccess(res, tool, 'Tool added successfully', 201);
    } catch (error) {
      sendError(res, error.message || 'Failed to add tool', error.statusCode || 500);
      next(error);
    }
  }

  static async updateTool(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const tool = await ArtisanService.updateTool(req.params.toolId, req.user.id, req.body);
      sendSuccess(res, tool, 'Tool updated successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to update tool', error.statusCode || 500);
      next(error);
    }
  }

  static async getUpcomingJobs(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { limit = 10 } = req.query;
      const jobs = await ArtisanService.getUpcomingJobs(req.user.id, limit);
      sendSuccess(res, jobs, 'Upcoming jobs retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve upcoming jobs', error.statusCode || 500);
      next(error);
    }
  }

    static async getJobOffers(req, res, next){
      const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    try{
      const {limit = 10 } =  req.query;
      const jobs = await ArtisanService.getJobOffers(req.user.id, limit);
      sendSuccess(res, jobs, 'Available Jobs offer retrieved successfully');
    }catch(error){
      sendError(res, error.message || 'Failed to retrieve all jobs offer', error.statusCode || 500);
      next(error);
    }

  }

  static async getStatistics(req, res, next) {
    try {
      const stats = await ArtisanService.getStatistics(req.user.id);
      sendSuccess(res, stats, 'Statistics retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve statistics', error.statusCode || 500);
      next(error);
    }
  }

  static async checkMonthlyFeeStatus(req, res, next) {
    try {
      const status = await ArtisanService.checkMonthlyFeeStatus(req.user.id);
      sendSuccess(res, status, 'Monthly fee status retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve monthly fee status', error.statusCode || 500);
      next(error);
    }
  }

  static async payMonthlyFee(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      // Process payment logic here
      const profile = await ArtisanService.updateProfile(req.user.id, { 
        monthly_fee_status: 'paid',
        last_fee_payment: new Date(),
      });
      sendSuccess(res, profile, 'Monthly fee paid successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to pay monthly fee', error.statusCode || 500);
      next(error);
    }
  }

 

}

module.exports = ArtisanController;