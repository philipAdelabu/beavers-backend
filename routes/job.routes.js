// routes/job.routes.js
const express = require('express');
const { body, validationResult } = require('express-validator');
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
  body('pin').isLength({ min: 6, max: 6 })
], async (req, res) => {
  const { jobId } = req.params;
  const { pin } = req.body;
  const clientId = req.user.id;

  const client = await pool.connect();
  try {
    // Verify PIN
    const pinResult = await client.query(
      `SELECT * FROM arrival_pins WHERE job_id = $1 AND pin = $2 AND is_used = false AND expires_at > NOW()`,
      [jobId, pin]
    );

    if (pinResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired PIN' });
    }

    await client.query('BEGIN');

    // Mark PIN as used
    await client.query(
      `UPDATE arrival_pins SET is_used = true WHERE job_id = $1 AND pin = $2`,
      [jobId, pin]
    );

    // Update job status
    await client.query(
      `UPDATE jobs SET job_status = 'arrived', updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    // Create base fee billing
    const baseFee = 2500; // Configurable
    await client.query(
      `INSERT INTO job_billing (job_id, base_fee, billing_status)
       VALUES ($1, $2, 'base_charged')`,
      [jobId, baseFee]
    );

    // Create escrow hold for base fee
    await client.query(
      `INSERT INTO escrow_transactions (job_id, client_id, artisan_id, amount, transaction_type, status)
       SELECT $1, $2, artisan_id, $3, 'base_fee', 'held'
       FROM jobs WHERE id = $1`,
      [jobId, clientId, baseFee]
    );

    await client.query('COMMIT');

    // Notify artisan
    const jobResult = await client.query(
      `SELECT artisan_id FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    emitToArtisan(jobResult.rows[0].artisan_id, 'arrival_confirmed', { jobId });

    res.json({ message: 'Arrival confirmed', baseFee });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Arrival confirmation error:', error);
    res.status(500).json({ error: 'Failed to confirm arrival' });
  } finally {
    client.release();
  }
});

// Start diagnostics timer
router.post('/:jobId/start-diagnostics', authenticateToken, requireRole(['artisan']), async (req, res) => {
  const { jobId } = req.params;

  const client = await pool.connect();
  try {
    const diagnosticsStart = new Date();
    
    await client.query(
      `UPDATE jobs SET diagnostics_started_at = $1, job_status = 'diagnostics' WHERE id = $2`,
      [diagnosticsStart, jobId]
    );

    // Store in Redis for real-time tracking
    await cacheSet(`job:${jobId}:diagnostics_start`, diagnosticsStart.toISOString(), 3600);

    res.json({ message: 'Diagnostics started', startTime: diagnosticsStart });
  } catch (error) {
    console.error('Start diagnostics error:', error);
    res.status(500).json({ error: 'Failed to start diagnostics' });
  } finally {
    client.release();
  }
});

// Stop diagnostics and choose execution mode
router.post('/:jobId/stop-diagnostics', authenticateToken, requireRole(['artisan']), [
  body('executionMode').isIn(['time_based', 'quoted'])
], async (req, res) => {
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
});

// Get job details
router.get('/:jobId', authenticateToken, async (req, res) => {
  const { jobId } = req.params;

  try {
    const jobResult = await pool.query(
      `SELECT j.*, 
              cp.full_legal_name as client_name,
              ap.full_legal_name as artisan_name,
              jb.base_fee, jb.diagnostics_fee, jb.execution_fee, jb.materials_cost, jb.workmanship_cost,
              boq.items as boq_items, boq.status as boq_status
       FROM jobs j
       LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
       LEFT JOIN job_billing jb ON j.id = jb.job_id
       LEFT JOIN bill_of_quantities boq ON j.id = boq.job_id AND boq.version = (
         SELECT MAX(version) FROM bill_of_quantities WHERE job_id = j.id
       )
       WHERE j.id = $1`,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(jobResult.rows[0]);
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to get job details' });
  }
});

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

module.exports = router;