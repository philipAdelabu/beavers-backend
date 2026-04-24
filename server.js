// server.js
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routes
const authRoutes = require('./routes/auth.routes');
const clientRoutes = require('./routes/client.routes');
const artisanRoutes = require('./routes/artisan.routes');
const jobRoutes = require('./routes/job.routes');
const paymentRoutes = require('./routes/payment.routes');

const adminRoutes = require('./routes/admin.routes');
const locationRoutes = require('./routes/location.routes');
const boqRoutes = require('./routes/boq.routes');
const warehouseRoutes = require('./routes/warehouse.routes');

// Import services
const { pool, initializeDatabase } = require('./config/database');
const { redis, initializeRedis } = require('./config/redis');
const { logger } = require('./config/logger');
const { setupSocketHandlers } = require('./socket/socket.handlers');

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/clients', clientRoutes);
app.use('/api/v1/artisans', artisanRoutes);
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/location', locationRoutes);
app.use('/api/v1/boq', boqRoutes);
app.use('/api/v1/warehouse', warehouseRoutes);

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

    setupSocketHandlers(io);
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

logger.info('Starting server...');
startServer();

module.exports = { app, io };
