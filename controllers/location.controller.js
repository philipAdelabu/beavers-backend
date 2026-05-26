const { validationResult } = require('express-validator');
const LocationService = require('../services/location.service');
const GeofenceService = require('../services/geofence.service');
const { sendSuccess, sendError } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const ArtisanService = require('../services/artisan.service');

class LocationController {
  static async updateLocation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
 
    try { 
      const { latitude, longitude, heading, speed, accuracy, jobId } = req.body;
      const result = await LocationService.updateArtisanLocation(req.user.id, {
        latitude, longitude, heading, speed, accuracy, jobId
      });
      sendSuccess(res, result, 'Location updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getArtisanLocation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const location = await LocationService.getArtisanCurrentLocation(req.params.artisanId, req.user.id);
      sendSuccess(res, location, 'Artisan location retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getNearbyArtisans(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
   
    try {
      const { longitude, latitude, category, radius} = req.query;
     
      const google_map_radius = radius || process.env.GOOGLE_MAP_RADIUS;

      const artisans = await LocationService.getNearbyArtisans(
        category, 
        parseFloat(latitude), 
        parseFloat(longitude), 
        parseFloat(google_map_radius), 
      );
      
      sendSuccess(res, artisans, 'Nearby artisans retrieved successfully');
    } catch (error) {
   
      next(error);
    }
  }


  static async getLocationHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { startTime, endTime, page = 1, limit = 100 } = req.query;
      const history = await LocationService.getJobLocationHistory(
        req.params.jobId, 
        req.user.id, 
        req.user.user_type,
        { startTime, endTime, page, limit }
      );
      sendSuccess(res, history, 'Location history retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve location history', error.statusCode || 500);
      next(error);
    }
  }

  static async calculateRoute(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const routes = await LocationService.calculateRouteToJob(req.user.id, req.params.jobId);
      sendSuccess(res, routes, 'Route calculated successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to calculate route', error.statusCode || 500); 
      next(error);
    }
  }

  static async getETA(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const eta = await LocationService.getArtisanETA(req.params.jobId);
      sendSuccess(res, eta, 'ETA retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve ETA', error.statusCode || 500); 
      next(error);
    }
  }

  static async generateArrivalPIN(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await LocationService.generateArrivalPIN(req.params.jobId, req.user.id);
      sendSuccess(res, result, 'Arrival PIN generated successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to generate Arrival PIN', error.statusCode || 500); 
      next(error);
    }
  }

  static async verifyArrivalPIN(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await LocationService.verifyArrivalPIN(req.params.jobId, req.user.id, req.body.pin);
      sendSuccess(res, result, 'PIN verified successfully');
    } catch (error) {
      next(error);
    }
  }

  static async validateGeofence(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { latitude, longitude } = req.body;
      const result = await GeofenceService.validateArrival(req.params.jobId, latitude, longitude);
      sendSuccess(res, result, 'Geofence validation completed');
    } catch (error) {
      next(error);
    }
  }

  static async setAvailability(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { isAvailable, location } = req.body;
      const result = await ArtisanService.updateAvailability(req.user.id, isAvailable, location);
      sendSuccess(res, result, `Availability set to ${isAvailable}`);
    } catch (error) {
      next(error);
    }
  }

  static async getActiveArtisans(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { category } = req.query;
      const artisans = await LocationService.getActiveArtisans(category);
      sendSuccess(res, artisans, 'Active artisans retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getDistanceTraveled(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { startDate, endDate } = req.query;
      const distance = await LocationService.getDistanceTraveled(req.params.artisanId, startDate, endDate);
      sendSuccess(res, { distance }, 'Distance traveled retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getTrafficConditions(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { latitude, longitude, radius = 5 } = req.query;
      const traffic = await LocationService.getTrafficConditions(
        parseFloat(latitude), 
        parseFloat(longitude), 
        parseFloat(radius)
      );
      sendSuccess(res, traffic, 'Traffic conditions retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = LocationController;