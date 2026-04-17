/**
 * Calculate Euclidean distance between two points
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
const euclideanDistance = (lat1, lon1, lat2, lon2) => {
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
};

/**
 * Calculate Haversine distance between two coordinates
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @param {string} unit - Unit of measurement ('km', 'm', 'mi')
 * @returns {number} Distance in specified unit
 */
const haversineDistance = (lat1, lon1, lat2, lon2, unit = 'km') => {
  const R = {
    km: 6371,
    m: 6371000,
    mi: 3959
  };
  
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R[unit] * c;
};

/**
 * Calculate distance between two points using the Spherical Law of Cosines
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
const sphericalLawOfCosines = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const distance = Math.acos(
    Math.sin(φ1) * Math.sin(φ2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  ) * R;
  
  return distance;
};

/**
 * Calculate bearing between two points
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Bearing in degrees
 */
const calculateBearing = (lat1, lon1, lat2, lon2) => {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  const bearing = (θ * 180 / Math.PI + 360) % 360;
  
  return bearing;
};

/**
 * Calculate midpoint between two coordinates
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {Object} Midpoint coordinates { latitude, longitude }
 */
const calculateMidpoint = (lat1, lon1, lat2, lon2) => {
  const φ1 = lat1 * Math.PI / 180;
  const λ1 = lon1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const λ2 = lon2 * Math.PI / 180;
  
  const Bx = Math.cos(φ2) * Math.cos(λ2 - λ1);
  const By = Math.cos(φ2) * Math.sin(λ2 - λ1);
  const φ3 = Math.atan2(
    Math.sin(φ1) + Math.sin(φ2),
    Math.sqrt((Math.cos(φ1) + Bx) * (Math.cos(φ1) + Bx) + By * By)
  );
  const λ3 = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);
  
  return {
    latitude: φ3 * 180 / Math.PI,
    longitude: λ3 * 180 / Math.PI
  };
};

/**
 * Calculate destination point given start point, bearing, and distance
 * @param {number} lat - Starting latitude
 * @param {number} lon - Starting longitude
 * @param {number} bearing - Bearing in degrees
 * @param {number} distance - Distance in meters
 * @returns {Object} Destination coordinates { latitude, longitude }
 */
const calculateDestination = (lat, lon, bearing, distance) => {
  const R = 6371e3;
  const φ1 = lat * Math.PI / 180;
  const λ1 = lon * Math.PI / 180;
  const θ = bearing * Math.PI / 180;
  const δ = distance / R;
  
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );
  
  return {
    latitude: φ2 * 180 / Math.PI,
    longitude: λ2 * 180 / Math.PI
  };
};

/**
 * Convert distance between different units
 * @param {number} distance - Distance value
 * @param {string} fromUnit - Original unit ('m', 'km', 'mi', 'ft')
 * @param {string} toUnit - Target unit ('m', 'km', 'mi', 'ft')
 * @returns {number} Converted distance
 */
const convertDistance = (distance, fromUnit, toUnit) => {
  const conversions = {
    m: 1,
    km: 1000,
    mi: 1609.34,
    ft: 0.3048
  };
  
  const meters = distance * conversions[fromUnit];
  return meters / conversions[toUnit];
};

/**
 * Calculate total distance of a path with multiple points
 * @param {Array} points - Array of { latitude, longitude } points
 * @returns {number} Total distance in meters
 */
const calculatePathDistance = (points) => {
  let totalDistance = 0;
  
  for (let i = 1; i < points.length; i++) {
    totalDistance += haversineDistance(
      points[i - 1].latitude, points[i - 1].longitude,
      points[i].latitude, points[i].longitude,
      'm'
    );
  }
  
  return totalDistance;
};

/**
 * Check if a point is within a radius of another point
 * @param {number} lat1 - Latitude of center point
 * @param {number} lon1 - Longitude of center point
 * @param {number} lat2 - Latitude of test point
 * @param {number} lon2 - Longitude of test point
 * @param {number} radius - Radius in meters
 * @returns {boolean} True if within radius
 */
const isWithinRadius = (lat1, lon1, lat2, lon2, radius) => {
  const distance = haversineDistance(lat1, lon1, lat2, lon2, 'm');
  return distance <= radius;
};

/**
 * Find nearest point from a list
 * @param {number} lat - Reference latitude
 * @param {number} lon - Reference longitude
 * @param {Array} points - Array of { latitude, longitude } points
 * @returns {Object} Nearest point with distance
 */
