const JobService = require('../services/job.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class JobController {
  static async createJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.createJob(req.user.id, req.body);
      sendSuccess(res, result, 'Job created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async acceptJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.acceptJob(req.params.jobId, req.user.id);
      sendSuccess(res, result, 'Job accepted successfully');
    } catch (error) {
      next(error);
    }
  }

  static async rejectJobOffer(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      await JobService.rejectJobOffer(req.params.jobId, req.user.id, req.body.reason);
      sendSuccess(res, null, 'Job offer rejected');
    } catch (error) {
      next(error);
    }
  }

  static async confirmArrival(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.confirmArrival(req.params.jobId, req.user.id, req.body.pin);
      sendSuccess(res, result, 'Arrival confirmed successfully');
    } catch (error) {
      next(error);
    }
  }

  static async startDiagnostics(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.startDiagnostics(req.params.jobId, req.user.id);
      sendSuccess(res, result, 'Diagnostics started');
    } catch (error) {
      next(error);
    }
  }

  static async stopDiagnostics(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.stopDiagnostics(req.params.jobId, req.user.id, req.body.executionMode);
      sendSuccess(res, result, 'Diagnostics completed');
    } catch (error) {
      next(error);
    }
  }

  static async startExecution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.startExecution(req.params.jobId, req.user.id);
      sendSuccess(res, result, 'Execution started');
    } catch (error) {
      next(error);
    }
  }

  static async pauseExecution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.pauseExecution(req.params.jobId, req.user.id, req.body.reason, req.body.duration);
      sendSuccess(res, result, 'Execution paused');
    } catch (error) {
      next(error);
    }
  }

  static async resumeExecution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.resumeExecution(req.params.jobId, req.user.id);
      sendSuccess(res, result, 'Execution resumed');
    } catch (error) {
      next(error);
    }
  }

  static async stopExecution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.stopExecution(req.params.jobId, req.user.id);
      sendSuccess(res, result, 'Execution completed');
    } catch (error) {
      next(error);
    }
  }

  static async submitQuote(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.submitQuote(req.params.jobId, req.user.id, req.body);
      sendSuccess(res, result, 'Quote submitted successfully');
    } catch (error) {
      next(error);
    }
  }

  static async approveQuote(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.approveQuote(req.params.jobId, req.user.id);
      sendSuccess(res, result, 'Quote approved');
    } catch (error) {
      next(error);
    }
  }

  static async completeJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.completeJob(req.params.jobId, req.user.id, req.body.completionNotes);
      sendSuccess(res, result, 'Job completed successfully');
    } catch (error) {
      next(error);
    }
  }

  static async cancelJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.cancelJob(req.params.jobId, req.user.id, req.user.user_type, req.body.reason);
      sendSuccess(res, result, 'Job cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getJobDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const job = await JobService.getJobDetails(req.params.jobId, req.user.id, req.user.user_type);
      sendSuccess(res, job, 'Job details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getClientJobs(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, page = 1, limit = 10 } = req.query;
      const result = await JobService.getClientJobs(req.user.id, { status, page, limit });
      sendPaginated(res, result.jobs, page, limit, result.total, 'Jobs retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getArtisanJobs(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, page = 1, limit = 10 } = req.query;
      const result = await JobService.getArtisanJobs(req.user.id, { status, page, limit });
      sendPaginated(res, result.jobs, page, limit, result.total, 'Jobs retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  
  static async getJobTimeline(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const timeline = await JobService.getJobTimeline(req.params.jobId);
      sendSuccess(res, timeline, 'Job timeline retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async rateJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const rating = await ReviewService.createReview({
        jobId: req.params.jobId,
        reviewerId: req.user.id,
        revieweeId: req.body.artisanId,
        rating: req.body.rating,
        review: req.body.review,
        categories: req.body.categories
      });
      sendSuccess(res, rating, 'Rating submitted successfully', 201);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = JobController;