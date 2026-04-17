const { pool } = require('../config/database');

class Location {
  static async trackLocation(locationData) {
    const { artisanId, jobId, latitude, longitude, heading, speed, accuracy } = locationData;
    
    const result = await pool.query(
      `INSERT INTO location_history 
       (artisan_id, job_id, location, heading, speed, accuracy)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [artisanId, jobId, JSON.stringify({ latitude, longitude }), heading, speed, accuracy]
    );
    
    return result.rows[0];
  }

  static async getArtisanCurrentLocation(artisanId) {
    const result = await pool.query(
      `SELECT location, timestamp, heading, speed
       FROM location_history
       WHERE artisan_id = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [artisanId]
    );
    return result.rows[0];
  }

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
      limit
    };
  }

  static async getArtisanLocationHistory(artisanId, filters = {}) {
    const { startDate, endDate, page = 1, limit = 100 } = filters;
    const offset = (page - 1) * limit;
    
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
    
    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return {
      locations: result.rows,
      page,
      limit
    };
  }

  static async getNearbyArtisans(latitude, longitude, radius = 5, category = null) {
    let query = `
      SELECT ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, 
             ap.star_rating, ap.completion_rate,
             lh.location, lh.timestamp,
             ST_Distance(
               ST_SetSRID(ST_MakePoint($1, $2), 4326),
               ST_SetSRID(ST_MakePoint(
                 (lh.location->>'longitude')::float,
                 (lh.location->>'latitude')::float
               ), 4326)
             ) as distance
      FROM location_history lh
      JOIN artisan_profiles ap ON lh.artisan_id = ap.user_id
      WHERE lh.timestamp > NOW() - INTERVAL '5 minutes'
        AND ap.is_available = true
        AND ap.monthly_fee_status = 'paid'
    `;
    
    const params = [longitude, latitude];
    let paramIndex = 3;
    
    if (category) {
      query += ` AND ap.skill_category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    query += ` HAVING distance <= $${paramIndex} * 1000`;
    params.push(radius);
    
    query += ` ORDER BY distance ASC, ap.tier_level DESC, ap.star_rating DESC
               LIMIT 20`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async updateArtisanLocation(artisanId, latitude, longitude) {
    const result = await pool.query(
      `UPDATE artisan_profiles 
       SET current_location = $1, last_location_update = NOW()
       WHERE user_id = $2
       RETURNING *`,
      [JSON.stringify({ latitude, longitude }), artisanId]
    );
    return result.rows[0];
  }

  static async getArtisanTravelPath(jobId) {
    const result = await pool.query(
      `SELECT location, timestamp
       FROM location_history
       WHERE job_id = $1
       ORDER BY timestamp ASC`,
      [jobId]
    );
    
    if (result.rows.length < 2) return null;
    
    // Calculate path statistics
    const locations = result.rows;
    const startLocation = locations[0].location;
    const endLocation = locations[locations.length - 1].location;
    const startTime = new Date(locations[0].timestamp);
    const endTime = new Date(locations[locations.length - 1].timestamp);
    const duration = (endTime - startTime) / 1000 / 60; // minutes
    
    return {
      startLocation,
      endLocation,
      startTime,
      endTime,
      duration,
      waypoints: locations.map(l => l.location)
    };
  }

  static async getActiveArtisans() {
    const result = await pool.query(
      `SELECT ap.user_id, ap.full_legal_name, ap.skill_category, 
              ap.tier_level, ap.star_rating, ap.current_location,
              lh.timestamp as last_update
       FROM artisan_profiles ap
       JOIN location_history lh ON ap.user_id = lh.artisan_id
       WHERE ap.is_available = true
         AND ap.monthly_fee_status = 'paid'
         AND lh.timestamp > NOW() - INTERVAL '10 minutes'
       GROUP BY ap.user_id, lh.timestamp
       ORDER BY ap.tier_level DESC, ap.star_rating DESC`,
      []
    );
    return result.rows;
  }

  static async createGeofence(jobId, centerLat, centerLng, radius = 100) {
    const result = await pool.query(
      `INSERT INTO geofences (job_id, center, radius)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4)
       RETURNING *`,
      [jobId, centerLng, centerLat, radius]
    );
    return result.rows[0];
  }

  static async checkInGeofence(jobId, artisanLat, artisanLng) {
    const result = await pool.query(
      `SELECT ST_DWithin(
         center,
         ST_SetSRID(ST_MakePoint($1, $2), 4326),
         radius
       ) as within_geofence
       FROM geofences
       WHERE job_id = $3`,
      [artisanLng, artisanLat, jobId]
    );
    return result.rows[0]?.within_geofence || false;
  }

  static async getDistanceTraveled(jobId) {
    const result = await pool.query(
      `SELECT location, timestamp
       FROM location_history
       WHERE job_id = $1
       ORDER BY timestamp ASC`,
      [jobId]
    );
    
    if (result.rows.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1].location;
      const curr = result.rows[i].location;
      
      const distance = this.calculateDistance(
        prev.latitude, prev.longitude,
        curr.latitude, curr.longitude
      );
      totalDistance += distance;
    }
    
    return totalDistance;
  }

  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c; // Distance in meters
  }
}

module.exports = Location;