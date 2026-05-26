// routes/location.routes.js
const express = require('express');
const { pool } = require('../config/database');
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const LocationController = require('../controllers/location.controller');
const router = express.Router();


// Update artisan location (real-time)
router.post('/update', authenticateToken, requireRole(['artisan']),
   LocationController.updateLocation);
 

// Get artisan location (for client)
router.get('/artisan/:artisanId', authenticateToken, requireRole(['client', 'admin']),
  LocationController.getArtisanLocation);
  
// Get nearby artisans (for client)
router.get('/nearby', authenticateToken, requireRole(['client']),
[ query('latitude').notEmpty(), 
  query('longitude').notEmpty(),
  query('radius').optional().isNumeric(),
  query('category').notEmpty()], LocationController.getNearbyArtisans);


// Set artisan availability
router.post('/availability', authenticateToken, requireRole(['artisan']), LocationController.setAvailability);


module.exports = router;