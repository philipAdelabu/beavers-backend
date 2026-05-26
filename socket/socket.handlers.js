const { pool } = require('../config/database');
const { addArtisanLocation, removeArtisanLocation, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');

// Track connections
const userSockets = new Map(); // userId -> socketId
const socketUsers = new Map(); // socketId -> userId

const setupSocketHandlers = (io, socket, maps = {}) => {
  const userId = socket.userId;
  const userType = socket.userType;

  // Store user socket mapping
  userSockets.set(userId, socket.id);
  socketUsers.set(socket.id, userId);

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Handle joining job room
  socket.on('join-job', async (data) => {
    const { jobId } = data;
    
    try {
      // Verify user has access to this job
      const result = await pool.query(
        `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      if (result.rows.length > 0 && 
          (result.rows[0].client_id === userId || result.rows[0].artisan_id === userId)) {
        socket.join(`job:${jobId}`);
        socket.emit('job-joined', { jobId, success: true });
        logger.info(`User ${userId} joined job room: ${jobId}`);
      } else {
        socket.emit('error', { message: 'Unauthorized to join this job' });
      }
    } catch (error) {
      logger.error('Error joining job room:', error);
      socket.emit('error', { message: 'Failed to join job room' });
    }
  });

  // Handle leaving job room
  socket.on('leave-job', (data) => {
    const { jobId } = data;
    socket.leave(`job:${jobId}`);
    socket.emit('job-left', { jobId, success: true });
  });

  // Handle real-time location updates (artisan only)
  socket.on('update-location', async (data) => {
    if (userType !== 'artisan') return;

    const { latitude, longitude, heading, speed, jobId } = data;

    try {
      // Update Redis for quick lookups
      await addArtisanLocation(userId, longitude, latitude);

      // Store in database
      await pool.query(
        `INSERT INTO location_history (artisan_id, job_id, location)
         VALUES ($1, $2, $3)`,
        [userId, jobId || null, JSON.stringify({ latitude, longitude, heading, speed })]
      );

      // Update artisan profile
      await pool.query(
        `UPDATE artisan_profiles 
         SET current_location = $1, last_location_update = NOW()
         WHERE user_id = $2`,
        [JSON.stringify({ latitude, longitude, heading, speed }), userId]
      );

      // If there's an active job, emit location to client
      if (jobId) {
        const jobResult = await pool.query(
          `SELECT client_id FROM jobs WHERE id = $1 AND artisan_id = $2`,
          [jobId, userId]
        );

        if (jobResult.rows.length > 0) {
          // Call the emitLocationUpdate function
          emitLocationUpdate(jobResult.rows[0].client_id, {
            artisanId: userId,
            jobId,
            location: { latitude, longitude, heading, speed },
            timestamp: new Date()
          });
        }
      }

      // Cache current location
      await cacheSet(`location:${userId}`, { latitude, longitude, heading, speed, timestamp: new Date() }, 60);

    } catch (error) {
      logger.error('Location update error:', error);
      socket.emit('error', { message: 'Failed to update location' });
    }
  });

  // Handle artisan availability
  socket.on('set-availability', async (data) => {
    if (userType !== 'artisan') return;

    const { isAvailable, location } = data;
    
    try {
      await pool.query(
        `UPDATE artisan_profiles SET is_available = $1 WHERE user_id = $2`,
        [isAvailable, userId]
      );

      if (isAvailable && location) {
        await addArtisanLocation(userId, location.longitude, location.latitude);
        io.emit('artisan-online', {
          artisanId: userId,
          location
        });
      } else {
        await removeArtisanLocation(userId);
        io.emit('artisan-offline', { artisanId: userId });
      }

      socket.emit('availability-updated', { isAvailable, success: true });
    } catch (error) {
      logger.error('Set availability error:', error);
      socket.emit('error', { message: 'Failed to update availability' });
    }
  });

  // Handle job acceptance
  socket.on('accept-job', async (data) => {
    const { jobId } = data;
    
    try {
      const jobResult = await pool.query(
        `SELECT client_id FROM jobs WHERE id = $1`,
        [jobId]
      );

      if (jobResult.rows.length > 0) {
        emitToClient(jobResult.rows[0].client_id, 'job-accepted', {
          jobId,
          artisanId: userId,
          status: 'accepted'
        });
      }
    } catch (error) {
      logger.error('Accept job error:', error);
      socket.emit('error', { message: 'Failed to accept job' });
    }
  });

  // Handle arrival confirmation
  socket.on('confirm-arrival', async (data) => {
    const { jobId, pin } = data;
    
    try {
      const pinResult = await pool.query(
        `SELECT * FROM arrival_pins WHERE job_id = $1 AND pin = $2 AND is_used = false`,
        [jobId, pin]
      );

      if (pinResult.rows.length > 0) {
        await pool.query(
          `UPDATE arrival_pins SET is_used = true WHERE id = $1`,
          [pinResult.rows[0].id]
        );

        emitToJob(jobId, 'arrival-confirmed', {
          jobId,
          timestamp: new Date()
        });
      } else {
        socket.emit('invalid-pin', { jobId });
      }
    } catch (error) {
      logger.error('Confirm arrival error:', error);
      socket.emit('error', { message: 'Failed to confirm arrival' });
    }
  });

  // Handle typing indicators
  socket.on('client-typing', (data) => {
    const { jobId, isTyping } = data;
    socket.to(`job:${jobId}`).emit('client-typing', { jobId, isTyping });
  });

  socket.on('artisan-typing', (data) => {
    const { jobId, isTyping } = data;
    socket.to(`job:${jobId}`).emit('artisan-typing', { jobId, isTyping });
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    logger.info(`User disconnected: ${socket.id}`);
    
    const userId = socketUsers.get(socket.id);
    if (userId) {
      userSockets.delete(userId);
      socketUsers.delete(socket.id);
      
      // If artisan disconnects, mark as unavailable
      if (socket.user?.user_type === 'artisan') {
        await removeArtisanLocation(userId);
        await pool.query(
          `UPDATE artisan_profiles SET is_available = false WHERE user_id = $1`,
          [userId]
        );
        io.emit('artisan-offline', { artisanId: userId });
      }
    }
  });
};

// ============================================
// EXPORTED HELPER FUNCTIONS
// ============================================

/**
 * Emit event to specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
const emitToUser = (userId, event, data) => {
  const socketId = userSockets.get(userId);
  if (socketId && global.io) {
    global.io.to(socketId).emit(event, data);
  }
};

/**
 * Emit event to client (alias for emitToUser)
 * @param {string} clientId - Client ID
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
const emitToClient = (clientId, event, data) => {
  emitToUser(clientId, event, data);
};

/**
 * Emit event to artisan (alias for emitToUser)
 * @param {string} artisanId - Artisan ID
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
const emitToArtisan = (artisanId, event, data) => {
  emitToUser(artisanId, event, data);
};

/**
 * Emit event to a job room
 * @param {string} jobId - Job ID
 * @param {string} event - Event name
 * @param {*} data - Event data
 */
const emitToJob = (jobId, event, data) => {
  if (global.io) {
    global.io.to(`job:${jobId}`).emit(event, data);
  }
};

/**
 * Emit location update to client
 * @param {string} clientId - Client ID
 * @param {*} data - Location data
 */
const emitLocationUpdate = (clientId, data) => {
  emitToClient(clientId, 'artisan-location-update', data);
};

// Export all functions
module.exports = {
  setupSocketHandlers,
  emitToUser,
  emitToClient,
  emitToArtisan,
  emitToJob,
  emitLocationUpdate
};