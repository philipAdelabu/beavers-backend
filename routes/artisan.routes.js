const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole, requireVerification, requireActiveSubscription 
} = require('../middleware/auth.middleware');
const { uploadFields, uploadSingle } = require('../config/multer');
const Artisan = require('../models/Artisan');
const Job = require('../models/Job');
const Rating = require('../models/Rating');
const Training = require('../models/Training');
const Payment = require('../models/Payment');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { logger } = require('../config/logger');
const ArtisanController = require('../controllers/artisan.controller');
const { authLimiter } = require('../middleware/rateLimit.middleware');

 

// Get artisan profile
router.get('/profile',
  authenticateToken,
  requireRole(['artisan']),
  ArtisanController.getProfile,
);

// Update artisan profile
router.put('/profile', authenticateToken, requireRole(['artisan']), [
  body('full_legal_name').optional().notEmpty().trim(),
  body('residential_address').optional().notEmpty(),
  body('skill_category').optional().notEmpty(),
  body('sub_categories').optional().isArray(),
], ArtisanController.updateProfile);

// Upload artisan documents
router.post('/upload-documents', authenticateToken, requireRole(['artisan']), uploadFields([
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'ninPhoto', maxCount: 1 },
  { name: 'utilityBill', maxCount: 1 },
  { name: 'certificates', maxCount: 10 },
  { name: 'tradeTestimony', maxCount: 5 },
]), ArtisanController.uploadDocuments);

// Update availability and location status
router.post('/availability', authenticateToken, requireRole(['artisan']), [
  body('isAvailable').isBoolean(),
  body('currentLocation').optional().isObject(),
], ArtisanController.updateAvailability);

// Pay onboarding fee
router.post('/pay-onboarding-fee', authenticateToken, requireRole(['artisan']), [
  body('paymentMethodId').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // Process payment logic here
    const updated = await Artisan.update(req.user.id, { onboarding_fee_paid: true });
    sendSuccess(res, updated, 'Onboarding fee paid successfully');
  } catch (error) {
    next(error);
  }
});

// Pay monthly technology fee
router.post('/pay-monthly-fee', authenticateToken, requireRole(['artisan']), [
  body('paymentMethodId').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const updated = await Artisan.update(req.user.id, { 
      monthly_fee_status: 'paid',
      last_fee_payment: new Date()
    });
    sendSuccess(res, updated, 'Monthly fee paid successfully');
  } catch (error) {
    next(error);
  }
});

