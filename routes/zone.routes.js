const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const ZoneController = require('../controllers/zone.controller');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');

// ==================== Public Routes (No Auth Required) ====================


// Get active zones (public)
router.get('/active', ZoneController.getActiveZones);

// Find zone by coordinates (public)
router.post('/lookup', [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required')
], ZoneController.findZoneByCoordinates);

// Get zone pricing (public)
router.post('/pricing', [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required')
], ZoneController.getZonePricing);

// Get nearby zones (public)
router.get('/nearby', [
  query('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  query('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
  query('radius').optional().isFloat({ min: 0.1, max: 100 }).withMessage('Radius must be between 0.1 and 100 km')
], ZoneController.getNearbyZones);

// ==================== Admin Routes (Auth Required) ====================

// All routes below require authentication and admin role
router.use(authenticateToken);
router.use(requireRole(['admin']));

// Get all zones with filters
router.get('/', [
  query('isActive').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isString()
], ZoneController.getAllZones);

// Get zone by ID
router.get('/:zoneId', [
  param('zoneId').isUUID().withMessage('Invalid zone ID')
], ZoneController.getZoneById);

// Create zone
router.post('/', [
  body('name').notEmpty().withMessage('Zone name is required'),
  body('description').optional().isString(),
  body('coordinates').isArray({ min: 3 }).withMessage('Coordinates must be an array with at least 3 points'),
  body('coordinates.*.lat').isFloat({ min: -90, max: 90 }),
  body('coordinates.*.lng').isFloat({ min: -180, max: 180 }),
  body('centerLatitude').optional().isFloat({ min: -90, max: 90 }),
  body('centerLongitude').optional().isFloat({ min: -180, max: 180 }),
  body('radiusKm').optional().isFloat({ min: 0.1, max: 100 }),
  body('pricingMultiplier').optional().isFloat({ min: 0.5, max: 3 }),
  body('deliveryFee').optional().isFloat({ min: 0 }),
  body('minOrderAmount').optional().isFloat({ min: 0 }),
  body('zoneCode').optional().isString().isLength({ max: 20 }),
  body('displayOrder').optional().isInt({ min: 0 })
], ZoneController.createZone);

// Update zone
router.put('/:zoneId', [
  param('zoneId').isUUID().withMessage('Invalid zone ID'),
  body('name').notEmpty().withMessage('Zone name is required'),
  body('description').optional().notEmpty(),
  body('coordinates').optional().isArray({ min: 3 }),
  body('coordinates.*.lat').optional().isFloat({ min: -90, max: 90 }),
  body('coordinates.*.lng').optional().isFloat({ min: -180, max: 180 }),
  body('centerLatitude').optional().isFloat({ min: -90, max: 90 }),
  body('centerLongitude').optional().isFloat({ min: -180, max: 180 }),
  body('radiusKm').optional().isFloat({ min: 0.1, max: 100 }),
  body('pricingMultiplier').optional().isFloat({ min: 0.5, max: 3 }),
  body('deliveryFee').optional().isFloat({ min: 0 }),
  body('minOrderAmount').optional().isFloat({ min: 0 }),
  body('zoneCode').optional().isString().isLength({ max: 20 }),
  body('displayOrder').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean()
], ZoneController.updateZone);

// Delete zone (soft delete)
router.delete('/:zoneId', [
  param('zoneId').isUUID().withMessage('Invalid zone ID')
], ZoneController.deleteZone);

// Get zone statistics
router.get('/all/statistics', ZoneController.getZoneStatistics);


module.exports = router;