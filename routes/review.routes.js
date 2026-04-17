const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const Rating = require('../models/Rating');
const Job = require('../models/Job');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');

// Create rating (client only)
router.post('/', authenticateToken, requireRole(['client']), [
  body('jobId').isUUID(),
  body('rating').isInt({ min: 1, max: 5 }),
  body('review').optional().isString(),
  body('categories').optional().isObject()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // Verify job belongs to client and is completed
    const job = await Job.findById(req.body.jobId);
    if (!job) {
      throw new AppError(404, 'Job not found');
    }
    
    if (job.client_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to rate this job');
    }
    
    if (job.job_status !== 'completed') {
      throw new AppError(400, 'Cannot rate an incomplete job');
    }
    
    // Check if already rated
    const existingRatings = await Rating.findByJobId(req.body.jobId);
    if (existingRatings.length > 0) {
      throw new AppError(400, 'Job already rated');
    }
    
    const rating = await Rating.create({
      jobId: req.body.jobId,
      reviewerId: req.user.id,
      revieweeId: job.artisan_id,
      rating: req.body.rating,
      review: req.body.review,
      categories: req.body.categories
    });
    
    sendSuccess(res, rating, 'Rating submitted successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Get ratings for an artisan
router.get('/artisan/:artisanId', [
  param('artisanId').isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('minRating').optional().isInt({ min: 1, max: 5 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { page = 1, limit = 20, minRating } = req.query;
    const result = await Rating.getArtisanRatings(req.params.artisanId, { page, limit, minRating });
    sendPaginated(res, result.ratings, page, limit, result.total, 'Ratings retrieved');
  } catch (error) {
    next(error);
  }
});

// Get ratings by client
router.get('/client', authenticateToken, requireRole(['client']), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await Rating.getClientRatings(req.user.id, { page, limit });
    sendPaginated(res, result.ratings, page, limit, result.total, 'Your ratings retrieved');
  } catch (error) {
    next(error);
  }
});

// Get rating by job
router.get('/job/:jobId', authenticateToken, [
  param('jobId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      throw new AppError(404, 'Job not found');
    }
    
    if (job.client_id !== req.user.id && job.artisan_id !== req.user.id && req.user.user_type !== 'admin') {
      throw new AppError(403, 'Not authorized');
    }
    
    const ratings = await Rating.findByJobId(req.params.jobId);
    sendSuccess(res, ratings, 'Job ratings retrieved');
  } catch (error) {
    next(error);
  }
});

// Update rating (client only)
router.put('/:ratingId', authenticateToken, requireRole(['client']), [
  param('ratingId').isUUID(),
  body('rating').optional().isInt({ min: 1, max: 5 }),
  body('review').optional().isString(),
  body('categories').optional().isObject()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const rating = await Rating.findById(req.params.ratingId);
    if (!rating) {
      throw new AppError(404, 'Rating not found');
    }
    
    if (rating.reviewer_id !== req.user.id) {
      throw new AppError(403, 'Not authorized');
    }
    
    const updated = await Rating.updateRating(req.params.ratingId, req.body);
    sendSuccess(res, updated, 'Rating updated successfully');
  } catch (error) {
    next(error);
  }
});

// Delete rating (client or admin)
router.delete('/:ratingId', authenticateToken, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const rating = await Rating.findById(req.params.ratingId);
    if (!rating) {
      throw new AppError(404, 'Rating not found');
    }
    
    if (rating.reviewer_id !== req.user.id && req.user.user_type !== 'admin') {
      throw new AppError(403, 'Not authorized');
    }
    
    const deleted = await Rating.deleteRating(req.params.ratingId);
    sendSuccess(res, null, 'Rating deleted successfully');
  } catch (error) {
    next(error);
  }
});

// Get rating statistics for artisan
router.get('/artisan/:artisanId/stats', async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const result = await Rating.getArtisanRatings(req.params.artisanId, {});
    const categoryBreakdown = await Rating.getCategoryBreakdown(req.params.artisanId);
    const trend = await Rating.getRatingTrend(req.params.artisanId);
    
    sendSuccess(res, {
      statistics: result.statistics,
      categoryBreakdown,
      trend
    }, 'Rating statistics retrieved');
  } catch (error) {
    next(error);
  }
});

module.exports = router;