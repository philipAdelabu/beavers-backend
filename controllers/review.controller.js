const ReviewService = require('../services/review.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class ReviewController {
  static async createReview(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const review = await ReviewService.createReview({
        jobId: req.body.jobId,
        reviewerId: req.user.id,
        revieweeId: req.body.artisanId,
        rating: req.body.rating,
        review: req.body.review,
        categories: req.body.categories
      });
      sendSuccess(res, review, 'Review submitted successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async getArtisanReviews(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { page = 1, limit = 20, minRating } = req.query;
      const result = await ReviewService.getArtisanReviews(req.params.artisanId, { page, limit, minRating });
      sendPaginated(res, result.ratings, page, limit, result.total, 'Reviews retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getClientReviews(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await ReviewService.getClientReviews(req.user.id, { page, limit });
      sendPaginated(res, result.ratings, page, limit, result.total, 'Your reviews retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getJobReview(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const reviews = await ReviewService.getJobReviews(req.params.jobId);
      sendSuccess(res, reviews, 'Job reviews retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updateReview(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const review = await ReviewService.updateReview(req.params.reviewId, req.user.id, req.body);
      sendSuccess(res, review, 'Review updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async deleteReview(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      await ReviewService.deleteReview(req.params.reviewId, req.user.id, req.user.user_type);
      sendSuccess(res, null, 'Review deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getRatingBreakdown(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const breakdown = await ReviewService.getRatingBreakdown(req.params.artisanId);
      sendSuccess(res, breakdown, 'Rating breakdown retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getRatingTrend(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { months = 6 } = req.query;
      const trend = await ReviewService.getRatingTrend(req.params.artisanId, months);
      sendSuccess(res, trend, 'Rating trend retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getTopRatedArtisans(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { limit = 10, category } = req.query;
      const artisans = await ReviewService.getTopRatedArtisans(parseInt(limit), category);
      sendSuccess(res, artisans, 'Top rated artisans retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getRecentReviews(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { limit = 20 } = req.query;
      const reviews = await ReviewService.getRecentReviews(parseInt(limit));
      sendSuccess(res, reviews, 'Recent reviews retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getReviewStats(req, res, next) {
    try {
      const stats = await ReviewService.getReviewStats();
      sendSuccess(res, stats, 'Review statistics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReviewController;