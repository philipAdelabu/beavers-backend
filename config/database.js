const { Pool } = require('pg');
const { logger } = require('./logger');
require('dotenv').config();

// Ensure all required values are strings
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'beaverworks',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',  // Ensure this is always a string
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10),
  maxUses: 7500,
};

// Validate required configuration
if (!dbConfig.password) {
  logger.warn('Database password is not set in environment variables. Please check your .env file');
}

const pool = new Pool(dbConfig);

// Event listeners
pool.on('connect', () => {
  logger.info('Database pool connected');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

pool.on('acquire', () => {
  logger.debug('Database client acquired from pool');
});

pool.on('remove', () => {
  logger.debug('Database client removed from pool');
});

/**
 * Execute a query with logging
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
const query = async (text, params = []) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn('Slow query', { 
        text: text.substring(0, 500), 
        duration: `${duration}ms`,
        params: JSON.stringify(params)
      });
    } else {
      logger.debug('Query executed', { 
        text: text.substring(0, 200), 
        duration: `${duration}ms`,
        rowCount: res.rowCount
      });
    }
    
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query error:', { 
      text: text.substring(0, 500), 
      duration: `${duration}ms`,
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Get a database client for transactions
 * @returns {Promise} Database client
 */
const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query;
  const originalRelease = client.release;
  
  // Set timeout for queries
  const timeout = setTimeout(() => {
    logger.error('Database client transaction timeout');
    client.release();
  }, 30000);
  
  client.query = (...args) => {
    client.lastQuery = args;
    return originalQuery.apply(client, args);
  };
  
  client.release = () => {
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease.apply(client);
  };
  
  return client;
};

/**
 * Initialize database with required extensions
 */
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    // Create extensions if not exists
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "postgis"');
    logger.info('Database extensions initialized');
    
    // Test connection
    const result = await client.query('SELECT NOW() as current_time');
    logger.info(`Database connected successfully at ${result.rows[0].current_time}`);
    
    return true;
  } catch (error) {
    logger.error('Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check database health
 * @returns {Promise<boolean>} True if healthy
 */
const healthCheck = async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
};

/**
 * Close database pool
 */
const closePool = async () => {
  try {
    await pool.end();
    logger.info('Database pool closed');
  } catch (error) {
    logger.error('Error closing database pool:', error);
    throw error;
  }
};

module.exports = {
  pool,
  query,
  getClient,
  initializeDatabase,
  healthCheck,
  closePool
};