// Get artisan tier details
router.get('/tier', authenticateToken, requireRole(['artisan']), async (req, res, next) => {
  try {
    const profile = await Artisan.findByUserId(req.user.id);
    const requirements = {
      tier1: { minRating: 0, minJobs: 0, trainingRequired: false },
      tier2: { minRating: 3.5, minJobs: 10, trainingRequired: true },
      tier3: { minRating: 4.5, minJobs: 50, trainingRequired: true }
    };
    
    sendSuccess(res, {
      currentTier: profile.tier_level,
      requirements,
      nextTierRequirements: profile.tier_level === 1 ? requirements.tier2 : requirements.tier3
    }, 'Tier details retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get available training courses
router.get('/training-courses', authenticateToken, requireRole(['artisan']), [
  query('tier').optional().isInt({ min: 1, max: 3 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { tier } = req.query;
    const courses = await Training.getAllCourses({ tierLevel: tier, isActive: true });
    sendSuccess(res, courses.courses, 'Training courses retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Enroll in training course
router.post('/training-courses/:courseId/enroll', authenticateToken, requireRole(['artisan']), [
  param('courseId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const enrollment = await Training.enrollArtisan(req.user.id, req.params.courseId);
    sendSuccess(res, enrollment, 'Enrolled in course successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Complete training module
router.put('/training-courses/:courseId/module/:moduleIndex/complete', authenticateToken, requireRole(['artisan']), [
  param('courseId').isUUID(),
  param('moduleIndex').isInt({ min: 0 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const enrollments = await Training.getArtisanEnrollments(req.user.id);
    const enrollment = enrollments.find(e => e.course_id === req.params.courseId);
    
    if (!enrollment) {
      throw new AppError(404, 'Enrollment not found');
    }
    
    const completed = await Training.completeModule(enrollment.id, parseInt(req.params.moduleIndex));
    sendSuccess(res, completed, 'Module completed successfully');
  } catch (error) {
    next(error);
  }
});

// Get artisan performance metrics
router.get('/performance', authenticateToken, requireRole(['artisan']), async (req, res, next) => {
  try {
    const profile = await Artisan.findByUserId(req.user.id);
    const jobs = await Job.getArtisanJobs(req.user.id, {});
    const ratings = await Rating.getArtisanRatings(req.user.id, {});
    
    const completedJobs = jobs.jobs.filter(j => j.job_status === 'completed').length;
    const totalJobs = jobs.total;
    const completionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;
    
    sendSuccess(res, {
      starRating: profile.star_rating,
      totalRatings: profile.total_ratings,
      completionRate: profile.completion_rate || completionRate,
      trustScore: profile.trust_score,
      totalJobs,
      completedJobs,
      ratingBreakdown: ratings.statistics
    }, 'Performance metrics retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get artisan ratings
router.get('/ratings', authenticateToken, requireRole(['artisan']), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await Rating.getArtisanRatings(req.user.id, { page, limit });
    sendPaginated(res, result.ratings, page, limit, result.total, 'Ratings retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get artisan earnings
router.get('/earnings', authenticateToken, requireRole(['artisan']), [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { startDate, endDate } = req.query;
    const earnings = await Artisan.getEarnings(req.user.id, startDate, endDate);
    sendSuccess(res, earnings, 'Earnings retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Request withdrawal
router.post('/withdrawals', authenticateToken, requireRole(['artisan']), [
  body('amount').isFloat({ min: 1000 }),
  body('bankCode').notEmpty(),
  body('accountNumber').notEmpty(),
  body('accountName').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const withdrawal = await Artisan.requestWithdrawal(req.user.id, req.body.amount, {
      bankCode: req.body.bankCode,
      accountNumber: req.body.accountNumber,
      accountName: req.body.accountName
    });
    sendSuccess(res, withdrawal, 'Withdrawal request submitted successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Get withdrawal history
router.get('/withdrawals', authenticateToken, requireRole(['artisan']), [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await Artisan.getWithdrawalHistory(req.user.id, page, limit);
    sendPaginated(res, result.withdrawals, page, limit, result.total, 'Withdrawal history retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Update bank account
router.put('/bank-account', authenticateToken, requireRole(['artisan']), [
  body('bankCode').notEmpty(),
  body('accountNumber').notEmpty(),
  body('accountName').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const updated = await Artisan.update(req.user.id, { bank_details: req.body });
    sendSuccess(res, updated, 'Bank account updated successfully');
  } catch (error) {
    next(error);
  }
});

// Get artisan schedule
router.get('/schedule', authenticateToken, requireRole(['artisan']), [
  query('date').optional().isISO8601()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { date } = req.query;
    const schedule = await Artisan.getSchedule(req.user.id, date || new Date().toISOString().split('T')[0]);
    sendSuccess(res, schedule, 'Schedule retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Set availability schedule
router.post('/schedule', authenticateToken, requireRole(['artisan']), [
  body('dayOfWeek').isInt({ min: 0, max: 6 }),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('isAvailable').isBoolean()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const schedule = await Artisan.setSchedule(req.user.id, req.body);
    sendSuccess(res, schedule, 'Schedule set successfully');
  } catch (error) {
    next(error);
  }
});

// Get upcoming jobs
router.get('/upcoming-jobs', authenticateToken, requireRole(['artisan']), [
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { limit = 10 } = req.query;
    const jobs = await Job.getArtisanJobs(req.user.id, { 
      status: ['accepted', 'arrived', 'diagnostics', 'execution'],
      limit 
    });
    sendSuccess(res, jobs.jobs, 'Upcoming jobs retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get artisan tools & equipment
router.get('/tools', authenticateToken, requireRole(['artisan']), async (req, res, next) => {
  try {
    const tools = await Artisan.getTools(req.user.id);
    sendSuccess(res, tools, 'Tools retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Add tool/equipment
router.post('/tools', authenticateToken, requireRole(['artisan']), [
  body('name').notEmpty(),
  body('quantity').optional().isInt({ min: 1 }),
  body('condition').optional().isIn(['new', 'good', 'fair', 'poor']),
  body('notes').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const tool = await Artisan.addTool(req.user.id, req.body);
    sendSuccess(res, tool, 'Tool added successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Update tool status
router.put('/tools/:toolId', authenticateToken, requireRole(['artisan']), [
  param('toolId').isUUID(),
  body('quantity').optional().isInt({ min: 0 }),
  body('condition').optional().isIn(['new', 'good', 'fair', 'poor']),
  body('notes').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const tool = await Artisan.updateTool(req.params.toolId, req.body);
    if (!tool) {
      throw new AppError(404, 'Tool not found');
    }
    sendSuccess(res, tool, 'Tool updated successfully');
  } catch (error) {
    next(error);
  }
});

// Get course progress
router.get('/training-progress/:courseId', authenticateToken, requireRole(['artisan']), [
  param('courseId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const progress = await Training.getCourseProgress(req.user.id, req.params.courseId);
    if (!progress) {
      throw new AppError(404, 'Course enrollment not found');
    }
    sendSuccess(res, progress, 'Course progress retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get certificate
router.get('/certificate/:courseId', authenticateToken, requireRole(['artisan']), [
  param('courseId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const certificate = await Training.getCertificate(req.user.id, req.params.courseId);
    if (!certificate) {
      throw new AppError(404, 'Certificate not found');
    }
    sendSuccess(res, certificate, 'Certificate retrieved successfully');
  } catch (error) {
    next(error);
  }
});

module.exports = router;