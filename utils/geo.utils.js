const geolib = require('geolib');
const axios = require('axios');
const { logger } = require('../config/logger');

/**
 * Calculate distance between two points in meters
 * @param {Object} point1 - { latitude, longitude }
 * @param {Object} point2 - { latitude, longitude }
 * @returns {number} Distance in meters
 */
const calculateDistance = (point1, point2) => {
  return geolib.getDistance(
    { latitude: point1.latitude, longitude: point1.longitude },
    { latitude: point2.latitude, longitude: point2.longitude }
  );
};

/**
 * Calculate distance in kilometers
 * @param {Object} point1 - { latitude, longitude }
 * @param {Object} point2 - { latitude, longitude }
 * @returns {number} Distance in kilometers
 */
const calculateDistanceKm = (point1, point2) => {
  return calculateDistance(point1, point2) / 1000;
};

/**
 * Calculate ETA based on distance
 * @param {number} distance - Distance in meters
 * @param {number} speed - Speed in km/h (default: 30)
 * @returns {number} ETA in minutes
 */
const calculateETA = (distance, speed = 30) => {
  const timeInHours = distance / 1000 / speed;
  return Math.ceil(timeInHours * 60);
};

/**
 * Check if point is within geofence
 * @param {Object} artisanLocation - { latitude, longitude }
 * @param {Object} clientLocation - { latitude, longitude }
 * @param {number} radius - Radius in meters (default: 100)
 * @returns {boolean}
 */
const isWithinGeofence = (artisanLocation, clientLocation, radius = 100) => {
  const distance = calculateDistance(artisanLocation, clientLocation);
  return distance <= radius;
};

/**
 * Generate random arrival PIN
 * @param {number} length - PIN length (default: 6)
 * @returns {string}
 */
const generateArrivalPIN = (length = 6) => {
  return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
};

/**
 * Calculate travel path using Google Maps API
 * @param {Object} origin - { latitude, longitude }
 * @param {Object} destination - { latitude, longitude }
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Route information
 */
const calculateTravelPath = async (origin, destination, options = {}) => {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json`,
      {
        params: {
          origin: `${origin.latitude},${origin.longitude}`,
          destination: `${destination.latitude},${destination.longitude}`,
          key: process.env.GOOGLE_MAPS_API_KEY,
          alternatives: options.alternatives || false,
          mode: options.mode || 'driving',
          traffic_model: options.trafficModel || 'best_guess',
          departure_time: options.departureTime || 'now'
        }
      }
    );
    
    if (response.data.status === 'OK') {
      const routes = response.data.routes.map(route => {
        const leg = route.legs[0];
        return {
          distance: leg.distance.value,
          distanceText: leg.distance.text,
          duration: leg.duration.value,
          durationText: leg.duration.text,
          durationInTraffic: leg.duration_in_traffic?.value,
          durationInTrafficText: leg.duration_in_traffic?.text,
          polyline: route.overview_polyline.points,
          startAddress: leg.start_address,
          endAddress: leg.end_address,
          steps: leg.steps.map(step => ({
            instruction: step.html_instructions,
            distance: step.distance.value,
            duration: step.duration.value,
            startLocation: step.start_location,
            endLocation: step.end_location,
            maneuver: step.maneuver
          }))
        };
      });
      
      return routes;
    }
    
    throw new Error(`Google Maps API error: ${response.data.status}`);
  } catch (error) {
    logger.error('Route calculation error:', error);
    throw error;
  }
};

/**
 * Calculate the center point of multiple coordinates
 * @param {Array} points - Array of { latitude, longitude }
 * @returns {Object} Center point { latitude, longitude }
 */
const calculateCenter = (points) => {
  const coords = points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  const center = geolib.getCenter(coords);
  return center;
};

/**
 * Get bounding box for a set of points
 * @param {Array} points - Array of { latitude, longitude }
 * @param {number} padding - Padding in degrees (default: 0.01)
 * @returns {Object} Bounding box { north, south, east, west }
 */
const getBoundingBox = (points, padding = 0.01) => {
  const lats = points.map(p => p.latitude);
  const lngs = points.map(p => p.longitude);
  
  return {
    north: Math.max(...lats) + padding,
    south: Math.min(...lats) - padding,
    east: Math.max(...lngs) + padding,
    west: Math.min(...lngs) - padding
  };
};

/**
 * Check if point is within bounding box
 * @param {Object} point - { latitude, longitude }
 * @param {Object} bbox - { north, south, east, west }
 * @returns {boolean}
 */
const isWithinBoundingBox = (point, bbox) => {
  return point.latitude <= bbox.north &&
         point.latitude >= bbox.south &&
         point.longitude <= bbox.east &&
         point.longitude >= bbox.west;
};

/**
 * Get distance between two points in different units
 * @param {Object} point1 - { latitude, longitude }
 * @param {Object} point2 - { latitude, longitude }
 * @param {string} unit - 'm' (meters), 'km' (kilometers), 'mi' (miles)
 * @returns {number}
 */
const getDistanceInUnit = (point1, point2, unit = 'm') => {
  const meters = calculateDistance(point1, point2);
  
  switch (unit) {
    case 'km':
      return meters / 1000;
    case 'mi':
      return meters / 1609.34;
    default:
      return meters;
  }
};

/**
 * Format distance for display
 * @param {number} distance - Distance in meters
 * @returns {string} Formatted distance (e.g., "1.5 km" or "500 m")
 */
const formatDistance = (distance) => {
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)} km`;
  }
  return `${Math.round(distance)} m`;
};

