const { pool } = require('../config/database');
const { redis, addArtisanLocation, getNearbyArtisans, cacheSet, cacheGet } = require('../config/redis');
const JobService = require('./job.service');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const { calculateDistance, calculateETA, calculateTravelPath } = require('../utils/geo.utils');
const { emitLocationUpdate } = require('../socket/socket.handlers');
const NotificationService = require('./notification.service');

class LocationService {
  static async updateArtisanLocation(artisanId, locationData) {
    const { latitude, longitude, heading, speed, accuracy, jobId } = locationData;
    
    try {
      // Update Redis for real-time queries
      await addArtisanLocation(artisanId, longitude, latitude);
      
      // Store in PostgreSQL for history
      await pool.query(
        `INSERT INTO location_history (artisan_id, job_id, location, heading, speed, accuracy)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [artisanId, jobId || null, JSON.stringify({ latitude, longitude }), heading, speed, accuracy]
      );
      
      // Update current location in artisan profile
      await pool.query(
        `UPDATE artisan_profiles 
         SET current_location = $1, last_location_update = NOW()
         WHERE user_id = $2`,
        [JSON.stringify({ latitude, longitude, heading, speed }), artisanId]
      );
      
      // Cache current location
      await cacheSet(`location:current:${artisanId}`, {
        latitude,
        longitude,
        heading, 
        speed,
        timestamp: new Date().toISOString()
      }, 60);

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
                timestamp: new Date().toISOString(),
              });
            }
          }
      
      logger.debug(`Location updated for artisan ${artisanId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('Location update error:', error);
      throw error;
    }
  }
  
  static async getArtisanCurrentLocation(artisanId, clientId = null) {
    // Check cache first
    let location = await cacheGet(`location:current:${artisanId}`);

    console.log("artisan id: " + artisanId);
    
    if (!location) {
      // Get from database
      const result = await pool.query(
        `SELECT current_location, last_location_update
         FROM artisan_profiles
         WHERE user_id = $1`,
        [artisanId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Artisan not found');
      }
      
      location = result.rows[0].current_location;
      
      if (location) {
        await cacheSet(`location:current:${artisanId}`, location, 60);
      }
    }
    
    // If client is requesting, verify they have an active job with this artisan
    if (clientId) {
      const jobResult = await pool.query(
        `SELECT id FROM jobs 
         WHERE client_id = $1 AND artisan_id = $2 
         AND job_status IN ('accepted', 'arrived', 'diagnostics', 'execution')`,
        [clientId, artisanId]
      );
      
      if (jobResult.rows.length === 0) {
        throw new AppError(403, 'Not authorized to view this location');
      }
    }
    
    return location;
  }
  
  static async getNearbyArtisans(category, latitude, longitude, radius = 20) {
    const artisansWithDistance = await JobService.findNearbyArtisans(category, { longitude, latitude }, radius)
    return artisansWithDistance;
  }
  
  static async getJobLocationHistory(jobId, userId, userType) {
    // Verify authorization
    const jobResult = await pool.query(
      `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    const job = jobResult.rows[0];
    
    if (job.client_id !== userId && job.artisan_id !== userId && userType !== 'admin') {
      throw new AppError(403, 'Not authorized to view this location history');
    }
    
    const result = await pool.query(
      `SELECT location, timestamp, heading, speed
       FROM location_history
       WHERE job_id = $1
       ORDER BY timestamp ASC`,
      [jobId]
    );
    
    return result.rows;
  }
  
  static async getArtisanLocationHistory(artisanId, startDate = null, endDate = null, limit = 100) {
    let query = `
      SELECT location, timestamp, job_id
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
    
    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    return result.rows;
  }
  
  static async calculateRouteToJob(artisanId, jobId) {
    // Get artisan current location
    const artisanLocation = await this.getArtisanCurrentLocation(artisanId);
    
    if (!artisanLocation) {
      throw new AppError(404, 'Artisan location not available');
    }
    
    // Get job location
    const jobResult = await pool.query(
      `SELECT location FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    const jobLocation = jobResult.rows[0].location;
    
    // Calculate route using Google Maps API
    const routes = await calculateTravelPath(
      { latitude: artisanLocation.latitude, longitude: artisanLocation.longitude },
      { latitude: jobLocation.latitude, longitude: jobLocation.longitude }
    );
    
    // Cache the route
    await cacheSet(`route:${artisanId}:${jobId}`, routes, 300); // 5 minutes
    
    return routes;
  }
  
  static async getArtisanETA(jobId) {

    const job = await pool.query(`
        select artisan_id from jobs where id = $1;
      `, [jobId]);

      if(job.rows.length === 0){
        throw new AppError(404, 'Job not found');
      }


      const artisanId = job.rows[0].artisan_id;

   
    // Check cache first
    const cachedETA = await cacheGet(`eta:${artisanId}:${jobId}`);
    
    if (cachedETA) {
      return cachedETA;
    }
    
    // Get artisan current location
    const artisanLocation = await this.getArtisanCurrentLocation(artisanId);
    
    if (!artisanLocation) {
      throw new AppError(404, 'Artisan location not available');
    }
    
    // Get job location
    const jobResult = await pool.query(
      `SELECT location FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    const jobLocation = jobResult.rows[0].location;
    
    // Calculate distance
    const distance = calculateDistance(
      { latitude: artisanLocation.latitude, longitude: artisanLocation.longitude },
      { latitude: jobLocation.latitude, longitude: jobLocation.longitude }
    );
    
    // Calculate ETA (assuming average speed of 30 km/h in city)
    const etaMinutes = calculateETA(distance);
    
    const eta = {
      distance: Math.round(distance),
      etaMinutes,
      etaFormatted: `${etaMinutes} minutes`,
      arrivalTime: new Date(Date.now() + etaMinutes * 60000).toISOString()
    };
    
    // Cache for 1 minute
    await cacheSet(`eta:${artisanId}:${jobId}`, eta, 60);
    
    return eta;
  }
  
  static async validateGeofence(jobId, artisanLatitude, artisanLongitude) {
    const jobResult = await pool.query(
      `SELECT location FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    const jobLocation = jobResult.rows[0].location;
    const distance = calculateDistance(
      { latitude: artisanLatitude, longitude: artisanLongitude },
      { latitude: jobLocation.latitude, longitude: jobLocation.longitude }
    );
    
    const isWithinGeofence = distance <= 100; // 100 meters radius
    
    return {
      isWithinGeofence,
      distance,
      requiredRadius: 100 
    };
  }
  
  static async generateArrivalPIN(jobId, artisanId) {
    // Verify artisan is assigned to this job
    const jobResult = await pool.query(
      `SELECT id FROM jobs WHERE id = $1 AND artisan_id = $2 AND job_status = 'accepted'`,
      [jobId, artisanId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new AppError(403, 'Not authorized to generate PIN for this job');
    }
    
    // Generate 6-digit PIN
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store PIN in database
    await pool.query(
      `INSERT INTO arrival_pins (job_id, pin, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')
       ON CONFLICT (job_id) DO UPDATE SET pin = $2, expires_at = NOW() + INTERVAL '30 minutes', is_used = false`,
      [jobId, pin]
    );
    
    // Send PIN to client
    const clientResult = await pool.query(
      `SELECT cp.user_id, cp.full_legal_name
       FROM jobs j
       JOIN client_profiles cp ON j.client_id = cp.user_id
       WHERE j.id = $1`,
      [jobId]
    );
    
    if (clientResult.rows[0]) {
      await NotificationService.sendPushNotification(
        clientResult.rows[0].user_id,
        'Arrival PIN',
        `Your artisan has arrived. Please provide this PIN: ${pin}`,
        { jobId, pin, type: 'arrival_pin' }
      );
       const user_id = clientResult.rows[0].user_id;
        await NotificationService.storeNotification(
          user_id, 'sms', 'SMS Notification', 
          'Message', `Your artisan has arrived. Please provide this PIN: ${pin}`, 
          {  pin: pin });
    }
    
    logger.info(`Arrival PIN generated for job ${jobId}`);
    
    return { pin, expiresIn: 30 };
  }
  
  static async verifyArrivalPIN(jobId, clientId, pin) {
    const result = await pool.query(
      `SELECT * FROM arrival_pins 
       WHERE job_id = $1 AND pin = $2 AND is_used = false AND expires_at > NOW()`,
      [jobId, pin]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(400, 'Invalid or expired PIN');
    }
    
    // Mark PIN as used
    await pool.query(
      `UPDATE arrival_pins SET is_used = true WHERE job_id = $1`,
      [jobId]
    );
    
    // Update job status
    await pool.query(
      `UPDATE jobs SET job_status = 'arrived', arrived_at = NOW() WHERE id = $1`,
      [jobId]
    );
    
    logger.info(`Arrival PIN verified for job ${jobId}`);
    
    return { verified: true };
  }
  
  static async getActiveArtisans(category = null) {
    let query = `
      SELECT ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, 
             ap.star_rating, ap.current_location, ap.last_location_update
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE ap.is_available = true
        AND u.is_active = true
        AND ap.monthly_fee_status = 'paid'
        AND ap.last_location_update > NOW() - INTERVAL '10 minutes'
    `;
    
    const params = [];
    
    if (category) {
      query += ` AND ap.skill_category = $1`;
      params.push(category);
    }
    
    query += ` ORDER BY ap.tier_level DESC, ap.star_rating DESC`;
    
    const result = await pool.query(query, params);
    
    return result.rows;
  }
  
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
    
    if (result.rows.length < 2) {
      return 0;
    }
    
    let totalDistance = 0;
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1].location;
      const curr = result.rows[i].location;
      
      if (prev && curr) {
        const distance = calculateDistance(
          { latitude: prev.latitude, longitude: prev.longitude },
          { latitude: curr.latitude, longitude: curr.longitude }
        );
        totalDistance += distance;
      }
    }
    
    return totalDistance;
  }
  
  static async getTrafficConditions(latitude, longitude, radius = 5) {
    // This would integrate with a traffic API like Google Maps or TomTom
    // For now, return mock data
    return {
      zone: 'urban',
      congestionLevel: 'moderate',
      averageSpeed: 25, // km/h
      incidents: [],
      timestamp: new Date().toISOString()
    };
  }
  
  static async updateBatchLocations(locations) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const location of locations) {
        await this.updateArtisanLocation(location.artisanId, location);
      }
      
      await client.query('COMMIT');
      
      logger.info(`Batch updated ${locations.length} artisan locations`);
      
      return { updated: locations.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = LocationService;