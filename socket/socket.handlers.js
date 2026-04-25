// Remove any imports from socket/index.js to break circular dependency
const { pool } = require('../config/database');
const { redis, addArtisanLocation, removeArtisanLocation } = require('../config/redis');
const { logger } = require('../config/logger');

/**
 * Setup socket event handlers
 * @param {socketIO.Server} io - Socket.IO instance
 * @param {socketIO.Socket} socket - Socket instance
 * @param {Object} maps - Maps for tracking connections
 */
const setupSocketHandlers = (io, socket, maps = {}) => {
  const { 
    connectedUsers = new Map(), 
    socketToUser = new Map(), 
    userRooms = new Map() 
  } = maps;
  
  const userId = socket.userId;
  const userType = socket.userType;

  /**
   * Join a job room
   */
  socket.on('job:join', async (data) => {
    const { jobId } = data;
    
    try {
      const result = await pool.query(
        `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      if (result.rows.length === 0) {
        socket.emit('error', { message: 'Job not found' });
        return;
      }
      
      const job = result.rows[0];
      
      if (job.client_id !== userId && job.artisan_id !== userId) {
        socket.emit('error', { message: 'Unauthorized to join this job' });
        return;
      }
      
      const roomName = `job:${jobId}`;
      socket.join(roomName);
      
      if (!userRooms.has(userId)) {
        userRooms.set(userId, new Set());
      }
      userRooms.get(userId).add(roomName);
      
      socket.emit('job:joined', { jobId, success: true });
      logger.info(`User ${userId} joined job room: ${jobId}`);
    } catch (error) {
      logger.error('Error joining job room:', error);
      socket.emit('error', { message: 'Failed to join job room' });
    }
  });

  /**
   * Leave a job room
   */
  socket.on('job:leave', (data) => {
    const { jobId } = data;
    const roomName = `job:${jobId}`;
    
    socket.leave(roomName);
    
    if (userRooms.has(userId)) {
      userRooms.get(userId).delete(roomName);
    }
    
    socket.emit('job:left', { jobId, success: true });
    logger.info(`User ${userId} left job room: ${jobId}`);
  });

  /**
   * Update artisan location (real-time tracking)
   */
  socket.on('location:update', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can update location' });
      return;
    }
    
    const { latitude, longitude, heading, speed, accuracy, jobId } = data;
    
    try {
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
      }
      
      await addArtisanLocation(userId, longitude, latitude);
      
      await pool.query(
        `INSERT INTO location_history (artisan_id, job_id, latitude, longitude, heading, speed, accuracy)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, jobId || null, latitude, longitude, heading, speed, accuracy]
      );
      
      await pool.query(
        `UPDATE artisan_profiles 
         SET current_location = $1, 
             latitude = $2, 
             longitude = $3,
             last_location_update = NOW()
         WHERE user_id = $4`,
        [JSON.stringify({ latitude, longitude, heading, speed }), latitude, longitude, userId]
      );
      
      await redis.setex(`location:current:${userId}`, 60, JSON.stringify({
        latitude, longitude, heading, speed, timestamp: new Date()
      }));
      
      if (jobId) {
        const jobResult = await pool.query(
          `SELECT client_id FROM jobs WHERE id = $1 AND artisan_id = $2`,
          [jobId, userId]
        );
        
        if (jobResult.rows.length > 0) {
          const clientId = jobResult.rows[0].client_id;
          // Emit directly to the client's room using io.to()
          io.to(`user:${clientId}`).emit('location:artisan', {
            artisanId: userId,
            jobId,
            location: { latitude, longitude, heading, speed },
            timestamp: new Date()
          });
        }
      }
      
      socket.emit('location:updated', { success: true });
      
    } catch (error) {
      logger.error('Location update error:', error);
      socket.emit('error', { message: 'Failed to update location' });
    }
  });

  /**
   * Request artisan location (client)
   */
  socket.on('location:request', async (data) => {
    const { jobId } = data;
    
    try {
      const jobResult = await pool.query(
        `SELECT artisan_id FROM jobs WHERE id = $1 AND client_id = $2`,
        [jobId, userId]
      );
      
      if (jobResult.rows.length === 0) {
        socket.emit('error', { message: 'Unauthorized to request location' });
        return;
      }
      
      const artisanId = jobResult.rows[0].artisan_id;
      const cachedLocation = await redis.get(`location:current:${artisanId}`);
      
      if (cachedLocation) {
        socket.emit('location:artisan', {
          artisanId,
          jobId,
          location: JSON.parse(cachedLocation),
          source: 'cache'
        });
      } else {
        const locationResult = await pool.query(
          `SELECT current_location FROM artisan_profiles WHERE user_id = $1`,
          [artisanId]
        );
        
        if (locationResult.rows[0]?.current_location) {
          socket.emit('location:artisan', {
            artisanId,
            jobId,
            location: locationResult.rows[0].current_location,
            source: 'database'
          });
        } else {
          socket.emit('location:unavailable', { artisanId, jobId });
        }
      }
    } catch (error) {
      logger.error('Location request error:', error);
      socket.emit('error', { message: 'Failed to get location' });
    }
  });

  /**
   * Set artisan availability
   */
  socket.on('artisan:availability', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can set availability' });
      return;
    }
    
    const { isAvailable, location } = data;
    
    try {
      await pool.query(
        `UPDATE artisan_profiles 
         SET is_available = $1, 
             last_availability_change = NOW()
         WHERE user_id = $2`,
        [isAvailable, userId]
      );
      
      if (isAvailable && location) {
        await addArtisanLocation(userId, location.longitude, location.latitude);
        await redis.setex(`artisan:online:${userId}`, 300, 'true');
        io.emit('artisan:online', {
          artisanId: userId,
          location,
          timestamp: new Date()
        });
      } else {
        await removeArtisanLocation(userId);
        await redis.del(`artisan:online:${userId}`);
        io.emit('artisan:offline', {
          artisanId: userId,
          timestamp: new Date()
        });
      }
      
      socket.emit('artisan:availability:updated', { isAvailable, success: true });
      logger.info(`Artisan ${userId} availability set to ${isAvailable}`);
    } catch (error) {
      logger.error('Set availability error:', error);
      socket.emit('error', { message: 'Failed to update availability' });
    }
  });

  /**
   * Heartbeat / ping
   */
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date() });
  });

  /**
   * Get connection status
   */
  socket.on('status:check', () => {
    socket.emit('status:response', {
      connected: true,
      userId,
      userType,
      timestamp: new Date()
    });
  });
};

module.exports = { setupSocketHandlers };