/**
 * Format duration for display
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1 hour 30 min" or "45 min")
 */
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes > 0 ? `${minutes} min` : ''}`;
  }
  return `${minutes} min`;
};

/**
 * Get bearing between two points
 * @param {Object} point1 - { latitude, longitude }
 * @param {Object} point2 - { latitude, longitude }
 * @returns {number} Bearing in degrees
 */
const getBearing = (point1, point2) => {
  const start = { latitude: point1.latitude, longitude: point1.longitude };
  const end = { latitude: point2.latitude, longitude: point2.longitude };
  return geolib.getBearing(start, end);
};

/**
 * Get compass direction from bearing
 * @param {number} bearing - Bearing in degrees
 * @returns {string} Compass direction (N, NE, E, SE, S, SW, W, NW)
 */
const getCompassDirection = (bearing) => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
};

/**
 * Validate coordinates
 * @param {number} latitude - Latitude (-90 to 90)
 * @param {number} longitude - Longitude (-180 to 180)
 * @returns {boolean}
 */
const isValidCoordinates = (latitude, longitude) => {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
};

/**
 * Reverse geocode coordinates to address
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {Promise<Object>} Address information
 */
const reverseGeocode = async (latitude, longitude) => {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json`,
      {
        params: {
          latlng: `${latitude},${longitude}`,
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      }
    );
    
    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const result = response.data.results[0];
      return {
        formattedAddress: result.formatted_address,
        streetNumber: result.address_components.find(c => c.types.includes('street_number'))?.long_name,
        street: result.address_components.find(c => c.types.includes('route'))?.long_name,
        city: result.address_components.find(c => c.types.includes('locality'))?.long_name,
        state: result.address_components.find(c => c.types.includes('administrative_area_level_1'))?.long_name,
        country: result.address_components.find(c => c.types.includes('country'))?.long_name,
        postalCode: result.address_components.find(c => c.types.includes('postal_code'))?.long_name,
        location: result.geometry.location
      };
    }
    
    return null;
  } catch (error) {
    logger.error('Reverse geocoding error:', error);
    return null;
  }
};

module.exports = {
  calculateDistance,
  calculateDistanceKm,
  calculateETA,
  isWithinGeofence,
  generateArrivalPIN,
  calculateTravelPath,
  calculateCenter,
  getBoundingBox,
  isWithinBoundingBox,
  getDistanceInUnit,
  formatDistance,
  formatDuration,
  getBearing,
  getCompassDirection,
  isValidCoordinates,
  reverseGeocode
};