const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const TrainingController = require('../controllers/training.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

// ==================== Public Routes (Auth Optional) ====================

// Get courses by tier (artisan needs auth to see their tier)
router.get('/courses/tier/:tierLevel', [
  param('tierLevel').isInt({ min: 1, max: 3 })
], TrainingController.getCoursesByTier);

// Get course by slug
router.get('/courses/slug/:slug', TrainingController.getCourseBySlug);

// Get course reviews (public)
router.get('/courses/:courseId/reviews', [
  param('courseId').isUUID(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], TrainingController.getCourseReviews);

// Verify certificate (public)
router.get('/certificates/verify/:certificateNumber', [
  param('certificateNumber').isString().isLength({ min: 10 })
], TrainingController.verifyCertificate);

// ==================== Artisan Routes (Auth Required) ====================

router.use(authenticateToken);
router.use(requireRole(['artisan']));

// Get all courses (with filters)
router.get('/courses', [
  query('category').optional().isString(),
  query('tierLevel').optional().isInt({ min: 1, max: 3 }),
  query('isActive').optional().isBoolean(),
  query('isFeatured').optional().isBoolean(),
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], TrainingController.getAllCourses);

// Get course by ID
router.get('/courses/:courseId', [
  param('courseId').isUUID()
], TrainingController.getCourseById);

// Enroll in course
router.post('/courses/:courseId/enroll', [
  param('courseId').isUUID(),
  body('paymentReference').optional().isString()
], TrainingController.enrollArtisan);

// Get artisan enrollments
router.get('/enrollments', [
  query('status').optional().isIn(['enrolled', 'in_progress', 'completed', 'dropped']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], TrainingController.getArtisanEnrollments);

// Get enrollment details
router.get('/enrollments/:enrollmentId', [
  param('enrollmentId').isUUID()
], TrainingController.getEnrollmentDetails);

// Complete module
router.post('/enrollments/:enrollmentId/complete-module', [
  param('enrollmentId').isUUID(),
  body('moduleIndex').isInt({ min: 0 }),
  body('timeSpent').optional().isInt({ min: 0 }),
  body('quizScore').optional().isFloat({ min: 0, max: 100 })
], TrainingController.completeModule);

// Get artisan certificates
router.get('/certificates', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], TrainingController.getArtisanCertificates);

// Submit course review
router.post('/courses/:courseId/review', [
  param('courseId').isUUID(),
  body('rating').isInt({ min: 1, max: 5 }),
  body('review').optional().isString().isLength({ max: 500 })
], TrainingController.submitReview);

// Check and update tier
router.post('/tier/check', TrainingController.checkAndUpdateTier);

// ==================== Admin Routes ====================

router.use(requireRole(['admin']));

// Create course
router.post('/admin/courses', [
  body('name').notEmpty().withMessage('Course name is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('tierLevel').isInt({ min: 1, max: 3 }),
  body('durationHours').isInt({ min: 1 }),
  body('modules').isArray({ min: 1 }),
  body('modules.*.name').notEmpty(),
  body('price').optional().isFloat({ min: 0 }),
  body('certificationProvided').optional().isBoolean()
], TrainingController.createCourse);

// Update course
router.put('/admin/courses/:courseId', [
  param('courseId').isUUID()
], TrainingController.updateCourse);

// Delete course
router.delete('/admin/courses/:courseId', [
  param('courseId').isUUID()
], TrainingController.deleteCourse);

// Get tier requirements
router.get('/admin/tier/requirements', TrainingController.getTierRequirements);

// Update tier requirements
router.put('/admin/tier/:tierLevel/requirements', [
  param('tierLevel').isInt({ min: 1, max: 3 }),
  body('minJobsCompleted').optional().isInt({ min: 0 }),
  body('minRating').optional().isFloat({ min: 0, max: 5 }),
  body('minCompletionRate').optional().isFloat({ min: 0, max: 100 }),
  body('requiredCourses').optional().isInt({ min: 0 }),
  body('requiredCertifications').optional().isInt({ min: 0 }),
  body('minTrustScore').optional().isInt({ min: 0, max: 100 }),
  body('benefits').optional().isObject()
], TrainingController.updateTierRequirements);

// Get tier statistics
router.get('/admin/tier/statistics', TrainingController.getTierStatistics);

// Get course statistics
router.get('/admin/courses/statistics', TrainingController.getCourseStatistics);

module.exports = router;