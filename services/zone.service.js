const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet, cacheDel, cacheGetMultiple } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const LogService = require('./log.services');
const { camelToSnake } = require('../utils/string.utils');

class ZoneService {
  // ==================== Zone Management ====================

  /*
      await this.logAdminActivity(userId, isActive ? 'user_activated' : 'user_suspended', 
      { userId, reason, status: isActive ? 'active' : 'suspended' });

  */
  
  /**
   * Create a new zone
   * @param {Object} zoneData - Zone data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Created zone
   */
  static async createZone(zoneData, adminId) {
    const {
      name,
      description,
      coordinates,
      centerLatitude,
      centerLongitude,
      radiusKm,
      pricingMultiplier,
      deliveryFee,
      minOrderAmount,
      zoneCode,
      displayOrder
    } = zoneData;
    
    const result = await pool.query(
      `INSERT INTO zones (
        name, description, coordinates, center_latitude, center_longitude,
        radius_km, pricing_multiplier, delivery_fee, min_order_amount,
        zone_code, display_order, created_by, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
      RETURNING *`,
      [
        name,
        description,
        JSON.stringify(coordinates),
        centerLatitude || null,
        centerLongitude || null,
        radiusKm || null,
        pricingMultiplier || 1.0,
        deliveryFee || 0,
        minOrderAmount || 0,
        zoneCode || null,
        displayOrder || 0,
        adminId
      ]
    );

    await LogService.logAdminActivity(adminId, 'zone_created', { adminId, zoneData });
    
    await this.clearZoneCache();
    
    logger.info(`Zone created: ${name} by admin ${adminId}`);
    
    return result.rows[0];
  }
  
