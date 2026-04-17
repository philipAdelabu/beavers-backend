// routes/location.routes.js
const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const { addArtisanLocation, removeArtisanLocation, cacheSet } = require('../config/redis');
const { emitLocationUpdate } = require('../socket/socket.handlers');
const router = express.Router();

// Update artisan location (real-time)
router.post('/update', authenticateToken, requireRole(['artisan']), async (req, res) => {
  const { latitude, longitude, heading, speed, jobId } = req.body;
  const artisanId = req.user.id;

  try {
    // Update Redis for real-time queries
    await addArtisanLocation(artisanId, longitude, latitude);

    // Store in PostgreSQL for history
    await pool.query(
      `INSERT INTO location_history (artisan_id, job_id, location)
       VALUES ($1, $2, $3)`,
      [artisanId, jobId || null, JSON.stringify({ latitude, longitude, heading, speed })]
    );

    // Update current location in artisan profile
    await pool.query(
      `UPDATE artisan_profiles 
       SET current_location = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [JSON.stringify({ latitude, longitude, heading, speed }), artisanId]
    );

    // If there's an active job, emit location to client
    if (jobId) {
      const jobResult = await pool.query(
        `SELECT client_id FROM jobs WHERE id = $1 AND artisan_id = $2`,
        [jobId, artisanId]
      );

      if (jobResult.rows.length > 0) {
        emitLocationUpdate(jobResult.rows[0].client_id, {
          artisanId,
          jobId,
          location: { latitude, longitude, heading, speed },
          timestamp: new Date()
        });
      }
    }

    // Cache current location for quick access
    await cacheSet(`location:${artisanId}`, { latitude, longitude, heading, speed, timestamp: new Date() }, 60);

    res.json({ message: 'Location updated' });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Get artisan location (for client)
router.get('/artisan/:artisanId', authenticateToken, async (req, res) => {
  const { artisanId } = req.params;

  try {
    // Check if client has an active job with this artisan
    const jobResult = await pool.query(
      `SELECT id FROM jobs 
       WHERE client_id = $1 AND artisan_id = $2 
       AND job_status IN ('accepted', 'arrived', 'diagnostics', 'execution')`,
      [req.user.id, artisanId]
    );

    if (jobResult.rows.length === 0 && req.user.user_type !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to view this location' });
    }

    // Get latest location from cache or DB
    const cachedLocation = await cacheGet(`location:${artisanId}`);
    
    if (cachedLocation) {
      return res.json(cachedLocation);
    }

    // Fallback to database
    const locationResult = await pool.query(
      `SELECT location, timestamp 
       FROM location_history 
       WHERE artisan_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [artisanId]
    );

    if (locationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Location not available' });
    }

    res.json(locationResult.rows[0].location);
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({ error: 'Failed to get location' });
  }
});

// Get location history for a job
router.get('/history/:jobId', authenticateToken, async (req, res) => {
  const { jobId } = req.params;
  const { startTime, endTime } = req.query;

  try {
    // Verify authorization
    const jobResult = await pool.query(
      `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];
    if (job.client_id !== req.user.id && job.artisan_id !== req.user.id && req.user.user_type !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    let query = `
      SELECT location, timestamp 
      FROM location_history 
      WHERE job_id = $1
    `;
    const params = [jobId];
    let paramIndex = 2;

    if (startTime) {
      query += ` AND timestamp >= $${paramIndex}`;
      params.push(startTime);
      paramIndex++;
    }

    if (endTime) {
      query += ` AND timestamp <= $${paramIndex}`;
      params.push(endTime);
      paramIndex++;
    }

    query += ` ORDER BY timestamp ASC`;

    const historyResult = await pool.query(query, params);
    res.json(historyResult.rows);
  } catch (error) {
    console.error('Get location history error:', error);
    res.status(500).json({ error: 'Failed to get location history' });
  }
});

// Get nearby artisans (for client)
router.get('/nearby', authenticateToken, requireRole(['client']), async (req, res) => {
  const { longitude, latitude, radius = 5, category } = req.query;

  try {
    const nearbyArtisans = await getNearbyArtisans(parseFloat(longitude), parseFloat(latitude), parseFloat(radius));
    
    const artisans = [];
    for (const [artisanId, distance] of nearbyArtisans) {
      const artisanResult = await pool.query(
        `SELECT ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, ap.star_rating,
                ap.completion_rate, ap.trust_score
         FROM artisan_profiles ap
         JOIN users u ON ap.user_id = u.id
         WHERE ap.user_id = $1 
         AND ap.is_available = true 
         AND u.is_active = true
         AND ap.monthly_fee_status = 'paid'
         ${category ? 'AND ap.skill_category = $2' : ''}`,
        category ? [artisanId, category] : [artisanId]
      );

      if (artisanResult.rows.length > 0) {
        artisans.push({
          ...artisanResult.rows[0],
          distance: parseFloat(distance)
        });
      }
    }

    res.json(artisans);
  } catch (error) {
    console.error('Get nearby artisans error:', error);
    res.status(500).json({ error: 'Failed to get nearby artisans' });
  }
});

// Set artisan availability
router.post('/availability', authenticateToken, requireRole(['artisan']), async (req, res) => {
  const { isAvailable, currentLocation } = req.body;
  const artisanId = req.user.id;

  try {
    await pool.query(
      `UPDATE artisan_profiles 
       SET is_available = $1, updated_at = NOW()
       ${currentLocation ? ', current_location = $3' : ''}
       WHERE user_id = $2`,
      currentLocation ? [isAvailable, artisanId, JSON.stringify(currentLocation)] : [isAvailable, artisanId]
    );

    if (!isAvailable) {
      await removeArtisanLocation(artisanId);
    } else if (currentLocation) {
      await addArtisanLocation(artisanId, currentLocation.longitude, currentLocation.latitude);
    }

    res.json({ message: `Availability set to ${isAvailable}` });
  } catch (error) {
    console.error('Set availability error:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

module.exports = router;