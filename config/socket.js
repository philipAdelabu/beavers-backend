const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { logger } = require('./logger');
const { pool } = require('./database');
const { redis } = require('./redis');

let io = null;

/**
 * Initialize Socket.IO server
 * @param {http.Server} server - HTTP server instance
 * @returns {socketIO.Server} Socket.IO instance
 */
const initSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    allowEIO3: true,
    path: '/socket.io/'
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        logger.warn('Socket connection attempt without token');
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const userResult = await pool.query(
        'SELECT id, user_type, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
        return next(new Error('User not found or inactive'));
      }
      
      const isBlacklisted = await redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return next(new Error('Token has been revoked'));
      }
      
      socket.userId = decoded.userId;
      socket.userType = userResult.rows[0].user_type;
      socket.token = token;
      
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return next(new Error('Invalid token'));
      }
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Token expired'));
      }
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} - User: ${socket.userId} (${socket.userType})`);
    
    // Join user's personal room
    socket.join(`user:${socket.userId}`);
    
    // Update online status
    redis.setex(`online:${socket.userId}`, 300, 'true');
    
    // Broadcast user online
    io.emit('user:online', {
      userId: socket.userId,
      userType: socket.userType,
      timestamp: new Date()
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: ${socket.id} - User: ${socket.userId}`);
      
      redis.del(`online:${socket.userId}`);
      
      io.emit('user:offline', {
        userId: socket.userId,
        userType: socket.userType,
        timestamp: new Date()
      });
      
      // Update artisan availability if needed
      if (socket.userType === 'artisan') {
        try {
          await pool.query(
            `UPDATE artisan_profiles SET is_available = false, last_seen = NOW() WHERE user_id = $1`,
            [socket.userId]
          );
        } catch (error) {
          logger.error('Error updating artisan offline status:', error);
        }
      }
    });
    
    // Heartbeat
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });
  });
  
  logger.info('Socket.IO server initialized');
  
  return io;
};

/**
 * Get Socket.IO instance
 * @returns {socketIO.Server} Socket.IO instance
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initSocket first.');
  }
  return io;
};

/**
 * Emit event to specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {*} data - Event data
 * @returns {boolean} True if user was connected
 */
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Emit event to job room
 * @param {string} jobId - Job ID
 * @param {string} event - Event name
 * @param {*} data - Event data
 * @returns {boolean} True if room exists
 */
const emitToJob = (jobId, event, data) => {
  if (io) {
    io.to(`job:${jobId}`).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Check if user is online
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if online
 */
const isUserOnline = async (userId) => {
  const result = await redis.get(`online:${userId}`);
  return !!result;
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToJob,
  isUserOnline
};