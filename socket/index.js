const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { setupSocketHandlers } = require('./socket.handlers');
const { logger } = require('../config/logger');
const { pool } = require('../config/database');
const { redis } = require('../config/redis');

let io;
let connectedUsers = new Map();
let socketToUser = new Map();
let userRooms = new Map();

// Export these for use in other modules if needed
const getConnectedUsers = () => connectedUsers;
const getSocketToUser = () => socketToUser;
const getUserRooms = () => userRooms;

/**
 * Initialize Socket.IO server
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
    pingInterval: 25000
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
    const userId = socket.userId;
    const userType = socket.userType;
    
    logger.info(`Socket connected: ${socket.id} - User: ${userId} (${userType})`);
    
    // Store connection
    connectedUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    
    if (!userRooms.has(userId)) {
      userRooms.set(userId, new Set());
    }
    
    // Join user's personal room
    socket.join(`user:${userId}`);
    userRooms.get(userId).add(`user:${userId}`);
    
    // Broadcast user online
    io.emit('user:online', { userId, userType, timestamp: new Date() });
    
    // Setup event handlers - PASS THE MAPS AND IO
    setupSocketHandlers(io, socket, {
      connectedUsers,
      socketToUser,
      userRooms
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: ${socket.id} - User: ${userId}`);
      
      connectedUsers.delete(userId);
      socketToUser.delete(socket.id);
      userRooms.delete(userId);
      
      if (userType === 'artisan') {
        try {
          await pool.query(
            `UPDATE artisan_profiles SET is_available = false, last_seen = NOW() WHERE user_id = $1`,
            [userId]
          );
          await redis.del(`artisan:online:${userId}`);
          io.emit('artisan:offline', { artisanId: userId, timestamp: new Date() });
        } catch (error) {
          logger.error('Error updating artisan offline status:', error);
        }
      }
      
      io.emit('user:offline', { userId, userType, timestamp: new Date() });
    });
    
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${userId}:`, error);
    });
  });
  
  logger.info('Socket.IO server initialized');
  
  return io;
};

/**
 * Get Socket.IO instance
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initSocket first.');
  }
  return io;
};

/**
 * Emit event to specific user
 */
const emitToUser = (userId, event, data) => {
  const socketId = connectedUsers.get(userId);
  if (socketId && io) {
    io.to(socketId).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Emit event to job room
 */
const emitToJob = (jobId, event, data) => {
  if (io) {
    io.to(`job:${jobId}`).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Emit event to all connected clients
 */
const emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToJob,
  emitToAll,
  getConnectedUsers: () => Array.from(connectedUsers.keys()),
  isUserConnected: (userId) => connectedUsers.has(userId)
};