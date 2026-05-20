// config/env.js
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { logger } = require('./logger');

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'development';

// Try to load .env file based on environment
const envFiles = [
  `.env.${NODE_ENV}.local`,
  `.env.${NODE_ENV}`,
  `.env.local`,
  `.env`
];

let loaded = false;

for (const envFile of envFiles) {
  const envPath = path.join(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (!result.error) {
      logger.info(`✅ Loaded environment from: ${envFile}`);
      loaded = true;
      break;
    }
  }
}

if (!loaded) {
  logger.info('⚠️  No .env file found. Using system environment variables.');
}

// Validate required environment variables
const requiredEnvVars = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  logger.info('❌ Missing required environment variables:', missingVars.join(', '));
  logger('Please create a .env file with these variables.');
  if (NODE_ENV === 'production') {
    process.exit(1);
  }
}

module.exports = process.env;