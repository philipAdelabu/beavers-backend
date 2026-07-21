const ZoneService = require('../services/zone.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class ZoneController {
  // ==================== Zone CRUD ====================
  
  /**
   * Create a new zone
   * @route POST /api/v1/zones
   */
  static async createZone(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const zone = await ZoneService.createZone(req.body, req.user.id);
      sendSuccess(res, zone, 'Zone created successfully', 201);
    } catch (error) {
     sendError(res, error.message || 'Fail to create zone', error.statuCode || 500);
      next(error);
    }
  }
  
  /**
   * Get all zones
   * @route GET /api/v1/zones
   */
  static async getAllZones(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { isActive, page = 1, limit = 20, search } = req.query;
      const result = await ZoneService.getAllZones({ 
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        page: parseInt(page),
        limit: parseInt(limit),
        search
      });
      sendPaginated(res, result.zones, page, limit, result.total, 'Zones retrieved');
    } catch (error) {
      sendError(res, error.message || 'Fail to get all zones', error.statuCode || 500);
      next(error);
    }
  }
  
  /**
   * Get active zones (public)
   * @route GET /api/v1/zones/active
   */
  static async getActiveZones(req, res, next) {
    try {
      const zones = await ZoneService.getActiveZones();
      sendSuccess(res, zones, 'Active zones retrieved');
    } catch (error) {
     sendError(res, error.message || 'Fail to get active zones', error.statuCode || 500);
      next(error);
    }
  }
  
  /**
   * Get zone by ID
   * @route GET /api/v1/zones/:zoneId
   */
  static async getZoneById(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const zone = await ZoneService.getZoneById(req.params.zoneId);
      sendSuccess(res, zone, 'Zone retrieved');
    } catch (error) {
    sendError(res, error.message || 'Fail to get zone', error.statuCode || 500);
      next(error);
    }
  }
  
  /**
   * Update zone
   * @route PUT /api/v1/zones/:zoneId
   */
  static async updateZone(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const zone = await ZoneService.updateZone(req.params.zoneId, req.body, req.user.id);
      sendSuccess(res, zone, 'Zone updated successfully');
    } catch (error) {
     sendError(res, error.message || 'Fail to update zone', error.statuCode || 500);
      next(error);
    }
  }
  
  /**
   * Delete zone (soft delete)
   * @route DELETE /api/v1/zones/:zoneId
   */
  static async deleteZone(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const zone = await ZoneService.deleteZone(req.params.zoneId, req.user.id);
      sendSuccess(res, zone, 'Zone deleted successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to delete zone', error.statuCode || 500);
      next(error);
    }
  }
  
  // ==================== Zone Lookup ====================
  
  /**
   * Find zone by coordinates
   * @route POST /api/v1/zones/lookup
   */
  static async findZoneByCoordinates(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { latitude, longitude } = req.body;
      const zone = await ZoneService.findZoneByCoordinates(latitude, longitude);
      
      if (zone) {
        sendSuccess(res, zone, 'Zone found');
      } else {
        sendSuccess(res, null, 'No zone found for this location');
      }
    } catch (error) {
      sendError(res, error.message || 'Fail to find zone', error.statuCode || 500);
      next(error);
    }
  }
  
  /**
   * Get zone pricing for a location
   * @route POST /api/v1/zones/pricing
   */
  static async getZonePricing(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { latitude, longitude } = req.body;
      const pricing = await ZoneService.getZonePricing(latitude, longitude);
      sendSuccess(res, pricing, 'Zone pricing retrieved');
    } catch (error) {
     sendError(res, error.message || 'Fail to get zone price', error.statuCode || 500);
      next(error);
    }
  }
  
  /**
   * Get nearby zones
   * @route GET /api/v1/zones/nearby
   */
  static async getNearbyZones(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { latitude, longitude, radius = 10 } = req.query;
      const zones = await ZoneService.getNearbyZones(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radius)
      );
      sendSuccess(res, zones, 'Nearby zones retrieved');
    } catch (error) {
    sendError(res, error.message || 'Fail to get nearby zone', error.statuCode || 500);
      next(error);
    }
  }
  
  // ==================== Statistics ====================
  
  /**
   * Get zone statistics
   * @route GET /api/v1/zones/statistics
   */
  static async getZoneStatistics(req, res, next) {
    try {
      const stats = await ZoneService.getZoneStatistics();
      sendSuccess(res, stats, 'Zone statistics retrieved');
    } catch (error) {
      sendError(res, error.message || 'Fail to get zone statistics', error.statuCode || 500);
      next(error);
    }
  }
}

module.exports = ZoneController;