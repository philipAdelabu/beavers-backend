const { validationResult } = require('express-validator');
const JobService = require('../services/job.service');
const ReviewService = require('../services/review.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');


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
      sendError(res, error.message || 'Fail to create Job', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to accept job', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to reject job offer', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to confirm arrival', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to start diagnostic', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to stop diagnostics', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to start execution', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to pause execution', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to resume execution', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to stop execution', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to submit Quote', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to approve quote', error.statusCode || 500);
      next(error);
    }
  }

  static async rejectQuote(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await JobService.rejectQuote(req.params.jobId, req.user.id);
      sendSuccess(res, result, 'Quote rejected');
    } catch (error) {
      sendError(res, error.message || 'Fail to reject quote', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to complete Job', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to cancle Job', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to get Job details', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to get client Jobs', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to get Artisan jobs', error.statusCode || 500);
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
      sendError(res, error.message || 'Fail to get Job Time Line', error.statusCode || 500);
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
        rating: req.body.rating,
        review: req.body.review,
        categories: req.body.categories,
      });
      sendSuccess(res, rating, 'Rating submitted successfully', 201);
    } catch (error) {
      sendError(res, error.message || 'Fail to rate jobs', error.statusCode || 500);
      next(error);
    }
  }

   // Add these methods to JobController

/**
 * Get available jobs for artisans to browse
 * @route GET /api/v1/jobs/available
 */
static async getAvailableJobs(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const {
      category,
      minBudget,
      maxBudget,
      serviceType,
      latitude,
      longitude,
      radius = 20,
      sortBy = 'created_at',
      page = 1,
      limit = 20
    } = req.query;
    
    const location = latitude && longitude ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) } : null;
    
    const result = await JobService.getAvailableJobs(
      {
        category,
        minBudget: minBudget ? parseFloat(minBudget) : null,
        maxBudget: maxBudget ? parseFloat(maxBudget) : null,
        serviceType,
        location,
        radius: parseFloat(radius),
        sortBy,
        page: parseInt(page),
        limit: parseInt(limit)
      },
      req.user.id
    );
    
    sendPaginated(res, result.jobs, page, limit, result.total, 'Available jobs retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Get job details for browsing
 * @route GET /api/v1/jobs/available/:jobId
 */
static async getAvailableJobDetails(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const job = await JobService.getAvailableJobDetails(req.params.jobId, req.user.id);
    sendSuccess(res, job, 'Job details retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Save a job for later
 * @route POST /api/v1/jobs/save/:jobId
 */
static async saveJob(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const result = await JobService.saveJob(req.params.jobId, req.user.id, req.body.notes);
    sendSuccess(res, result, 'Job saved successfully', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Remove saved job
 * @route DELETE /api/v1/jobs/save/:jobId
 */
static async unsaveJob(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    await JobService.unsaveJob(req.params.jobId, req.user.id);
    sendSuccess(res, null, 'Job removed from saved list');
  } catch (error) {
    next(error);
  }
}

/**
 * Get saved jobs
 * @route GET /api/v1/jobs/saved
 */
static async getSavedJobs(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await JobService.getSavedJobs(req.user.id, { page: parseInt(page), limit: parseInt(limit) });
    sendPaginated(res, result.jobs, page, limit, result.total, 'Saved jobs retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Create job alert
 * @route POST /api/v1/jobs/alert
 */
static async createJobAlert(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const alert = await JobService.createJobAlert(req.user.id, req.body);
    sendSuccess(res, alert, 'Job alert created successfully', 201);
  } catch (error) {
    next(error);
  }
}

/**
 * Get job alert
 * @route GET /api/v1/jobs/alert
 */
static async getJobAlert(req, res, next) {
  try {
    const alert = await JobService.getJobAlert(req.user.id);
    sendSuccess(res, alert, 'Job alert retrieved successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Delete job alert
 * @route DELETE /api/v1/jobs/alert
 */
static async deleteJobAlert(req, res, next) {
  try {
    await JobService.deleteJobAlert(req.user.id);
    sendSuccess(res, null, 'Job alert deleted successfully');
  } catch (error) {
    next(error);
  }
}

/**
 * Get recommended jobs
 * @route GET /api/v1/jobs/recommended
 */
static async getRecommendedJobs(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { limit = 10 } = req.query;
    const jobs = await JobService.getRecommendedJobs(req.user.id, { limit: parseInt(limit) });
    sendSuccess(res, jobs, 'Recommended jobs retrieved successfully');
  } catch (error) {
    next(error);
  }
}


}

module.exports = JobController;