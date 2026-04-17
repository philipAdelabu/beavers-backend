const Redis = require('ioredis');
const { logger } = require('./logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection retry ${times} in ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  keepAlive: 30000,
  family: 4
});

// Event listeners
redis.on('connect', () => {
  logger.info('Redis connecting...');
});

redis.on('ready', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (error) => {
  logger.error('Redis connection error:', error);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

redis.on('end', () => {
  logger.info('Redis connection ended');
});

/**
 * Connect to Redis
 */
const connectRedis = async () => {
  try {
    await redis.connect();
    return true;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    return false;
  }
};

/**
 * Get cached value
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value
 */
const cacheGet = async (key) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Cache get error:', { key, error: error.message });
    return null;
  }
};

/**
 * Set cached value
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} Success status
 */
const cacheSet = async (key, value, ttl = 3600) => {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
    return true;
  } catch (error) {
    logger.error('Cache set error:', { key, error: error.message });
    return false;
  }
};

/**
 * Delete cached value
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Success status
 */
const cacheDel = async (key) => {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.error('Cache delete error:', { key, error: error.message });
    return false;
  }
};

/**
 * Increment cache value
 * @param {string} key - Cache key
 * @param {number} increment - Increment amount
 * @returns {Promise<number>} New value
 */
const cacheIncrement = async (key, increment = 1) => {
  try {
    return await redis.incrby(key, increment);
  } catch (error) {
    logger.error('Cache increment error:', { key, error: error.message });
    return 0;
  }
};

/**
 * Set cache with expiration
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} Success status
 */
const cacheSetEx = async (key, value, ttl) => {
  return cacheSet(key, value, ttl);
};

/**
 * Get cache TTL
 * @param {string} key - Cache key
 * @returns {Promise<number>} TTL in seconds
 */
const cacheTTL = async (key) => {
  try {
    return await redis.ttl(key);
  } catch (error) {
    logger.error('Cache TTL error:', { key, error: error.message });
    return -2;
  }
};

/**
 * Check if cache key exists
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if exists
 */
const cacheExists = async (key) => {
  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Cache exists error:', { key, error: error.message });
    return false;
  }
};

/**
 * Get multiple cache values
 * @param {Array} keys - Array of cache keys
 * @returns {Promise<Array>} Array of values
 */
const cacheGetMultiple = async (keys) => {
  try {
    const values = await redis.mget(keys);
    return values.map(v => v ? JSON.parse(v) : null);
  } catch (error) {
    logger.error('Cache get multiple error:', { error: error.message });
    return keys.map(() => null);
  }
};

/**
 * Set multiple cache values
 * @param {Array} entries - Array of {key, value, ttl}
 * @returns {Promise<boolean>} Success status
 */
const cacheSetMultiple = async (entries) => {
  try {
    const pipeline = redis.pipeline();
    for (const entry of entries) {
      pipeline.set(entry.key, JSON.stringify(entry.value), 'EX', entry.ttl || 3600);
    }
    await pipeline.exec();
    return true;
  } catch (error) {
    logger.error('Cache set multiple error:', { error: error.message });
    return false;
  }
};

/**
 * Clear cache by pattern
 * @param {string} pattern - Key pattern
 * @returns {Promise<number>} Number of keys deleted
 */
const cacheClearPattern = async (pattern) => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
      return keys.length;
    }
    return 0;
  } catch (error) {
    logger.error('Cache clear pattern error:', { pattern, error: error.message });
    return 0;
  }
};

// Geo location helpers
const addArtisanLocation = async (artisanId, longitude, latitude) => {
  try {
    await redis.geoadd('artisans:locations', longitude, latitude, artisanId);
    return true;
  } catch (error) {
    logger.error('Add artisan location error:', error);
    return false;
  }
};

const getNearbyArtisans = async (longitude, latitude, radius = 5) => {
  try {
    const artisans = await redis.georadius(
      'artisans:locations',
      longitude,
      latitude,
      radius,
      'km',
      'WITHDIST',
      'ASC'
    );
    return artisans;
  } catch (error) {
    logger.error('Get nearby artisans error:', error);
    return [];
  }
};

const removeArtisanLocation = async (artisanId) => {
  try {
    await redis.zrem('artisans:locations', artisanId);
    return true;
  } catch (error) {
    logger.error('Remove artisan location error:', error);
    return false;
  }
};

const getArtisanLocation = async (artisanId) => {
  try {
    const location = await redis.geopos('artisans:locations', artisanId);
    if (location && location[0] && location[0][0]) {
      return {
        longitude: location[0][0],
        latitude: location[0][1]
      };
    }
    return null;
  } catch (error) {
    logger.error('Get artisan location error:', error);
    return null;
  }
};

module.exports = {
  redis,
  connectRedis,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheIncrement,
  cacheSetEx,
  cacheTTL,
  cacheExists,
  cacheGetMultiple,
  cacheSetMultiple,
  cacheClearPattern,
  addArtisanLocation,
  getNearbyArtisans,
  removeArtisanLocation,
  getArtisanLocation
};