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

  // Get location history (for client and admin)
router.get('/history/:jobId', authenticateToken, requireRole(['client', 'admin']),
  LocationController.getLocationHistory);

// Set artisan availability (for artisan)
router.post('/availability', authenticateToken, requireRole(['artisan']),
  LocationController.setAvailability);

  // Calculate route to job (for artisan)
router.get('/route/:jobId', authenticateToken, requireRole(['artisan', 'client', 'admin']),
  LocationController.calculateRoute);


router.get('/eta/:jobId', authenticateToken, LocationController.getETA);

router.post('/arrival-pin/:jobId', authenticateToken, requireRole(['artisan']), 
 LocationController.generateArrivalPIN); 

 router.get('/arrival-pin/verify/:jobId', authenticateToken, requireRole(['client']),
 LocationController.verifyArrivalPIN);

 
 router.get('/distance/:artisanId', authenticateToken, requireRole(['artisan', 'client']),
 LocationController.getDistanceTraveled);


// Get artisan availability (for client)
/*
router.get('/availability/:artisanId', authenticateToken, requireRole(['client', 'admin']),
  LocationController.getAvailability); */



// Set artisan availability
router.post('/availability', authenticateToken, requireRole(['artisan']), LocationController.setAvailability);


module.exports = router;