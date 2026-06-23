// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { initSocket } = require('./socket');


require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d', // Cache for 7 days
  etag: true,
  lastModified: true,
}));

// Import routes

const router = require('./routes/index');
// Import services
const { pool, initializeDatabase } = require('./config/database');
const { redis, initializeRedis } = require('./config/redis');
const { logger } = require('./config/logger');

// Routes
app.get('/', (req, res) => {
  res.send(`Welcome to the BeaverWorks API!  ${new Date().toISOString()}`);
});

app.use('/api/v1', router);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Initialize services and start server
const startServer = async () => {
  try {
    await initializeDatabase();
    logger.info('Database connected successfully');

    // Initialize Redis
    const redisInitialized = await initializeRedis();

    if (!redisInitialized) {
      logger.warn('Redis connection failed, but continuing without Redis...');
    } else {
      logger.info('Redis connected successfully');
    }

    initSocket(server);
  
  

    logger.info('getting to  port ..');
    // setupSocketHandlers(io);
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      server.close(async () => {
        logger.info('HTTP server closed');
        await pool.end();
        logger.info('Database pool closed');
        await redis.quit();
        logger.info('Redis connection closed');
        process.exit(0);
      });
      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
module.exports = { app };
