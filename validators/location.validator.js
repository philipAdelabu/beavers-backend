const { body, param, query } = require('express-validator');

const updateLocation = [
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  body('heading')
    .optional()
    .isInt({ min: 0, max: 359 })
    .withMessage('Heading must be between 0 and 359 degrees'),
  
  body('speed')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Speed must be a positive number'),
  
  body('accuracy')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Accuracy must be a positive number'),
  
  body('jobId')
    .optional()
    .isUUID()
    .withMessage('Invalid job ID')
];

const getArtisanLocation = [
  param('artisanId')
    .isUUID()
    .withMessage('Invalid artisan ID')
];

const getNearbyArtisans = [
  query('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  query('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  query('radius')
    .optional()
    .isFloat({ min: 0.1, max: 50 })
    .withMessage('Radius must be between 0.1 and 50 km'),
  
  query('category')
    .optional()
    .isIn(['plumbing', 'electrical', 'carpentry', 'painting', 'tiling', 'hvac', 'generator', 'cctv', 'appliance', 'landscaping'])
    .withMessage('Invalid category'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

const getLocationHistory = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  query('startTime')
    .optional()
    .isISO8601()
    .withMessage('Start time must be a valid ISO date'),
  
  query('endTime')
    .optional()
    .isISO8601()
    .withMessage('End time must be a valid ISO date'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000')
];

const calculateRoute = [
  body('origin')
    .isObject()
    .withMessage('Origin is required'),
  
  body('origin.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Origin latitude must be between -90 and 90'),
  
  body('origin.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Origin longitude must be between -180 and 180'),
  
  body('destination')
    .isObject()
    .withMessage('Destination is required'),
  
  body('destination.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Destination latitude must be between -90 and 90'),
  
  body('destination.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Destination longitude must be between -180 and 180')
];

const getETA = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const generateArrivalPIN = [
  param('jobId')
    .isUUID()
    .withMessage('Invalid job ID')
];

const validateGeofence = [
  body('jobId')
    .isUUID()
    .withMessage('Invalid job ID'),
  
  body('artisanLocation')
    .isObject()
    .withMessage('Artisan location is required'),
  
  body('artisanLocation.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('artisanLocation.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
];

const setAvailability = [
  body('isAvailable')
    .isBoolean()
    .withMessage('isAvailable must be a boolean'),
  
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object'),
  
  body('location.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  body('location.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180')
];

const getActiveArtisans = [
  query('category')
    .optional()
    .isIn(['plumbing', 'electrical', 'carpentry', 'painting', 'tiling', 'hvac', 'generator', 'cctv', 'appliance', 'landscaping'])
    .withMessage('Invalid category')
];

const getDistanceTraveled = [
  param('artisanId')
    .isUUID()
    .withMessage('Invalid artisan ID'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date')
];

const getTrafficConditions = [
  query('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  query('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  query('radius')
    .optional()
    .isFloat({ min: 0.1, max: 50 })
    .withMessage('Radius must be between 0.1 and 50 km')
];

module.exports = {
  updateLocation,
  getArtisanLocation,
  getNearbyArtisans,
  getLocationHistory,
  calculateRoute,
  getETA,
  generateArrivalPIN,
  validateGeofence,
  setAvailability,
  getActiveArtisans,
  getDistanceTraveled,
  getTrafficConditions
};