const findNearestPoint = (lat, lon, points) => {
  let nearest = null;
  let minDistance = Infinity;
  
  for (const point of points) {
    const distance = haversineDistance(lat, lon, point.latitude, point.longitude, 'm');
    if (distance < minDistance) {
      minDistance = distance;
      nearest = { ...point, distance };
    }
  }
  
  return nearest;
};

/**
 * Sort points by distance from reference
 * @param {number} lat - Reference latitude
 * @param {number} lon - Reference longitude
 * @param {Array} points - Array of { latitude, longitude } points
 * @returns {Array} Sorted points with distances
 */
const sortByDistance = (lat, lon, points) => {
  return points
    .map(point => ({
      ...point,
      distance: haversineDistance(lat, lon, point.latitude, point.longitude, 'm')
    }))
    .sort((a, b) => a.distance - b.distance);
};

/**
 * Get bounding box around a point
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} radius - Radius in meters
 * @returns {Object} Bounding box { minLat, maxLat, minLon, maxLon }
 */
const getBoundingBox = (lat, lon, radius) => {
  const R = 6371e3;
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  
  const deltaLat = radius / R * 180 / Math.PI;
  const deltaLon = radius / (R * Math.cos(latRad)) * 180 / Math.PI;
  
  return {
    minLat: lat - deltaLat,
    maxLat: lat + deltaLat,
    minLon: lon - deltaLon,
    maxLon: lon + deltaLon
  };
};

/**
 * Calculate optimal meeting point between multiple locations
 * @param {Array} points - Array of { latitude, longitude } points
 * @returns {Object} Optimal meeting point
 */
const calculateOptimalMeetingPoint = (points) => {
  // Use centroid for initial guess
  let centroid = {
    latitude: points.reduce((sum, p) => sum + p.latitude, 0) / points.length,
    longitude: points.reduce((sum, p) => sum + p.longitude, 0) / points.length
  };
  
  // Iterative refinement using Weiszfeld's algorithm
  for (let iter = 0; iter < 100; iter++) {
    let numeratorLat = 0;
    let numeratorLon = 0;
    let denominator = 0;
    
    for (const point of points) {
      const distance = haversineDistance(
        centroid.latitude, centroid.longitude,
        point.latitude, point.longitude,
        'm'
      );
      
      if (distance > 0) {
        numeratorLat += point.latitude / distance;
        numeratorLon += point.longitude / distance;
        denominator += 1 / distance;
      }
    }
    
    const newLat = numeratorLat / denominator;
    const newLon = numeratorLon / denominator;
    
    if (Math.abs(newLat - centroid.latitude) < 1e-8 &&
        Math.abs(newLon - centroid.longitude) < 1e-8) {
      break;
    }
    
    centroid = { latitude: newLat, longitude: newLon };
  }
  
  return centroid;
};

/**
 * Format distance for display
 * @param {number} meters - Distance in meters
 * @param {string} locale - Locale for formatting (default: 'en')
 * @returns {string} Formatted distance string
 */
const formatDistance = (meters, locale = 'en') => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  } else {
    const km = meters / 1000;
    return `${km.toFixed(1)} km`;
  }
};

/**
 * Get driving distance using Google Maps API (async)
 * @param {number} lat1 - Origin latitude
 * @param {number} lon1 - Origin longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lon2 - Destination longitude
 * @returns {Promise<Object>} Driving distance and duration
 */
const getDrivingDistance = async (lat1, lon1, lat2, lon2) => {
  const axios = require('axios');
  
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json`,
      {
        params: {
          origins: `${lat1},${lon1}`,
          destinations: `${lat2},${lon2}`,
          key: process.env.GOOGLE_MAPS_API_KEY,
          mode: 'driving',
          units: 'metric'
        }
      }
    );
    
    if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
      const element = response.data.rows[0].elements[0];
      return {
        distance: element.distance.value,
        distanceText: element.distance.text,
        duration: element.duration.value,
        durationText: element.duration.text
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting driving distance:', error);
    return null;
  }
};

module.exports = {
  euclideanDistance,
  haversineDistance,
  sphericalLawOfCosines,
  calculateBearing,
  calculateMidpoint,
  calculateDestination,
  convertDistance,
  calculatePathDistance,
  isWithinRadius,
  findNearestPoint,
  sortByDistance,
  getBoundingBox,
  calculateOptimalMeetingPoint,
  formatDistance,
  getDrivingDistance
};