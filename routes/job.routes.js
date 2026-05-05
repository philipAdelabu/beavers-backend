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

// Accept job offer (artisan)
router.post(
  '/:jobId/accept',
  authenticateToken,
  requireRole(['artisan']),
  JobController.acceptJob);

// Confirm arrival with PIN
router.post('/:jobId/confirm-arrival', authenticateToken, requireRole(['client']), [
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


/*
async (req, res) => {
  const { jobId } = req.params;
  const { executionMode } = req.body;

  const client = await pool.connect();
  try {
    const diagnosticsEnd = new Date();
    const diagnosticsStart = await cacheGet(`job:${jobId}:diagnostics_start`);
    
    if (!diagnosticsStart) {
      return res.status(400).json({ error: 'Diagnostics not started' });
    }

    const startTime = new Date(diagnosticsStart);
    const diagnosticsDuration = (diagnosticsEnd - startTime) / 1000 / 60; // minutes
    const diagnosticsFee = Math.ceil(diagnosticsDuration * 500); // ₦500 per minute

    await client.query('BEGIN');

    await client.query(
      `UPDATE jobs 
       SET diagnostics_ended_at = $1, billing_mode = $2, job_status = 'awaiting_execution_approval'
       WHERE id = $3`,
      [diagnosticsEnd, executionMode, jobId]
    );

    // Update billing with diagnostics fee
    await client.query(
      `UPDATE job_billing 
       SET diagnostics_fee = $1 
       WHERE job_id = $2`,
      [diagnosticsFee, jobId]
    );

    // Update escrow for diagnostics
    await client.query(
      `UPDATE escrow_transactions 
       SET amount = amount + $1 
       WHERE job_id = $2 AND transaction_type = 'diagnostics_fee'`,
      [diagnosticsFee, jobId]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Diagnostics completed',
      duration: diagnosticsDuration,
      fee: diagnosticsFee,
      executionMode
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Stop diagnostics error:', error);
    res.status(500).json({ error: 'Failed to stop diagnostics' });
  } finally {
    client.release();
  }
}; */

// Get job details
router.get('/:jobId', authenticateToken, JobController.getJobDetails);


// Get client jobs
router.get('/client/jobs', authenticateToken, requireRole(['client']), async (req, res) => {
  const clientId = req.user.id;
  const { status, page = 1, limit = 10 } = req.query;

  try {
    let query = `
      SELECT j.*, ap.full_legal_name as artisan_name, ap.star_rating
      FROM jobs j
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      WHERE j.client_id = $1
    `;
    const params = [clientId];
    let paramIndex = 2;

    if (status) {
      query += ` AND j.job_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY j.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, (page - 1) * limit);

    const result = await pool.query(query, params);
    res.json({
      jobs: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get client jobs error:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// Get artisan jobs
router.get('/artisan/jobs', authenticateToken, requireRole(['artisan']), async (req, res) => {
  const artisanId = req.user.id;
  const { status, page = 1, limit = 10 } = req.query;

  try {
    let query = `
      SELECT j.*, cp.full_legal_name as client_name
      FROM jobs j
      LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
      WHERE j.artisan_id = $1
    `;
    const params = [artisanId];
    let paramIndex = 2;

    if (status) {
      query += ` AND j.job_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY j.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, (page - 1) * limit);

    const result = await pool.query(query, params);
    res.json({
      jobs: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get artisan jobs error:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// Calculate priority score for artisan matching
function calculatePriorityScore(artisan, distance) {
  const tierWeight = artisan.tier_level === 3 ? 0.4 : artisan.tier_level === 2 ? 0.3 : 0.2;
  const ratingWeight = (artisan.star_rating / 5) * 0.3;
  const distanceWeight = Math.max(0, 1 - (distance / 10)) * 0.2;
  const completionWeight = (artisan.completion_rate / 100) * 0.1;
  
  return (tierWeight + ratingWeight + distanceWeight + completionWeight) * 100;
}


// Add these routes to your existing job routes
// This gives the artisan to  browse for available job.

// Artisan job browsing routes
router.get('/available', authenticateToken, requireRole(['artisan']), [
  body('category').optional().isString(),
  body('minBudget').optional().isFloat({ min: 0 }),
  body('maxBudget').optional().isFloat({ min: 0 }),
  body('serviceType').optional().isIn(['inspection', 'repair', 'installation', 'emergency']),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('radius').optional().isFloat({ min: 1, max: 100 }),
  body('sortBy').optional().isIn(['distance', 'budget', 'created_at']),
  body('page').optional().isInt({ min: 1 }),
  body('limit').optional().isInt({ min: 1, max: 100 })
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