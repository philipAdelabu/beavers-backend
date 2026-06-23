const { pool } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const { calculateDistance } = require('../utils/geo.utils');
const {PRICING, TIMEOUTS, GEOFENCE } = require('../config/constants');

class GeofenceService {
  static async createGeofence(jobId, centerLat, centerLng, radius = 100, expirationHours = 2) {
    const result = await pool.query(
      `INSERT INTO geofences (job_id, center, radius, expires_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, NOW() + INTERVAL '${expirationHours} hours')
       RETURNING id, job_id, ST_X(center::geometry) as longitude, ST_Y(center::geometry) as latitude, radius, expires_at`,
      [jobId, centerLng, centerLat, radius]
    );
    
    await cacheSet(`geofence:job:${jobId}`, result.rows[0], expirationHours * 3600);
    
    logger.info(`Geofence created for job ${jobId}`);
    
    return result.rows[0];
  }
  
  static async checkInGeofence(jobId, artisanLat, artisanLng) {
    // Check cache first
    let geofence = await cacheGet(`geofence:job:${jobId}`);
    
    if (!geofence) {
      const result = await pool.query(
        `SELECT id, job_id, ST_X(center::geometry) as longitude, ST_Y(center::geometry) as latitude, radius, expires_at
         FROM geofences
         WHERE job_id = $1 AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [jobId]
      );
      
      if (result.rows.length === 0) {
        return { withinGeofence: false, error: 'No active geofence found' };
      }
      
      geofence = result.rows[0];
    }
    
    const distance = calculateDistance(
      { latitude: artisanLat, longitude: artisanLng },
      { latitude: geofence.latitude, longitude: geofence.longitude }
    );
    
    const withinGeofence = distance <= geofence.radius;
    
    // Log check
    await pool.query(
      `INSERT INTO geofence_checks (geofence_id, artisan_lat, artisan_lng, distance, within_geofence, checked_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [geofence.id, artisanLat, artisanLng, distance, withinGeofence]
    );
    
    if (withinGeofence) {
      logger.info(`Artisan within geofence for job ${jobId}: ${distance}m`);
    } else {
      logger.debug(`Artisan outside geofence for job ${jobId}: ${distance}m`);
    }
    
    return {
      withinGeofence,
      distance,
      radius: geofence.radius,
      center: { lat: geofence.latitude, lng: geofence.longitude }
    };
  }
  
  static async updateGeofence(jobId, centerLat, centerLng, radius = null) {
    let query = `
      UPDATE geofences 
      SET center = ST_SetSRID(ST_MakePoint($1, $2), 4326),
          updated_at = NOW()
    `;
    const params = [centerLng, centerLat];
    let paramIndex = 3;
    
    if (radius) {
      query += `, radius = $${paramIndex}`;
      params.push(radius);
      paramIndex++;
    }
    
    query += ` WHERE job_id = $${paramIndex} AND expires_at > NOW() RETURNING *`;
    params.push(jobId);
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Geofence not found or expired');
    }
    
    await cacheSet(`geofence:job:${jobId}`, result.rows[0], 7200);
    
    logger.info(`Geofence updated for job ${jobId}`);
    
    return result.rows[0];
  }
  
  static async expireGeofence(jobId) {
    const result = await pool.query(
      `UPDATE geofences 
       SET expires_at = NOW()
       WHERE job_id = $1 AND expires_at > NOW()
       RETURNING *`,
      [jobId]
    );
    
    await cacheDel(`geofence:job:${jobId}`);
    
    logger.info(`Geofence expired for job ${jobId}`);
    
    return result.rows[0];
  }
  
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
  
  static async createZone(zoneData) {
    const { name, coordinates, isActive = true, pricingMultiplier = 1.0 } = zoneData;
    
    const result = await pool.query(
      `INSERT INTO zones (name, coordinates, is_active, pricing_multiplier)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, JSON.stringify(coordinates), isActive, pricingMultiplier]
    );
    
    await cacheDel('zones:all');
    
    logger.info(`Zone created: ${name}`);
    
    return result.rows[0];
  }
  
  static async getZoneByLocation(latitude, longitude) {
    const zones = await this.getAllZones();
    
    for (const zone of zones) {
      if (this.isPointInPolygon(latitude, longitude, zone.coordinates)) {
        return zone;
      }
    }
    
    return null;
  }
  
  static async getAllZones() {
    let zones = await cacheGet('zones:all');
    
    if (!zones) {
      const result = await pool.query(
        `SELECT * FROM zones WHERE is_active = true ORDER BY name ASC`,
        []
      );
      
      zones = result.rows;
      await cacheSet('zones:all', zones, 3600);
    }
    
    return zones;
  }
  
  static isPointInPolygon(lat, lng, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;
      
      const intersect = ((yi > lat) != (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  
  static async getZonePricingMultiplier(latitude, longitude) {
    const zone = await this.getZoneByLocation(latitude, longitude);
    return zone ? zone.pricing_multiplier : 1.0;
  }
  
  static async getGeofenceStats(days = 30) {
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT g.job_id) as jobs_with_geofence,
        COUNT(gc.id) as total_checks,
        COUNT(CASE WHEN gc.within_geofence = true THEN 1 END) as successful_entries,
        AVG(gc.distance) as avg_distance
      FROM geofences g
      LEFT JOIN geofence_checks gc ON g.id = gc.geofence_id
      WHERE g.created_at > NOW() - INTERVAL '${days} days'
    `);
    
    return result.rows[0];
  }
  
  static async autoExpireGeofences() {
    const result = await pool.query(
      `UPDATE geofences 
       SET expires_at = NOW()
       WHERE expires_at < NOW() AND expires_at > NOW() - INTERVAL '1 hour'
       RETURNING job_id`
    );
    
    for (const row of result.rows) {
      await cacheDel(`geofence:job:${row.job_id}`);
    }
    
    logger.info(`Auto-expired ${result.rowCount} geofences`);
    
    return result.rowCount;
  }
  
  static async validateArrival(jobId, artisanLat, artisanLng) {
    const geofenceCheck = await this.checkInGeofence(jobId, artisanLat, artisanLng);
    
    if (!geofenceCheck.withinGeofence) {
      return {
        valid: false,
        message: `You are ${Math.round(geofenceCheck.distance)} meters away from the job location. Please move within ${geofenceCheck.radius} meters.`,
        distance: geofenceCheck.distance,
        requiredDistance: geofenceCheck.radius
      };
    }
    
    return {
      valid: true,
      message: 'You are within the geofence. You can confirm arrival.',
      distance: geofenceCheck.distance
    };
  }
}

module.exports = GeofenceService;