  /**
   * Get all zones
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Zones with pagination
   */
  static async getAllZones(filters = {}) {
    const { isActive, page = 1, limit = 20, search } = filters;
    const offset = (page - 1) * limit;
    
    const cacheKey = `zones:all:${isActive}:${page}:${limit}:${search || ''}`;
    let cached = await cacheGet(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    let query = `
      SELECT z.*,
             u1.email as created_by_email,
             u2.email as updated_by_email
      FROM zones z
      LEFT JOIN users u1 ON z.created_by = u1.id
      LEFT JOIN users u2 ON z.updated_by = u2.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (isActive !== undefined) {
      query += ` AND z.is_active = $${paramIndex}`;
      params.push(isActive);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (z.name ILIKE $${paramIndex} OR z.zone_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY z.display_order ASC, z.name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM zones
      WHERE 1=1
      ${isActive !== undefined ? `AND is_active = ${isActive}` : ''}
      ${search ? `AND (name ILIKE '%${search}%' OR zone_code ILIKE '%${search}%')` : ''}
    `;
    const countResult = await pool.query(countQuery);
    
    const response = {
      zones: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
    
    await cacheSet(cacheKey, response, 3600);
    
    return response;
  }
  
  /**
   * Get active zones (cached for frontend)
   * @returns {Promise<Array>} Active zones
   */
  static async getActiveZones() {
    const cacheKey = 'zones:active';
    let zones = await cacheGet(cacheKey);
    
    if (!zones) {
      const result = await pool.query(
        `SELECT * FROM zones WHERE is_active = true ORDER BY display_order ASC, name ASC`
      );
      zones = result.rows;
      await cacheSet(cacheKey, zones, 3600);
    }
    
    return zones;
  }
  
  /**
   * Get zone by ID
   * @param {string} zoneId - Zone ID
   * @returns {Promise<Object>} Zone
   */
  static async getZoneById(zoneId) {
    const cacheKey = `zone:${zoneId}`;
    let zone = await cacheGet(cacheKey);
    
    if (!zone) {
      const result = await pool.query(
        `SELECT z.*,
                u1.email as created_by_email,
                u2.email as updated_by_email
         FROM zones z
         LEFT JOIN users u1 ON z.created_by = u1.id
         LEFT JOIN users u2 ON z.updated_by = u2.id
         WHERE z.id = $1`,
        [zoneId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Zone not found');
      }
      
      zone = result.rows[0];
      await cacheSet(cacheKey, zone, 3600);
    }
    
    return zone;
  }
  
  /**
   * Get zone by code
   * @param {string} zoneCode - Zone code
   * @returns {Promise<Object>} Zone
   */
  static async getZoneByCode(zoneCode) {
    const result = await pool.query(
      `SELECT * FROM zones WHERE zone_code = $1 AND is_active = true`,
      [zoneCode]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Zone not found');
    }
    
    return result.rows[0];
  }
  
  /**
   * Update zone
   * @param {string} zoneId - Zone ID
   * @param {Object} updateData - Update data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Updated zone
   */
  static async updateZone(zoneId, updateData, adminId) {
    const allowedFields = [
      'name', 'description', 'coordinates', 'center_latitude', 'center_longitude',
      'radius_km', 'pricing_multiplier', 'delivery_fee', 'min_order_amount',
      'zone_code', 'display_order', 'is_active'
    ];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [k, value] of Object.entries(updateData)) {
        const key = camelToSnake(k);
      if (allowedFields.includes(key)) {
        if (key === 'coordinates' && value) {
          setClause.push(`${key} = $${paramIndex}::jsonb`);
          values.push(JSON.stringify(value));
        } else {
          setClause.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) {
      throw new AppError(400, 'No valid fields to update');
    }
    
    values.push(adminId, zoneId);
    const query = `
      UPDATE zones 
      SET ${setClause.join(', ')}, updated_by = $${paramIndex}, updated_at = NOW()
      WHERE id = $${paramIndex + 1}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Zone not found');
    }
    
    await this.clearZoneCache();
    
    logger.info(`Zone updated: ${zoneId} by admin ${adminId}`);
     await LogService.logAdminActivity(adminId, 'zone_updated', { adminId, updateData });
    
    return result.rows[0];
  }
  
  /**
   * Delete zone (soft delete)
   * @param {string} zoneId - Zone ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Deleted zone
   */
  static async deleteZone(zoneId, adminId) {
    const result = await pool.query(
      `UPDATE zones 
       SET is_active = false, updated_by = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [adminId, zoneId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Zone not found');
    }
    
    await this.clearZoneCache();
    
    logger.info(`Zone deleted: ${zoneId} by admin ${adminId}`);
    
    return result.rows[0];
  }
  
  // ==================== Zone Lookup ====================
  
  /**
   * Find zone by coordinates (point-in-polygon)
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @returns {Promise<Object|null>} Zone or null
   */
  static async findZoneByCoordinates(latitude, longitude) {
    const zones = await this.getActiveZones();
    
    for (const zone of zones) {
      if (this.isPointInPolygon(latitude, longitude, zone.coordinates)) {
        return zone;
      }
    }
    
    return null;
  }
  
  /**
   * Check if point is inside polygon
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {Array} polygon - Array of {lat, lng} points
   * @returns {boolean} True if inside
   */
  static isPointInPolygon(lat, lng, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;
      
      const intersect = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  
  /**
   * Get zone pricing multiplier for a location
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @returns {Promise<Object>} Zone info with pricing
   */
  static async getZonePricing(latitude, longitude) {
    const zone = await this.findZoneByCoordinates(latitude, longitude);
    
    if (zone) {
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        zoneCode: zone.zone_code,
        pricingMultiplier: parseFloat(zone.pricing_multiplier),
        deliveryFee: parseFloat(zone.delivery_fee),
        minOrderAmount: parseFloat(zone.min_order_amount),
        isInZone: true
      };
    }
    
    // Default pricing if no zone found
    return {
      zoneId: null,
      zoneName: 'Outside Service Zone',
      zoneCode: null,
      pricingMultiplier: 1.0,
      deliveryFee: 0,
      minOrderAmount: 0,
      isInZone: false
    };
  }
  
  /**
   * Get nearby zones within radius
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @param {number} radius - Radius in km
   * @returns {Promise<Array>} Nearby zones
   */
  static async getNearbyZones(latitude, longitude, radius = 10) {
    const zones = await this.getActiveZones();
    const nearby = [];
    
  
    // Calculate distance from center point using Haversine formula
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Earth's radius in km
      const dLat = this.deg2rad(lat2 - lat1);
      const dLon = this.deg2rad(lon2 - lon1);
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };
    
    for (const zone of zones) {
      if (zone.center_latitude && zone.center_longitude) {
        const distance = calculateDistance(
          latitude, longitude,
          zone.center_latitude, zone.center_longitude
        );

   
        if (distance <= radius) {
          nearby.push({
            ...zone,
            distance: distance
          });
        }
      }
    }
    
    return nearby.sort((a, b) => a.distance - b.distance);
  }
  
  /**
   * Convert degrees to radians
   */
  static deg2rad(deg) {
    return deg * (Math.PI / 180);
  }
  
  // ==================== Cache Management ====================
  
  /**
   * Clear zone cache
   */
  static async clearZoneCache() {
    await cacheDel('zones:active');
    // Clear all zone cache keys
    const keys = await cacheGetMultiple('zones:*');
    if (keys.length > 0) {
      await cacheDel(keys);
    }
    const zoneKeys = await cacheGetMultiple('zone:*');
    if (zoneKeys.length > 0) {
      await cacheDel(zoneKeys);
    }
    logger.info('Zone cache cleared');
  }
  
  // ==================== Statistics ====================
  
  /**
   * Get zone statistics
   * @returns {Promise<Object>} Statistics
   */
  static async getZoneStatistics() {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_zones,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_zones,
        AVG(pricing_multiplier) as avg_pricing_multiplier,
        SUM(CASE WHEN delivery_fee > 0 THEN 1 ELSE 0 END) as zones_with_delivery_fee
      FROM zones
    `);
    
    const zoneJobStats = await pool.query(`
      SELECT 
        z.id,
        z.name,
        z.zone_code,
        COUNT(DISTINCT j.id) as job_count,
        COALESCE(SUM(jb.total_amount), 0) as total_revenue
      FROM zones z
      LEFT JOIN jobs j ON j.location ? 'zone_id' AND j.location->>'zone_id' = z.id::text
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.created_at > NOW() - INTERVAL '30 days'
      GROUP BY z.id, z.name, z.zone_code
      ORDER BY job_count DESC
    `);
    
    return {
      summary: stats.rows[0],
      zonePerformance: zoneJobStats.rows
    };
  }
}

module.exports = ZoneService;