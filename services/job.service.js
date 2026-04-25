const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel, getNearbyArtisans } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');
const { generateArrivalPIN, calculateDistance } = require('../utils/geo.utils');
const Wallet = require('../models/Wallet');

class JobService {
  static async createJob(clientId, jobData) {
    const { category, description, mediaUrls, serviceType, location } = jobData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create job
      const jobResult = await client.query(
        `INSERT INTO jobs 
         (client_id, category, description, media_urls, service_type, job_status, location)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         RETURNING *`,
        [clientId, category, description, mediaUrls || [], serviceType, location]
      );
      
      const job = jobResult.rows[0];
      
      // Create job billing record
      await client.query(
        `INSERT INTO job_billing (job_id, billing_status)
         VALUES ($1, 'pending')`,
        [job.id]
      );
      
      // Find and notify nearby artisans
      const nearbyArtisans = await this.findNearbyArtisans(category, location, 10);
      
      const offers = [];
      for (const artisan of nearbyArtisans.slice(0, 5)) {
        const offerResult = await client.query(
          `INSERT INTO job_offers (job_id, artisan_id, status, expires_at)
           VALUES ($1, $2, 'pending', NOW() + INTERVAL '2 minutes')
           RETURNING *`,
          [job.id, artisan.user_id]
        );
        
        offers.push(offerResult.rows[0]);
        
        // Send real-time notification via Socket.IO
        await NotificationService.sendJobOfferNotification(artisan.user_id, {
          jobId: job.id,
          category: job.category,
          description: job.description,
          distance: artisan.distance,
          serviceType: job.service_type
        });
      }
      
      await client.query('COMMIT');
      
      logger.info(`Job created: ${job.id} by client ${clientId}`);
      
      return {
        job,
        offersSent: offers.length
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async findNearbyArtisans(category, location, radius = 10) {
    // Get artisans from Redis geo index
    const nearby = await getNearbyArtisans(location.longitude, location.latitude, radius);
    
    if (nearby.length === 0) {
      return [];
    }
    
    const artisanIds = nearby.map(([id]) => id);
    
    // Get artisan details from database with ranking
    const result = await pool.query(
      `SELECT ap.user_id, ap.full_legal_name, ap.tier_level, ap.star_rating, 
              ap.completion_rate, ap.trust_score, ap.skill_category,
              u.is_active
       FROM artisan_profiles ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.user_id = ANY($1::uuid[])
         AND ap.is_available = true
         AND u.is_active = true
         AND ap.monthly_fee_status = 'paid'
         AND ap.skill_category = $2
       ORDER BY ap.tier_level DESC, ap.star_rating DESC, ap.completion_rate DESC`,
      [artisanIds, category]
    );
    
    // Calculate priority scores
    const artisansWithDistance = result.rows.map(artisan => {
      const distance = nearby.find(([id]) => id === artisan.user_id)[1];
      const score = this.calculatePriorityScore(artisan, parseFloat(distance));
      return { ...artisan, distance: parseFloat(distance), score };
    });
    
    return artisansWithDistance.sort((a, b) => b.score - a.score);
  }
  
  static calculatePriorityScore(artisan, distance) {
    const tierWeight = artisan.tier_level === 3 ? 0.4 : artisan.tier_level === 2 ? 0.3 : 0.2;
    const ratingWeight = (artisan.star_rating / 5) * 0.3;
    const distanceWeight = Math.max(0, 1 - (distance / 10)) * 0.2;
    const completionWeight = (artisan.completion_rate / 100) * 0.1;
    const trustWeight = (artisan.trust_score / 100) * 0.1;
    
    return (tierWeight + ratingWeight + distanceWeight + completionWeight + trustWeight) * 100;
  }
  
  static async acceptJob(jobId, artisanId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if job is still available
      const jobResult = await client.query(
        `SELECT * FROM jobs WHERE id = $1 AND job_status = 'pending' FOR UPDATE`,
        [jobId]
      );
      
      if (jobResult.rows.length === 0) {
        throw new AppError(404, 'Job not available');
      }
      
      const job = jobResult.rows[0];
      
      // Check offer
      const offerResult = await client.query(
        `SELECT * FROM job_offers 
         WHERE job_id = $1 AND artisan_id = $2 AND status = 'pending'
         AND expires_at > NOW()`,
        [jobId, artisanId]
      );
      
      if (offerResult.rows.length === 0) {
        throw new AppError(400, 'No valid offer found');
      }
      
      // Update job
      await client.query(
        `UPDATE jobs 
         SET artisan_id = $1, job_status = 'accepted', accepted_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [artisanId, jobId]
      );
      
      // Update offer status
      await client.query(
        `UPDATE job_offers SET status = 'accepted' WHERE job_id = $1 AND artisan_id = $2`,
        [jobId, artisanId]
      );
      
      // Reject other offers
      await client.query(
        `UPDATE job_offers SET status = 'rejected' 
         WHERE job_id = $1 AND artisan_id != $2 AND status = 'pending'`,
        [jobId, artisanId]
      );
      
      // Set artisan as unavailable
      await client.query(
        `UPDATE artisan_profiles SET is_available = false WHERE user_id = $1`,
        [artisanId]
      );
      
      // Generate arrival PIN
      const pin = generateArrivalPIN();
      await client.query(
        `INSERT INTO arrival_pins (job_id, pin, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
        [jobId, pin]
      );
      
      await client.query('COMMIT');
      
      // Send notifications
      await NotificationService.sendJobAcceptedNotification(job.client_id, {
        jobId,
        artisanId,
        artisanName: offerResult.rows[0].artisan_name
      });
      
      logger.info(`Job ${jobId} accepted by artisan ${artisanId}`);
      
      return { job, pin };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async confirmArrival(jobId, clientId, pin) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify PIN
      const pinResult = await client.query(
        `SELECT * FROM arrival_pins 
         WHERE job_id = $1 AND pin = $2 AND is_used = false AND expires_at > NOW()`,
        [jobId, pin]
      );
      
      if (pinResult.rows.length === 0) {
        throw new AppError(400, 'Invalid or expired PIN');
      }
      
      // Mark PIN as used
      await client.query(
        `UPDATE arrival_pins SET is_used = true WHERE job_id = $1 AND pin = $2`,
        [jobId, pin]
      );
      
      // Update job status
      await client.query(
        `UPDATE jobs SET job_status = 'arrived', arrived_at = NOW(), updated_at = NOW() 
         WHERE id = $1`,
        [jobId]
      );
      
      // Create base fee billing
      const baseFee = 2500; // Configurable
      await client.query(
        `UPDATE job_billing 
         SET base_fee = $1, billing_status = 'base_charged'
         WHERE job_id = $2`,
        [baseFee, jobId]
      );
      
      // Create escrow hold for base fee
      await client.query(
        `INSERT INTO escrow_transactions (job_id, client_id, artisan_id, amount, transaction_type, status)
         SELECT $1, $2, artisan_id, $3, 'base_fee', 'held'
         FROM jobs WHERE id = $1`,
        [jobId, clientId, baseFee]
      );
      
      await client.query('COMMIT');
      
      // Get artisan ID for notification
      const jobResult = await client.query(
        `SELECT artisan_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      await NotificationService.sendArrivalNotification(jobResult.rows[0].artisan_id, { jobId });
      
      logger.info(`Arrival confirmed for job ${jobId}`);
      
      return { baseFee };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async startDiagnostics(jobId, artisanId) {
    const diagnosticsStart = new Date();
    
    const result = await pool.query(
      `UPDATE jobs 
       SET diagnostics_started_at = $1, job_status = 'diagnostics'
       WHERE id = $2 AND artisan_id = $3
       RETURNING *`,
      [diagnosticsStart, jobId, artisanId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Job not found or unauthorized');
    }
    
    await cacheSet(`job:${jobId}:diagnostics_start`, diagnosticsStart.toISOString(), 3600);
    
    logger.info(`Diagnostics started for job ${jobId}`);
    
    return { startTime: diagnosticsStart };
  }
  
  static async stopDiagnostics(jobId, artisanId, executionMode) {
    const diagnosticsEnd = new Date();
    const diagnosticsStart = await cacheGet(`job:${jobId}:diagnostics_start`);
    
    if (!diagnosticsStart) {
      throw new AppError(400, 'Diagnostics not started');
    }
    
    const startTime = new Date(diagnosticsStart);
    const diagnosticsDuration = (diagnosticsEnd - startTime) / 1000 / 60; // minutes
    const diagnosticsFee = Math.ceil(diagnosticsDuration * 500); // ₦500 per minute
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE jobs 
         SET diagnostics_ended_at = $1, 
             billing_mode = $2, 
             job_status = 'awaiting_execution_approval'
         WHERE id = $3 AND artisan_id = $4
         RETURNING *`,
        [diagnosticsEnd, executionMode, jobId, artisanId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Job not found or unauthorized');
      }
      
      // Update billing with diagnostics fee
      await client.query(
        `UPDATE job_billing 
         SET diagnostics_fee = $1, diagnostics_duration = $2
         WHERE job_id = $3`,
        [diagnosticsFee, diagnosticsDuration, jobId]
      );
      
      // Update escrow for diagnostics
      await client.query(
        `INSERT INTO escrow_transactions (job_id, client_id, artisan_id, amount, transaction_type, status)
         SELECT $1, client_id, artisan_id, $2, 'diagnostics_fee', 'held'
         FROM jobs WHERE id = $1`,
        [jobId, diagnosticsFee]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Diagnostics completed for job ${jobId}: ${diagnosticsDuration} minutes, ₦${diagnosticsFee}`);
      
      return {
        duration: diagnosticsDuration,
        fee: diagnosticsFee,
        executionMode
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async startExecution(jobId, artisanId) {
    const executionStart = new Date();
    
    const result = await pool.query(
      `UPDATE jobs 
       SET execution_started_at = $1, job_status = 'execution'
       WHERE id = $2 AND artisan_id = $3 AND billing_mode = 'time_based'
       RETURNING *`,
      [executionStart, jobId, artisanId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Job not found or not in time-based mode');
    }
    
    await cacheSet(`job:${jobId}:execution_start`, executionStart.toISOString(), 28800); // 8 hours
    
    logger.info(`Execution started for job ${jobId}`);
    
    return { startTime: executionStart };
  }
  
  static async pauseExecution(jobId, artisanId, reason, duration = null) {
    const executionStart = await cacheGet(`job:${jobId}:execution_start`);
    
    if (!executionStart) {
      throw new AppError(400, 'Execution not started');
    }
    
    const pauseStart = new Date();
    
    await cacheSet(`job:${jobId}:execution_paused`, {
      reason,
      pauseStart: pauseStart.toISOString(),
      expectedDuration: duration
    }, duration || 3600);
    
    await pool.query(
      `UPDATE jobs SET job_status = 'paused' WHERE id = $1 AND artisan_id = $2`,
      [jobId, artisanId]
    );
    
    logger.info(`Execution paused for job ${jobId}: ${reason}`);
    
    return { pauseStart, reason };
  }
  
  static async resumeExecution(jobId, artisanId) {
    const pauseData = await cacheGet(`job:${jobId}:execution_paused`);
    
    if (!pauseData) {
      throw new AppError(400, 'Job not paused');
    }
    
    const pauseDuration = (new Date() - new Date(pauseData.pauseStart)) / 1000; // seconds
    
    await cacheDel(`job:${jobId}:execution_paused`);
    
    await pool.query(
      `UPDATE jobs SET job_status = 'execution' WHERE id = $1 AND artisan_id = $2`,
      [jobId, artisanId]
    );
    
    logger.info(`Execution resumed for job ${jobId}, paused for ${pauseDuration} seconds`);
    
    return { pauseDuration };
  }
  
  static async stopExecution(jobId, artisanId) {
    const executionEnd = new Date();
    const executionStart = await cacheGet(`job:${jobId}:execution_start`);
    
    if (!executionStart) {
      throw new AppError(400, 'Execution not started');
    }
    
    // Calculate total execution time excluding pauses
    const startTime = new Date(executionStart);
    let totalDuration = (executionEnd - startTime) / 1000 / 60; // minutes
    
    // Subtract pause time if any
    const pauseData = await cacheGet(`job:${jobId}:execution_paused`);
    if (pauseData) {
      const pauseDuration = (new Date(pauseData.pauseStart) - startTime) / 1000 / 60;
      totalDuration -= pauseDuration;
    }
    
    const executionFee = Math.ceil(totalDuration * 1000); // ₦1000 per minute
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE jobs 
         SET execution_ended_at = $1, job_status = 'awaiting_completion_confirmation'
         WHERE id = $2 AND artisan_id = $3
         RETURNING *`,
        [executionEnd, jobId, artisanId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Job not found or unauthorized');
      }
      
      // Update billing
      await client.query(
        `UPDATE job_billing 
         SET execution_fee = $1, execution_duration = $2
         WHERE job_id = $3`,
        [executionFee, totalDuration, jobId]
      );
      
      await client.query('COMMIT');
      
      await cacheDel(`job:${jobId}:execution_start`);
      await cacheDel(`job:${jobId}:execution_paused`);
      
      logger.info(`Execution completed for job ${jobId}: ${totalDuration} minutes, ₦${executionFee}`);
      
      return {
        duration: totalDuration,
        fee: executionFee
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async submitQuote(jobId, artisanId, quoteData) {
    const { quoteAmount, quoteDetails, estimatedDuration } = quoteData;
    
    const result = await pool.query(
      `UPDATE jobs 
       SET quoted_amount = $1, 
           quote_details = $2,
           estimated_duration = $3,
           job_status = 'pending_quote_approval'
       WHERE id = $4 AND artisan_id = $5 AND billing_mode = 'quoted'
       RETURNING *`,
      [quoteAmount, quoteDetails, estimatedDuration, jobId, artisanId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Job not found or not in quoted mode');
    }
    
    // Notify client
    const job = result.rows[0];
    await NotificationService.sendPushNotification(
      job.client_id,
      'Quote Received',
      `Artisan has submitted a quote of ₦${quoteAmount.toLocaleString()} for your job`,
      { jobId, type: 'quote_received' }
    );
    
    logger.info(`Quote submitted for job ${jobId}: ₦${quoteAmount}`);
    
    return result.rows[0];
  }
  
  static async approveQuote(jobId, clientId) {
    const result = await pool.query(
      `UPDATE jobs 
       SET job_status = 'quote_approved', quote_approved_at = NOW()
       WHERE id = $1 AND client_id = $2 AND job_status = 'pending_quote_approval'
       RETURNING *`,
      [jobId, clientId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Quote not found or already processed');
    }
    
    const job = result.rows[0];
    
    // Notify artisan
    await NotificationService.sendPushNotification(
      job.artisan_id,
      'Quote Approved',
      'Your quote has been approved. You can now start the job.',
      { jobId, type: 'quote_approved' }
    );
    
    logger.info(`Quote approved for job ${jobId}`);
    
    return result.rows[0];
  }
  
  static async completeJob(jobId, artisanId, completionNotes = null) {
    const client = await pool.connect();
    const completionTime = new Date();
    try{ 
      await client.query('BEGIN');

    const result = await pool.query(
      `UPDATE jobs 
       SET job_status = 'completed', 
           completed_at = $1,
           completion_notes = $2
       WHERE id = $3 AND artisan_id = $4
         AND job_status IN ('execution', 'quote_approved', 'awaiting_completion_confirmation')
       RETURNING *`,
      [completionTime, completionNotes, jobId, artisanId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Job not found or cannot be completed');
    }
    
    const job = result.rows[0];
    
    // Calculate total amount
    const billingResult = await pool.query(
      `UPDATE job_billing 
       SET billing_status = 'awaiting_payment'
       WHERE job_id = $1
       RETURNING *`,
      [jobId]
    );
    
    // Notify client
    await NotificationService.sendPushNotification(
      job.client_id,
      'Job Completed',
      'Your job has been marked as completed. Please review and make payment.',
      { jobId, type: 'job_completed' }
    );
    
    logger.info(`Job ${jobId} completed by artisan ${artisanId}`);
    
    const billing = billingResult.rows[0];
    const artisanEarnings = billing.workmanship_cost;
    // Credit artisan's wallet
  
    await Wallet.credit(
      artisanId, 
      artisanEarnings, 
      'earning', 
    { 
    description: `Payment for job #${jobId.slice(0, 8)}`,
        jobId 
      }
    );

    // if client paid via wallet, debit client's wallet
    // this would be handle in the payment service 

    await client.query('COMMIT');
    return { job, billing: billingResult.rows[0] };
     } catch (error) {
     await client.query('ROLLBACK');
     throw error;
    } finally {
    client.release();
    }
  }


  
  static async cancelJob(jobId, userId, userType, reason) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let query;
      let params;
      
      if (userType === 'client') {
        query = `
          UPDATE jobs 
          SET job_status = 'cancelled', 
              cancelled_at = NOW(),
              cancellation_reason = $1,
              cancelled_by = 'client'
          WHERE id = $2 AND client_id = $3 AND job_status IN ('pending', 'accepted')
          RETURNING *
        `;
        params = [reason, jobId, userId];
      } else if (userType === 'artisan') {
        query = `
          UPDATE jobs 
          SET job_status = 'cancelled', 
              cancelled_at = NOW(),
              cancellation_reason = $1,
              cancelled_by = 'artisan'
          WHERE id = $2 AND artisan_id = $3 
            AND job_status IN ('accepted', 'arrived', 'diagnostics')
          RETURNING *
        `;
        params = [reason, jobId, userId];
      } else {
        query = `
          UPDATE jobs 
          SET job_status = 'cancelled', 
              cancelled_at = NOW(),
              cancellation_reason = $1,
              cancelled_by = 'admin'
          WHERE id = $2
          RETURNING *
        `;
        params = [reason, jobId];
      }
      
      const result = await client.query(query, params);
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Job not found or cannot be cancelled');
      }
      
      const job = result.rows[0];
      
      // Make artisan available again
      if (job.artisan_id) {
        await client.query(
          `UPDATE artisan_profiles SET is_available = true WHERE user_id = $1`,
          [job.artisan_id]
        );
      }
      
      await client.query('COMMIT');
      
      // Notify other party
      if (userType === 'client' && job.artisan_id) {
        await NotificationService.sendPushNotification(
          job.artisan_id,
          'Job Cancelled',
          `The client has cancelled the job. Reason: ${reason}`,
          { jobId, type: 'job_cancelled' }
        );
      } else if (userType === 'artisan') {
        await NotificationService.sendPushNotification(
          job.client_id,
          'Job Cancelled',
          `The artisan has cancelled the job. Reason: ${reason}`,
          { jobId, type: 'job_cancelled' }
        );
      }
      
      logger.info(`Job ${jobId} cancelled by ${userType}: ${reason}`);
      
      return job;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async getJobDetails(jobId, userId, userType) {
    const result = await pool.query(
      `SELECT j.*, 
              cp.full_legal_name as client_name, 
              cp.phone as client_phone,
              cp.email as client_email,
              ap.full_legal_name as artisan_name,
              ap.phone as artisan_phone,
              ap.star_rating as artisan_rating,
              jb.*,
              boq.items as boq_items,
              boq.status as boq_status,
              (SELECT json_agg(row_to_json(offers)) FROM job_offers offers WHERE job_id = j.id) as offers
       FROM jobs j
       LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
       LEFT JOIN job_billing jb ON j.id = jb.job_id
       LEFT JOIN bill_of_quantities boq ON j.id = boq.job_id AND boq.version = (
         SELECT MAX(version) FROM bill_of_quantities WHERE job_id = j.id
       )
       WHERE j.id = $1`,
      [jobId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    const job = result.rows[0];
    
    // Check authorization
    if (job.client_id !== userId && job.artisan_id !== userId && userType !== 'admin') {
      throw new AppError(403, 'Not authorized to view this job');
    }
    
    return job;
  }
  
  static async getJobTimeline(jobId) {
    const result = await pool.query(
      `SELECT * FROM job_timeline 
       WHERE job_id = $1 
       ORDER BY created_at ASC`,
      [jobId]
    );
    
    return result.rows;
  }
  
  static async addTimelineEntry(jobId, status, description, metadata = {}) {
    const result = await pool.query(
      `INSERT INTO job_timeline (job_id, status, description, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [jobId, status, description, metadata]
    );
    
    return result.rows[0];
  }
}

module.exports = JobService;