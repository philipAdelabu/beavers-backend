const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class LocationRepository {
  /**
   * Track artisan location
   * @param {Object} locationData - Location data
   * @returns {Promise<Object>} Created location record
   */
  static async trackLocation(locationData) {
    const { artisanId, jobId, latitude, longitude, heading, speed, accuracy } = locationData;
    
    const result = await pool.query(
      `INSERT INTO location_history 
       (artisan_id, job_id, location, heading, speed, accuracy)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [artisanId, jobId || null, JSON.stringify({ latitude, longitude }), heading, speed, accuracy]
    );
    
    return result.rows[0];
  }

  /**
   * Get artisan current location
   * @param {string} artisanId - Artisan ID
   * @returns {Promise<Object|null>} Current location or null
   */
  static async getCurrentLocation(artisanId) {
    const result = await pool.query(
      `SELECT location, timestamp, heading, speed
       FROM location_history
       WHERE artisan_id = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [artisanId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get job location history
   * @param {string} jobId - Job ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Location history
   */
  static async getJobLocationHistory(jobId, filters = {}) {
    const { startTime, endTime, page = 1, limit = 100 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT location, timestamp, heading, speed, accuracy
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
    
    query += ` ORDER BY timestamp ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM location_history WHERE job_id = $1
      ${startTime ? 'AND timestamp >= $2' : ''}
      ${endTime ? `AND timestamp <= $${startTime ? 3 : 2}` : ''}
    `;
    const countParams = [jobId];
    if (startTime) countParams.push(startTime);
    if (endTime) countParams.push(endTime);
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      locations: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Get artisan location history
   * @param {string} artisanId - Artisan ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Location history
   */
  static async getArtisanLocationHistory(artisanId, filters = {}) {
    const { startDate, endDate, limit = 100 } = filters;
    
    let query = `
      SELECT location, timestamp, job_id
      FROM location_history
      WHERE artisan_id = $1
    `;
    const params = [artisanId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND DATE(timestamp) >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND DATE(timestamp) <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Create geofence for job
   * @param {string} jobId - Job ID
   * @param {number} centerLat - Center latitude
   * @param {number} centerLng - Center longitude
   * @param {number} radius - Radius in meters
   * @param {number} expirationHours - Expiration in hours
   * @returns {Promise<Object>} Created geofence
   */
  static async createGeofence(jobId, centerLat, centerLng, radius = 100, expirationHours = 2) {
    const result = await pool.query(
      `INSERT INTO geofences (job_id, center, radius, expires_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, NOW() + INTERVAL '${expirationHours} hours')
       RETURNING id, job_id, ST_X(center::geometry) as longitude, ST_Y(center::geometry) as latitude, radius, expires_at`,
      [jobId, centerLng, centerLat, radius]
    );
    
    return result.rows[0];
  }

  /**
   * Check if point is within geofence
   * @param {string} jobId - Job ID
   * @param {number} artisanLat - Artisan latitude
   * @param {number} artisanLng - Artisan longitude
   * @returns {Promise<Object>} Geofence check result
   */
  static async checkGeofence(jobId, artisanLat, artisanLng) {
    const result = await pool.query(
      `SELECT 
         ST_DWithin(
           center,
           ST_SetSRID(ST_MakePoint($1, $2), 4326),
           radius
         ) as within_geofence,
         ST_Distance(
           center,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)
         ) as distance,
         radius
       FROM geofences
       WHERE job_id = $3 AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [artisanLng, artisanLat, jobId]
    );
    
    if (result.rows.length === 0) {
      return { within_geofence: false, distance: null, radius: null };
    }
    
    return result.rows[0];
  }

  /**
   * Record geofence check
   * @param {string} geofenceId - Geofence ID
   * @param {number} artisanLat - Artisan latitude
   * @param {number} artisanLng - Artisan longitude
   * @param {number} distance - Distance from center
   * @param {boolean} withinGeofence - Whether within geofence
   * @returns {Promise<Object>} Created check record
   */
  static async recordGeofenceCheck(geofenceId, artisanLat, artisanLng, distance, withinGeofence) {
    const result = await pool.query(
      `INSERT INTO geofence_checks (geofence_id, artisan_lat, artisan_lng, distance, within_geofence)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [geofenceId, artisanLat, artisanLng, distance, withinGeofence]
    );
    
    return result.rows[0];
  }

  /**
   * Get geofence checks history
   * @param {string} jobId - Job ID
   * @param {number} limit - Limit
   * @returns {Promise<Array>} Geofence check history
   */
  static async getGeofenceHistory(jobId, limit = 100) {
    const result = await pool.query(
      `SELECT gc.*, g.center, g.radius
       FROM geofence_checks gc
       JOIN geofences g ON gc.geofence_id = g.id
       WHERE g.job_id = $1
       ORDER BY gc.checked_at DESC
       LIMIT $2`,
      [jobId, limit]
    );
    
    return result.rows;
  }

  /**
   * Create arrival PIN
   * @param {string} jobId - Job ID
   * @param {string} pin - PIN code
   * @returns {Promise<Object>} Created PIN record
   */
  static async createArrivalPIN(jobId, pin) {
    const result = await pool.query(
      `INSERT INTO arrival_pins (job_id, pin, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')
       ON CONFLICT (job_id) DO UPDATE 
       SET pin = EXCLUDED.pin, expires_at = NOW() + INTERVAL '30 minutes', is_used = false
       RETURNING *`,
      [jobId, pin]
    );
    
    return result.rows[0];
  }

  /**
   * Verify arrival PIN
   * @param {string} jobId - Job ID
   * @param {string} pin - PIN code
   * @returns {Promise<boolean>} Whether PIN is valid
   */
  static async verifyArrivalPIN(jobId, pin) {
    const result = await pool.query(
      `SELECT id FROM arrival_pins 
       WHERE job_id = $1 AND pin = $2 AND is_used = false AND expires_at > NOW()`,
      [jobId, pin]
    );
    
    if (result.rows.length > 0) {
      // Mark PIN as used
      await pool.query(
        `UPDATE arrival_pins SET is_used = true WHERE job_id = $1`,
        [jobId]
      );
      return true;
    }
    
    return false;
  }

  /**
   * Get active artisans count
   * @returns {Promise<number>} Active artisans count
   */
  static async getActiveArtisansCount() {
    const result = await pool.query(
      `SELECT COUNT(*) FROM artisan_profiles 
       WHERE is_available = true AND last_location_update > NOW() - INTERVAL '10 minutes'`
    );
    
    return parseInt(result.rows[0].count);
  }

  /**
   * Get distance traveled by artisan
   * @param {string} artisanId - Artisan ID
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<number>} Distance in meters
   */
  static async getDistanceTraveled(artisanId, startDate = null, endDate = null) {
    let query = `
      SELECT location, timestamp
      FROM location_history
      WHERE artisan_id = $1
    `;
    const params = [artisanId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND timestamp >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND timestamp <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY timestamp ASC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }
}

module.exports = LocationRepository;