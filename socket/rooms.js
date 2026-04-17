const { logger } = require('../config/logger');

/**
 * Room Manager - Handles socket room operations
 */
class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomName -> Set of userIds
    this.userRooms = new Map(); // userId -> Set of roomNames
  }

  /**
   * Add user to room
   * @param {string} userId - User ID
   * @param {string} roomName - Room name
   */
  addUserToRoom(userId, roomName) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    this.rooms.get(roomName).add(userId);
    
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId).add(roomName);
    
    logger.debug(`User ${userId} joined room ${roomName}`);
  }

  /**
   * Remove user from room
   * @param {string} userId - User ID
   * @param {string} roomName - Room name
   */
  removeUserFromRoom(userId, roomName) {
    if (this.rooms.has(roomName)) {
      this.rooms.get(roomName).delete(userId);
      
      // Clean up empty room
      if (this.rooms.get(roomName).size === 0) {
        this.rooms.delete(roomName);
      }
    }
    
    if (this.userRooms.has(userId)) {
      this.userRooms.get(userId).delete(roomName);
      
      if (this.userRooms.get(userId).size === 0) {
        this.userRooms.delete(userId);
      }
    }
    
    logger.debug(`User ${userId} left room ${roomName}`);
  }

  /**
   * Remove user from all rooms
   * @param {string} userId - User ID
   */
  removeUserFromAllRooms(userId) {
    if (this.userRooms.has(userId)) {
      const rooms = [...this.userRooms.get(userId)];
      for (const roomName of rooms) {
        this.removeUserFromRoom(userId, roomName);
      }
    }
  }

  /**
   * Get users in room
   * @param {string} roomName - Room name
   * @returns {Array} Array of user IDs
   */
  getUsersInRoom(roomName) {
    if (!this.rooms.has(roomName)) {
      return [];
    }
    return Array.from(this.rooms.get(roomName));
  }

  /**
   * Get rooms for user
   * @param {string} userId - User ID
   * @returns {Array} Array of room names
   */
  getUserRooms(userId) {
    if (!this.userRooms.has(userId)) {
      return [];
    }
    return Array.from(this.userRooms.get(userId));
  }

  /**
   * Check if user is in room
   * @param {string} userId - User ID
   * @param {string} roomName - Room name
   * @returns {boolean} True if in room
   */
  isUserInRoom(userId, roomName) {
    return this.rooms.has(roomName) && this.rooms.get(roomName).has(userId);
  }

  /**
   * Get room size
   * @param {string} roomName - Room name
   * @returns {number} Number of users in room
   */
  getRoomSize(roomName) {
    if (!this.rooms.has(roomName)) {
      return 0;
    }
    return this.rooms.get(roomName).size;
  }

  /**
   * Get all rooms
   * @returns {Array} Array of room names
   */
  getAllRooms() {
    return Array.from(this.rooms.keys());
  }

  /**
   * Broadcast to room
   * @param {string} roomName - Room name
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @param {Function} emitFunction - Socket.IO emit function
   */
  broadcastToRoom(roomName, event, data, emitFunction) {
    const users = this.getUsersInRoom(roomName);
    for (const userId of users) {
      emitFunction(userId, event, data);
    }
  }
}

// Job room helpers
const getJobRoomName = (jobId) => `job:${jobId}`;
const getUserRoomName = (userId) => `user:${userId}`;
const getArtisanRoomName = (artisanId) => `artisan:${artisanId}`;
const getClientRoomName = (clientId) => `client:${clientId}`;

// Room types
const ROOM_TYPES = {
  JOB: 'job',
  USER: 'user',
  ARTISAN: 'artisan',
  CLIENT: 'client',
  ADMIN: 'admin',
  GLOBAL: 'global'
};

/**
 * Create room name based on type and ID
 * @param {string} type - Room type
 * @param {string} id - Identifier
 * @returns {string} Room name
 */
const createRoomName = (type, id) => {
  return `${type}:${id}`;
};

/**
 * Parse room name to get type and ID
 * @param {string} roomName - Room name
 * @returns {Object} { type, id }
 */
const parseRoomName = (roomName) => {
  const [type, id] = roomName.split(':');
  return { type, id };
};

/**
 * Check if room is a job room
 * @param {string} roomName - Room name
 * @returns {boolean} True if job room
 */
const isJobRoom = (roomName) => {
  return roomName.startsWith('job:');
};

/**
 * Check if room is a user room
 * @param {string} roomName - Room name
 * @returns {boolean} True if user room
 */
const isUserRoom = (roomName) => {
  return roomName.startsWith('user:');
};

/**
 * Check if room is an artisan room
 * @param {string} roomName - Room name
 * @returns {boolean} True if artisan room
 */
const isArtisanRoom = (roomName) => {
  return roomName.startsWith('artisan:');
};

/**
 * Check if room is a client room
 * @param {string} roomName - Room name
 * @returns {boolean} True if client room
 */
const isClientRoom = (roomName) => {
  return roomName.startsWith('client:');
};

module.exports = {
  RoomManager,
  getJobRoomName,
  getUserRoomName,
  getArtisanRoomName,
  getClientRoomName,
  ROOM_TYPES,
  createRoomName,
  parseRoomName,
  isJobRoom,
  isUserRoom,
  isArtisanRoom,
  isClientRoom
};
