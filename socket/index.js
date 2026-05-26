const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const { setupSocketHandlers } = require('./socket.handlers');
const { logger } = require('../config/logger');

let io;
let connectedUsers = new Map();
let socketToUser = new Map();
let userRooms = new Map();

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

  // Set global.io for access in helper functions
  global.io = io;

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
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
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const maps = { connectedUsers, socketToUser, userRooms };
    setupSocketHandlers(io, socket, maps);
  });
  
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

module.exports = { initSocket, getIO };