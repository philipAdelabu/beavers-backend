const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { setupSocketHandlers } = require('./socket.handlers');
const { logger } = require('../config/logger');
const { pool } = require('../config/database');
const { redis } = require('../config/redis');

let io;
let connectedUsers = new Map(); // userId -> socketId
let socketToUser = new Map(); // socketId -> userId
let userRooms = new Map(); // userId -> Set of room names

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

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user exists and is active
      const userResult = await pool.query(
        'SELECT id, user_type, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
        return next(new Error('User not found or inactive'));
      }
      
      // Check if token is blacklisted
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
        logger.warn('Invalid socket token:', error.message);
        return next(new Error('Invalid token'));
      }
      if (error.name === 'TokenExpiredError') {
        logger.warn('Expired socket token');
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
    userRooms.set(userId, new Set());
    
    // Join user's personal room
    socket.join(`user:${userId}`);
    userRooms.get(userId).add(`user:${userId}`);
    
    // Broadcast user online status
    io.emit('user:online', { userId, userType, timestamp: new Date() });
    
    // Setup event handlers
    setupSocketHandlers(io, socket, { connectedUsers, socketToUser, userRooms });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: ${socket.id} - User: ${userId}`);
      
      // Remove from maps
      connectedUsers.delete(userId);
      socketToUser.delete(socket.id);
      userRooms.delete(userId);
      
      // Update artisan availability if needed
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
      
      // Broadcast user offline status
      io.emit('user:offline', { userId, userType, timestamp: new Date() });
    });
    
    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${userId}:`, error);
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
  const socketId = connectedUsers.get(userId);
  if (socketId && io) {
    io.to(socketId).emit(event, data);
    return true;
  }
  return false;
};

/**
 * Emit event to multiple users
 * @param {Array} userIds - Array of user IDs
 * @param {string} event - Event name
 * @param {*} data - Event data
 * @returns {Array} Results for each user
 */
const emitToUsers = (userIds, event, data) => {
  const results = [];
  for (const userId of userIds) {
    const sent = emitToUser(userId, event, data);
    results.push({ userId, sent });
  }
  return results;
};

/**
 * Emit event to all connected clients
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
const emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

/**
 * Emit event to users in specific room
 * @param {string} room - Room name
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
const emitToRoom = (room, event, data) => {
  if (io) {
    io.to(room).emit(event, data);
  }
};

/**
 * Get number of connected users
 * @returns {number} Connected users count
 */
const getConnectedCount = () => {
  return connectedUsers.size;
};

/**
 * Get connected user IDs
 * @returns {Array} Array of user IDs
 */
const getConnectedUsers = () => {
  return Array.from(connectedUsers.keys());
};

/**
 * Check if user is connected
 * @param {string} userId - User ID
 * @returns {boolean} True if connected
 */
const isUserConnected = (userId) => {
  return connectedUsers.has(userId);
};

/**
 * Get socket ID for user
 * @param {string} userId - User ID
 * @returns {string|null} Socket ID or null
 */
const getUserSocketId = (userId) => {
  return connectedUsers.get(userId) || null;
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToUsers,
  emitToAll,
  emitToRoom,
  getConnectedCount,
  getConnectedUsers,
  isUserConnected,
  getUserSocketId
};