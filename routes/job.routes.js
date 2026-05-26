// routes/job.routes.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const { getNearbyArtisans, cacheSet, cacheGet } = require('../config/redis');
const { emitToArtisan, emitToClient } = require('../socket/socket.handlers');
const { calculateDistance } = require('../utils/geo.utils');
const JobController = require('../controllers/job.controller');
const router = express.Router();

// Create job request 
router.post('/create', authenticateToken, requireRole(['client']), [
  body('category').notEmpty(),
  body('description').notEmpty(),
  body('location').notEmpty(),
  body('medialUrls').optional().notEmpty(),
  body('serviceType').isIn(['inspection', 'repair', 'installation', 'emergency', 'maintenance'])
], JobController.createJob);

// Repost an expired job
router.post(
  '/:jobId/repost',
  authenticateToken,
  requireRole(['client']),
  JobController.repostJob,
);

// Accept job offer (artisan)
router.post(
  '/:jobId/accept',
  authenticateToken,
  requireRole(['artisan']),
  JobController.acceptJob);

// Confirm arrival with PIN
router.post('/:jobId/confirm-arrival', authenticateToken, requireRole(['client', 'artisan']), [
  body('pin').isLength({ min: 6, max: 6 }),
], JobController.confirmArrival);


// Start diagnostics timer
router.post(
  '/:jobId/start-diagnostics',
  authenticateToken,
  requireRole(['artisan']),
  JobController.startDiagnostics,
);

// Start diagnostics timer
router.put(
  '/:jobId/diagnostics-progress',
  authenticateToken,
  requireRole(['artisan']),
  JobController.startDiagnostics,
); 

// Stop diagnostics and choose execution mode
router.post('/:jobId/stop-diagnostics', authenticateToken, requireRole(['artisan']), [
  body('executionMode').isIn(['time_based', 'quoted']),
], JobController.stopDiagnostics);

// Start Execution of the job
router.post(
  '/:jobId/start-execution',
  authenticateToken,
  requireRole(['artisan']),
  JobController.startExecution,
);

// Pause Job Execution
router.post(
  '/:jobId/pause-execution',
  authenticateToken,
  requireRole(['artisan']),
  [
    body('reason').notEmpty(),
    body('duration').isInt(),
  ],
  JobController.pauseExecution,
);

// Resume Execution of the job
router.post(
  '/:jobId/resume-execution',
  authenticateToken,
  requireRole(['artisan']),
  JobController.resumeExecution,
);

// Stop Execution of the job
router.post(
  '/:jobId/stop-execution',
  authenticateToken,
  requireRole(['artisan']),
  JobController.stopExecution,
);

// Submit Quote
router.post(
  '/:jobId/submit-quote',
  authenticateToken,
  requireRole(['artisan']),
  [
    body('quoteAmount').isNumeric().notEmpty(),
    body('quoteDetails').notEmpty(),
    body('estimatedDuration').isInt().notEmpty(),

  ],
  JobController.submitQuote,
);

// client approve the quote
router.post(
  '/:jobId/approve-quote',
  authenticateToken,
  requireRole(['client']),
  JobController.approveQuote,
);

// Client reject the quote
router.post(
  '/:jobId/reject-quote',
  authenticateToken,
  requireRole(['client']),
  JobController.rejectQuote,
);


// Job Completed
router.post(
  '/:jobId/complete',
  authenticateToken,
  requireRole(['artisan']),
  [
    body('completionNotes').notEmpty(),
  ],
  JobController.completeJob,
);


// Get job details
router.get('/:jobId', authenticateToken, JobController.getJobDetails);

// Client Rate the Job 

router.post('/:jobId/rate', authenticateToken, requireRole(['client']), [
   body('rating').optional().notEmpty().isInt(),
   body('review').optional().notEmpty(),
   body('categories').optional().notEmpty(),
], JobController.rateJob); 


// Get client jobs
router.get(
  '/client/jobs',
  authenticateToken,
  requireRole(['client']),
  JobController.getClientJobs,
);

// Get artisan jobs
router.get(
  '/artisan/jobs',
  authenticateToken,
  requireRole(['artisan']),
  JobController.getArtisanJobs,
);

// Get job timeline
router.get('/:jobId/timeline', authenticateToken, JobController.getJobTimeline);

// Add these routes to your existing job routes
// This gives the artisan to  browse for available job.

// Artisan job browsing routes
router.get('/available/jobs', authenticateToken, requireRole(['artisan']), [
  param('category').optional().isString(),
  param('minBudget').optional().isFloat({ min: 0 }),
  param('maxBudget').optional().isFloat({ min: 0 }),
  param('serviceType').optional().isIn(['inspection', 'repair', 'installation', 'emergency']),
  param('latitude').optional().isFloat({ min: -90, max: 90 }),
  param('longitude').optional().isFloat({ min: -180, max: 180 }),
  param('radius').optional().isFloat({ min: 1, max: 100 }),
  param('sortBy').optional().isIn(['distance', 'budget', 'created_at']),
  param('page').optional().isInt({ min: 1 }),
  param('limit').optional().isInt({ min: 1, max: 100 })
], JobController.getAvailableJobs); 

router.get('/available/:jobId', authenticateToken, requireRole(['artisan']), [
  param('jobId').isUUID()
], JobController.getAvailableJobDetails);

// Saved jobs routes
router.post('/save/:jobId', authenticateToken, requireRole(['artisan']), [
  param('jobId').isUUID(),
  body('notes').optional().isString()
], JobController.saveJob);

router.delete('/save/:jobId', authenticateToken, requireRole(['artisan']), [
  param('jobId').isUUID()
], JobController.unsaveJob);

router.get('/saved', authenticateToken, requireRole(['artisan']), [
  body('page').optional().isInt({ min: 1 }),
  body('limit').optional().isInt({ min: 1, max: 100 })
], JobController.getSavedJobs);

// Job alert routes
router.post('/alert', authenticateToken, requireRole(['artisan']), [
  body('categories').optional().isArray(),
  body('minBudget').optional().isFloat({ min: 0 }),
  body('maxDistance').optional().isInt({ min: 1, max: 100 })
], JobController.createJobAlert);

router.get('/alert', authenticateToken, requireRole(['artisan']), JobController.getJobAlert);

router.delete('/alert', authenticateToken, requireRole(['artisan']), JobController.deleteJobAlert);

// Recommended jobs
router.get('/recommended', authenticateToken, requireRole(['artisan']), [
  body('limit').optional().isInt({ min: 1, max: 50 })
], JobController.getRecommendedJobs);

module.exports = router;