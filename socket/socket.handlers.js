const { pool } = require('../config/database');
const { redis, addArtisanLocation, removeArtisanLocation } = require('../config/redis');
const { logger } = require('../config/logger');
const { emitToUser, emitToRoom } = require('./index');
const { generateArrivalPIN } = require('../utils/geo.utils');

/**
 * Setup socket event handlers
 * @param {socketIO.Server} io - Socket.IO instance
 * @param {socketIO.Socket} socket - Socket instance
 * @param {Object} maps - Maps for tracking connections
 */
const setupSocketHandlers = (io, socket, maps) => {
  const { connectedUsers, socketToUser, userRooms } = maps;
  const userId = socket.userId;
  const userType = socket.userType;

  /**
   * Join a job room
   */
  socket.on('job:join', async (data) => {
    const { jobId } = data;
    
    try {
      // Verify user has access to this job
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
      // Validate coordinates
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
      }
      
      // Update Redis for real-time queries
      await addArtisanLocation(userId, longitude, latitude);
      
      // Store in database
      await pool.query(
        `INSERT INTO location_history (artisan_id, job_id, location, heading, speed, accuracy)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, jobId || null, JSON.stringify({ latitude, longitude }), heading, speed, accuracy]
      );
      
      // Update artisan profile
      await pool.query(
        `UPDATE artisan_profiles 
         SET current_location = $1, last_location_update = NOW()
         WHERE user_id = $2`,
        [JSON.stringify({ latitude, longitude, heading, speed }), userId]
      );
      
      // Cache current location
      await redis.setex(`location:current:${userId}`, 60, JSON.stringify({
        latitude, longitude, heading, speed, timestamp: new Date()
      }));
      
      // If there's an active job, emit location to client
      if (jobId) {
        const jobResult = await pool.query(
          `SELECT client_id FROM jobs WHERE id = $1 AND artisan_id = $2`,
          [jobId, userId]
        );
        
        if (jobResult.rows.length > 0) {
          emitToRoom(`job:${jobId}`, 'location:artisan', {
            artisanId: userId,
            jobId,
            location: { latitude, longitude, heading, speed },
            timestamp: new Date()
          });
        }
      }
      
      // Track for analytics
      await redis.zadd(`artisan:location:history:${userId}`, Date.now(), `${latitude},${longitude}`);
      
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
      // Verify client has access to this job
      const jobResult = await pool.query(
        `SELECT artisan_id FROM jobs WHERE id = $1 AND client_id = $2`,
        [jobId, userId]
      );
      
      if (jobResult.rows.length === 0) {
        socket.emit('error', { message: 'Unauthorized to request location' });
        return;
      }
      
      const artisanId = jobResult.rows[0].artisan_id;
      
      // Get cached location
      const cachedLocation = await redis.get(`location:current:${artisanId}`);
      
      if (cachedLocation) {
        socket.emit('location:artisan', {
          artisanId,
          jobId,
          location: JSON.parse(cachedLocation),
          source: 'cache'
        });
      } else {
        // Get from database
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
         SET is_available = $1, last_availability_change = NOW()
         WHERE user_id = $2`,
        [isAvailable, userId]
      );
      
      if (isAvailable && location) {
        await addArtisanLocation(userId, location.longitude, location.latitude);
        await redis.set(`artisan:online:${userId}`, 'true', 'EX', 300);
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
   * Accept job offer
   */
  socket.on('job:accept', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can accept jobs' });
      return;
    }
    
    const { jobId } = data;
    
    try {
      // Check if job is still available
      const jobResult = await pool.query(
        `SELECT client_id, job_status FROM jobs WHERE id = $1 AND job_status = 'pending'`,
        [jobId]
      );
      
      if (jobResult.rows.length === 0) {
        socket.emit('error', { message: 'Job not available' });
        return;
      }
      
      const clientId = jobResult.rows[0].client_id;
      
      // Update job
      await pool.query(
        `UPDATE jobs 
         SET artisan_id = $1, job_status = 'accepted', accepted_at = NOW()
         WHERE id = $2`,
        [userId, jobId]
      );
      
      // Update artisan availability
      await pool.query(
        `UPDATE artisan_profiles SET is_available = false WHERE user_id = $1`,
        [userId]
      );
      
      // Generate arrival PIN
      const pin = generateArrivalPIN();
      await pool.query(
        `INSERT INTO arrival_pins (job_id, pin, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
        [jobId, pin]
      );
      
      // Notify client
      emitToUser(clientId, 'job:accepted', {
        jobId,
        artisanId: userId,
        status: 'accepted',
        timestamp: new Date()
      });
      
      // Notify other artisans that offer is no longer available
      io.emit('job:offer:expired', { jobId });
      
      socket.emit('job:accepted:confirmed', { jobId, pin });
      logger.info(`Artisan ${userId} accepted job ${jobId}`);
    } catch (error) {
      logger.error('Job accept error:', error);
      socket.emit('error', { message: 'Failed to accept job' });
    }
  });

  /**
   * Confirm arrival with PIN
   */
  socket.on('arrival:confirm', async (data) => {
    const { jobId, pin } = data;
    
    try {
      // Verify PIN
      const pinResult = await pool.query(
        `SELECT * FROM arrival_pins 
         WHERE job_id = $1 AND pin = $2 AND is_used = false AND expires_at > NOW()`,
        [jobId, pin]
      );
      
      if (pinResult.rows.length === 0) {
        socket.emit('error', { message: 'Invalid or expired PIN' });
        return;
      }
      
      // Get job details
      const jobResult = await pool.query(
        `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      const job = jobResult.rows[0];
      
      // Mark PIN as used
      await pool.query(
        `UPDATE arrival_pins SET is_used = true WHERE job_id = $1`,
        [jobId]
      );
      
      // Update job status
      await pool.query(
        `UPDATE jobs SET job_status = 'arrived', arrived_at = NOW() WHERE id = $1`,
        [jobId]
      );
      
      // Create base fee billing
      const baseFee = 2500;
      await pool.query(
        `UPDATE job_billing 
         SET base_fee = $1, billing_status = 'base_charged'
         WHERE job_id = $2`,
        [baseFee, jobId]
      );
      
      // Notify artisan
      emitToUser(job.artisan_id, 'arrival:confirmed', {
        jobId,
        timestamp: new Date()
      });
      
      // Notify room
      emitToRoom(`job:${jobId}`, 'arrival:confirmed', {
        jobId,
        confirmedBy: userId,
        timestamp: new Date()
      });
      
      socket.emit('arrival:confirmed:success', { jobId, baseFee });
      logger.info(`Arrival confirmed for job ${jobId} by ${userId}`);
    } catch (error) {
      logger.error('Arrival confirmation error:', error);
      socket.emit('error', { message: 'Failed to confirm arrival' });
    }
  });

  /**
   * Start diagnostics
   */
  socket.on('diagnostics:start', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can start diagnostics' });
      return;
    }
    
    const { jobId } = data;
    
    try {
      const diagnosticsStart = new Date();
      
      await pool.query(
        `UPDATE jobs 
         SET diagnostics_started_at = $1, job_status = 'diagnostics'
         WHERE id = $2 AND artisan_id = $3`,
        [diagnosticsStart, jobId, userId]
      );
      
      await redis.setex(`diagnostics:${jobId}`, 3600, diagnosticsStart.toISOString());
      
      emitToRoom(`job:${jobId}`, 'diagnostics:started', {
        jobId,
        startTime: diagnosticsStart,
        timestamp: new Date()
      });
      
      socket.emit('diagnostics:started:success', { jobId, startTime: diagnosticsStart });
      logger.info(`Diagnostics started for job ${jobId}`);
    } catch (error) {
      logger.error('Start diagnostics error:', error);
      socket.emit('error', { message: 'Failed to start diagnostics' });
    }
  });

  /**
   * Update diagnostics progress
   */
  socket.on('diagnostics:progress', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can update diagnostics' });
      return;
    }
    
    const { jobId, progress, notes } = data;
    
    try {
      emitToRoom(`job:${jobId}`, 'diagnostics:progress', {
        jobId,
        progress,
        notes,
        timestamp: new Date()
      });
      
      socket.emit('diagnostics:progress:updated', { jobId, progress });
    } catch (error) {
      logger.error('Diagnostics progress error:', error);
      socket.emit('error', { message: 'Failed to update progress' });
    }
  });

  /**
   * Stop diagnostics
   */
  socket.on('diagnostics:stop', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can stop diagnostics' });
      return;
    }
    
    const { jobId, executionMode, findings } = data;
    
    try {
      const diagnosticsEnd = new Date();
      const diagnosticsStart = await redis.get(`diagnostics:${jobId}`);
      
      if (!diagnosticsStart) {
        socket.emit('error', { message: 'Diagnostics not started' });
        return;
      }
      
      const startTime = new Date(diagnosticsStart);
      const diagnosticsDuration = (diagnosticsEnd - startTime) / 1000 / 60;
      const diagnosticsFee = Math.ceil(diagnosticsDuration * 500);
      
      await pool.query(
        `UPDATE jobs 
         SET diagnostics_ended_at = $1, 
             billing_mode = $2,
             diagnostics_findings = $3,
             job_status = 'awaiting_execution_approval'
         WHERE id = $4 AND artisan_id = $5`,
        [diagnosticsEnd, executionMode, findings, jobId, userId]
      );
      
      await pool.query(
        `UPDATE job_billing 
         SET diagnostics_fee = $1, diagnostics_duration = $2
         WHERE job_id = $3`,
        [diagnosticsFee, diagnosticsDuration, jobId]
      );
      
      await redis.del(`diagnostics:${jobId}`);
      
      emitToRoom(`job:${jobId}`, 'diagnostics:completed', {
        jobId,
        duration: diagnosticsDuration,
        fee: diagnosticsFee,
        executionMode,
        findings,
        timestamp: new Date()
      });
      
      socket.emit('diagnostics:completed:success', {
        jobId,
        duration: diagnosticsDuration,
        fee: diagnosticsFee,
        executionMode
      });
      
      logger.info(`Diagnostics completed for job ${jobId}: ${diagnosticsDuration} minutes`);
    } catch (error) {
      logger.error('Stop diagnostics error:', error);
      socket.emit('error', { message: 'Failed to stop diagnostics' });
    }
  });

  /**
   * Start execution (time-based)
   */
  socket.on('execution:start', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can start execution' });
      return;
    }
    
    const { jobId } = data;
    
    try {
      const executionStart = new Date();
      
      await pool.query(
        `UPDATE jobs 
         SET execution_started_at = $1, job_status = 'execution'
         WHERE id = $2 AND artisan_id = $3 AND billing_mode = 'time_based'`,
        [executionStart, jobId, userId]
      );
      
      await redis.setex(`execution:${jobId}`, 28800, executionStart.toISOString());
      
      emitToRoom(`job:${jobId}`, 'execution:started', {
        jobId,
        startTime: executionStart,
        timestamp: new Date()
      });
      
      socket.emit('execution:started:success', { jobId, startTime: executionStart });
      logger.info(`Execution started for job ${jobId}`);
    } catch (error) {
      logger.error('Start execution error:', error);
      socket.emit('error', { message: 'Failed to start execution' });
    }
  });

  /**
   * Pause execution
   */
  socket.on('execution:pause', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can pause execution' });
      return;
    }
    
    const { jobId, reason, duration } = data;
    
    try {
      const pauseStart = new Date();
      
      await pool.query(
        `UPDATE jobs SET job_status = 'paused' WHERE id = $1 AND artisan_id = $2`,
        [jobId, userId]
      );
      
      await redis.setex(`execution:pause:${jobId}`, duration || 3600, JSON.stringify({
        reason,
        pauseStart: pauseStart.toISOString(),
        expectedDuration: duration
      }));
      
      emitToRoom(`job:${jobId}`, 'execution:paused', {
        jobId,
        reason,
        pauseStart,
        expectedDuration: duration,
        timestamp: new Date()
      });
      
      socket.emit('execution:paused:success', { jobId, pauseStart });
      logger.info(`Execution paused for job ${jobId}: ${reason}`);
    } catch (error) {
      logger.error('Pause execution error:', error);
      socket.emit('error', { message: 'Failed to pause execution' });
    }
  });

  /**
   * Resume execution
   */
  socket.on('execution:resume', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can resume execution' });
      return;
    }
    
    const { jobId } = data;
    
    try {
      const pauseData = await redis.get(`execution:pause:${jobId}`);
      
      if (!pauseData) {
        socket.emit('error', { message: 'Execution not paused' });
        return;
      }
      
      const pauseInfo = JSON.parse(pauseData);
      const pauseDuration = (new Date() - new Date(pauseInfo.pauseStart)) / 1000;
      
      await pool.query(
        `UPDATE jobs SET job_status = 'execution' WHERE id = $1 AND artisan_id = $2`,
        [jobId, userId]
      );
      
      await redis.del(`execution:pause:${jobId}`);
      
      emitToRoom(`job:${jobId}`, 'execution:resumed', {
        jobId,
        pauseDuration,
        timestamp: new Date()
      });
      
      socket.emit('execution:resumed:success', { jobId, pauseDuration });
      logger.info(`Execution resumed for job ${jobId}, paused for ${pauseDuration} seconds`);
    } catch (error) {
      logger.error('Resume execution error:', error);
      socket.emit('error', { message: 'Failed to resume execution' });
    }
  });

  /**
   * Stop execution
   */
  socket.on('execution:stop', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can stop execution' });
      return;
    }
    
    const { jobId } = data;
    
    try {
      const executionEnd = new Date();
      const executionStart = await redis.get(`execution:${jobId}`);
      
      if (!executionStart) {
        socket.emit('error', { message: 'Execution not started' });
        return;
      }
      
      // Calculate total execution time
      const startTime = new Date(executionStart);
      let totalDuration = (executionEnd - startTime) / 1000 / 60;
      
      // Subtract pause time if any
      const pauseData = await redis.get(`execution:pause:${jobId}`);
      if (pauseData) {
        const pauseInfo = JSON.parse(pauseData);
        const pauseDuration = (new Date(pauseInfo.pauseStart) - startTime) / 1000 / 60;
        totalDuration -= pauseDuration;
      }
      
      const executionFee = Math.ceil(totalDuration * 1000);
      
      await pool.query(
        `UPDATE jobs 
         SET execution_ended_at = $1, job_status = 'awaiting_completion_confirmation'
         WHERE id = $2 AND artisan_id = $3`,
        [executionEnd, jobId, userId]
      );
      
      await pool.query(
        `UPDATE job_billing 
         SET execution_fee = $1, execution_duration = $2
         WHERE job_id = $3`,
        [executionFee, totalDuration, jobId]
      );
      
      await redis.del(`execution:${jobId}`);
      await redis.del(`execution:pause:${jobId}`);
      
      emitToRoom(`job:${jobId}`, 'execution:completed', {
        jobId,
        duration: totalDuration,
        fee: executionFee,
        timestamp: new Date()
      });
      
      socket.emit('execution:completed:success', { jobId, duration: totalDuration, fee: executionFee });
      logger.info(`Execution completed for job ${jobId}: ${totalDuration} minutes`);
    } catch (error) {
      logger.error('Stop execution error:', error);
      socket.emit('error', { message: 'Failed to stop execution' });
    }
  });

  /**
   * Submit quote (quoted mode)
   */
  socket.on('quote:submit', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can submit quotes' });
      return;
    }
    
    const { jobId, quoteAmount, quoteDetails, estimatedDuration } = data;
    
    try {
      await pool.query(
        `UPDATE jobs 
         SET quoted_amount = $1, 
             quote_details = $2,
             estimated_duration = $3,
             job_status = 'pending_quote_approval'
         WHERE id = $4 AND artisan_id = $5 AND billing_mode = 'quoted'`,
        [quoteAmount, quoteDetails, estimatedDuration, jobId, userId]
      );
      
      // Get client ID for notification
      const jobResult = await pool.query(
        `SELECT client_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      emitToUser(jobResult.rows[0].client_id, 'quote:received', {
        jobId,
        quoteAmount,
        quoteDetails,
        estimatedDuration,
        timestamp: new Date()
      });
      
      socket.emit('quote:submitted:success', { jobId, quoteAmount });
      logger.info(`Quote submitted for job ${jobId}: ₦${quoteAmount}`);
    } catch (error) {
      logger.error('Submit quote error:', error);
      socket.emit('error', { message: 'Failed to submit quote' });
    }
  });

  /**
   * Approve quote (client)
   */
  socket.on('quote:approve', async (data) => {
    if (userType !== 'client') {
      socket.emit('error', { message: 'Only clients can approve quotes' });
      return;
    }
    
    const { jobId } = data;
    
    try {
      await pool.query(
        `UPDATE jobs 
         SET job_status = 'quote_approved', quote_approved_at = NOW()
         WHERE id = $1 AND client_id = $2 AND job_status = 'pending_quote_approval'`,
        [jobId, userId]
      );
      
      // Get artisan ID for notification
      const jobResult = await pool.query(
        `SELECT artisan_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      emitToUser(jobResult.rows[0].artisan_id, 'quote:approved', {
        jobId,
        timestamp: new Date()
      });
      
      socket.emit('quote:approved:success', { jobId });
      logger.info(`Quote approved for job ${jobId}`);
    } catch (error) {
      logger.error('Approve quote error:', error);
      socket.emit('error', { message: 'Failed to approve quote' });
    }
  });

  /**
   * Reject quote (client)
   */
  socket.on('quote:reject', async (data) => {
    if (userType !== 'client') {
      socket.emit('error', { message: 'Only clients can reject quotes' });
      return;
    }
    
    const { jobId, reason } = data;
    
    try {
      await pool.query(
        `UPDATE jobs 
         SET job_status = 'quote_rejected', 
             quote_rejection_reason = $1,
             quote_rejected_at = NOW()
         WHERE id = $2 AND client_id = $3 AND job_status = 'pending_quote_approval'`,
        [reason, jobId, userId]
      );
      
      // Get artisan ID for notification
      const jobResult = await pool.query(
        `SELECT artisan_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      emitToUser(jobResult.rows[0].artisan_id, 'quote:rejected', {
        jobId,
        reason,
        timestamp: new Date()
      });
      
      socket.emit('quote:rejected:success', { jobId });
      logger.info(`Quote rejected for job ${jobId}: ${reason}`);
    } catch (error) {
      logger.error('Reject quote error:', error);
      socket.emit('error', { message: 'Failed to reject quote' });
    }
  });

  /**
   * Complete job
   */
  socket.on('job:complete', async (data) => {
    if (userType !== 'artisan') {
      socket.emit('error', { message: 'Only artisans can complete jobs' });
      return;
    }
    
    const { jobId, completionNotes } = data;
    
    try {
      const completionTime = new Date();
      
      await pool.query(
        `UPDATE jobs 
         SET job_status = 'completed', 
             completed_at = $1,
             completion_notes = $2
         WHERE id = $3 AND artisan_id = $4`,
        [completionTime, completionNotes, jobId, userId]
      );
      
      // Get client ID for notification
      const jobResult = await pool.query(
        `SELECT client_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      emitToUser(jobResult.rows[0].client_id, 'job:completed', {
        jobId,
        completionTime,
        completionNotes,
        timestamp: new Date()
      });
      
      emitToRoom(`job:${jobId}`, 'job:completed', {
        jobId,
        completionTime,
        timestamp: new Date()
      });
      
      socket.emit('job:completed:success', { jobId });
      logger.info(`Job ${jobId} completed by artisan ${userId}`);
    } catch (error) {
      logger.error('Complete job error:', error);
      socket.emit('error', { message: 'Failed to complete job' });
    }
  });

  /**
   * Cancel job
   */
  socket.on('job:cancel', async (data) => {
    const { jobId, reason } = data;
    
    try {
      const jobResult = await pool.query(
        `SELECT client_id, artisan_id, job_status FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      if (jobResult.rows.length === 0) {
        socket.emit('error', { message: 'Job not found' });
        return;
      }
      
      const job = jobResult.rows[0];
      let canCancel = false;
      
      if (userType === 'client' && job.client_id === userId) {
        canCancel = job.job_status === 'pending';
      } else if (userType === 'artisan' && job.artisan_id === userId) {
        canCancel = ['accepted', 'arrived', 'diagnostics'].includes(job.job_status);
      }
      
      if (!canCancel) {
        socket.emit('error', { message: 'Cannot cancel job at this stage' });
        return;
      }
      
      await pool.query(
        `UPDATE jobs 
         SET job_status = 'cancelled', 
             cancelled_at = NOW(),
             cancellation_reason = $1,
             cancelled_by = $2
         WHERE id = $3`,
        [reason, userType, jobId]
      );
      
      // Make artisan available again
      if (job.artisan_id) {
        await pool.query(
          `UPDATE artisan_profiles SET is_available = true WHERE user_id = $1`,
          [job.artisan_id]
        );
      }
      
      // Notify other party
      const otherPartyId = userType === 'client' ? job.artisan_id : job.client_id;
      if (otherPartyId) {
        emitToUser(otherPartyId, 'job:cancelled', {
          jobId,
          reason,
          cancelledBy: userType,
          timestamp: new Date()
        });
      }
      
      emitToRoom(`job:${jobId}`, 'job:cancelled', {
        jobId,
        reason,
        cancelledBy: userType,
        timestamp: new Date()
      });
      
      socket.emit('job:cancelled:success', { jobId });
      logger.info(`Job ${jobId} cancelled by ${userType}: ${reason}`);
    } catch (error) {
      logger.error('Cancel job error:', error);
      socket.emit('error', { message: 'Failed to cancel job' });
    }
  });

  /**
   * Send message in job chat
   */
  socket.on('chat:message', async (data) => {
    const { jobId, message, attachments } = data;
    
    try {
      // Verify user has access to this job
      const jobResult = await pool.query(
        `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      if (jobResult.rows.length === 0) {
        socket.emit('error', { message: 'Job not found' });
        return;
      }
      
      const job = jobResult.rows[0];
      
      if (job.client_id !== userId && job.artisan_id !== userId) {
        socket.emit('error', { message: 'Unauthorized to send message' });
        return;
      }
      
      // Store message in database
      const messageResult = await pool.query(
        `INSERT INTO chat_messages (job_id, sender_id, message, attachments, sent_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, sent_at`,
        [jobId, userId, message, attachments || []]
      );
      
      const messageData = {
        id: messageResult.rows[0].id,
        jobId,
        senderId: userId,
        senderType: userType,
        message,
        attachments,
        sentAt: messageResult.rows[0].sent_at
      };
      
      // Emit to room
      emitToRoom(`job:${jobId}`, 'chat:message:received', messageData);
      
      socket.emit('chat:message:sent', { ...messageData, success: true });
      logger.info(`Chat message sent in job ${jobId} by ${userId}`);
    } catch (error) {
      logger.error('Chat message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  /**
   * Typing indicator
   */
  socket.on('typing:start', (data) => {
    const { jobId } = data;
    socket.to(`job:${jobId}`).emit('typing:started', {
      userId,
      userType,
      jobId,
      timestamp: new Date()
    });
  });

  socket.on('typing:stop', (data) => {
    const { jobId } = data;
    socket.to(`job:${jobId}`).emit('typing:stopped', {
      userId,
      userType,
      jobId,
      timestamp: new Date()
    });
  });

  /**
   * Mark messages as read
   */
  socket.on('chat:read', async (data) => {
    const { jobId } = data;
    
    try {
      await pool.query(
        `UPDATE chat_messages 
         SET read_at = NOW()
         WHERE job_id = $1 AND sender_id != $2 AND read_at IS NULL`,
        [jobId, userId]
      );
      
      socket.to(`job:${jobId}`).emit('chat:read:confirmed', {
        jobId,
        userId,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Mark read error:', error);
    }
  });

  /**
   * Get unread message count
   */
  socket.on('chat:unread', async (data) => {
    const { jobId } = data;
    
    try {
      const result = await pool.query(
        `SELECT COUNT(*) FROM chat_messages 
         WHERE job_id = $1 AND sender_id != $2 AND read_at IS NULL`,
        [jobId, userId]
      );
      
      socket.emit('chat:unread:count', {
        jobId,
        count: parseInt(result.rows[0].count)
      });
    } catch (error) {
      logger.error('Get unread count error:', error);
    }
  });

  /**
   * Get chat history
   */
  socket.on('chat:history', async (data) => {
    const { jobId, limit = 50, before } = data;
    
    try {
      let query = `
        SELECT id, sender_id, message, attachments, sent_at, read_at
        FROM chat_messages
        WHERE job_id = $1
      `;
      const params = [jobId];
      
      if (before) {
        query += ` AND sent_at < $2`;
        params.push(before);
      }
      
      query += ` ORDER BY sent_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      
      const result = await pool.query(query, params);
      
      socket.emit('chat:history:loaded', {
        jobId,
        messages: result.rows.reverse(),
        hasMore: result.rows.length === limit
      });
    } catch (error) {
      logger.error('Get chat history error:', error);
      socket.emit('error', { message: 'Failed to load chat history' });
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