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

      const {longitude, latitude} = location;
      
      // Create job
      const jobResult = await client.query(
        `INSERT INTO jobs 
         (client_id, category, description, media_urls, service_type, job_status, location, longitude, latitude)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
         RETURNING *`,
        [clientId, category, description, mediaUrls || [], serviceType, location, longitude, latitude],
      );
      
      const job = jobResult.rows[0];
      
      // Create job billing record
      await client.query(
        `INSERT INTO job_billing (job_id, billing_status)
         VALUES ($1, 'pending')`,
        [job.id]
      );
      
    
      const Google_map_radius = process.env.GOOGLE_MAP_RADIUS || 20;
      const expires_at = process.env.JOB_GENERATED_PIN_ARRIVAL_EXPIRES_MINUTES || 2400;

      // Find and notify nearby artisans
      const nearbyArtisans = await this.findNearbyArtisans(category, location, Google_map_radius);
  
      const offers = [];
      for (const artisan of nearbyArtisans.slice(0, 5)) {
        const offerResult = await client.query(
          `INSERT INTO job_offers (job_id, artisan_id, match_score, distance, status, expires_at)
           VALUES ($1, $2, $3, $4, 'pending', NOW() + INTERVAL  '${expires_at} minutes')
           RETURNING *`,
          [job.id, artisan.user_id, artisan.score, artisan.distance]
        );
        
        offers.push(offerResult.rows[0]);
        logger.info(`Sent job offer to artisan ${artisan.user_id} for job ${job.id}`);
        
        // Send real-time notification via Socket.IO
        await NotificationService.sendJobOfferNotification(artisan.user_id, {
          jobId: job.id,
          category: job.category,
          description: job.description,
          distance: artisan.distance,
          serviceType: job.service_type
        });
      }
      
      const descript = `Job created by client with id: ${clientId}`;
      const userId = clientId;
      const userType = 'client';
      const metadata = {
          jobId: job.id,
          category: job.category,
          description: job.description,
          serviceType: job.service_type,
          clientId: clientId,
      }
     this.addTimelineEntry(job.id, 'Created', descript, userType, userId, metadata);

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
  
  static async findNearbyArtisans(category, location, radius = 20) {
    try {
      // Get artisans from Redis geo index
      const nearby = await getNearbyArtisans(category.toUpperCase(), location.longitude, location.latitude, radius);

      if (nearby.length === 0) {
        logger.info('No nearby artisans found within radius');
        return [];
      }

      const artisanIds = nearby.map(([id]) => id);
      logger.info(`Found ${artisanIds.length} nearby artisans: ${artisanIds}` );
      logger.info(`category: ${category}`);

      // Get artisan details from database with ranking
      //  AND ap.monthly_fee_status = 'paid' ; --- IGNORE for now, we can filter this in the future when we implement monthly fee
      const result = await pool.query(
        `SELECT ap.user_id, ap.full_legal_name, ap.tier_level, ap.star_rating, 
                ap.completion_rate, ap.trust_score, ap.skill_category,
                u.is_active
        FROM artisan_profiles ap
        JOIN users u ON ap.user_id = u.id
        WHERE ap.user_id = ANY($1::uuid[])
          AND ap.is_available = true
          AND u.is_active = true
          AND LOWER(ap.skill_category) = $2
        ORDER BY ap.tier_level DESC, ap.star_rating DESC, ap.completion_rate DESC`,
        [artisanIds, category.toLowerCase()],
      );
      
      if (result.rows.length === 0) {
        logger.info('No eligible artisans found in database');
        return [];
      }
      
      logger.info(`Found ${result.rows.length} eligible artisans from database`);
      
      // Calculate priority scores
      const artisansWithDistance = result.rows.map((artisan) => {
        const found = nearby.find(([id]) => id === artisan.user_id);
        const distance = found ? parseFloat(found[1]) : 999;
        logger.info(`Artisan ${artisan.full_legal_name} distance: ${distance}km`);
        const score = this.calculatePriorityScore(artisan, distance);
        return { ...artisan, distance, score };
      });
      
      return artisansWithDistance.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error('Error in findNearbyArtisans:', error);
      throw error;
    }
  }

  static calculatePriorityScore(artisan, distance) {
    // Normalize distance (0-100, closer is better)
    const maxDistance = 20; // km
    const distanceScore = Math.max(0, 100 - (distance / maxDistance) * 100);
    
    // Tier scores (1-3)
    const tierScore = (artisan.tier_level / 3) * 100;
    
    // Rating score (0-5)
    const ratingScore = (artisan.star_rating / 5) * 100;
    
    // Completion rate score (0-100)
    const completionScore = artisan.completion_rate || 0;
    
    // Trust score (0-100)
    const trustScore = artisan.trust_score || 0;
    
    // Weighted calculation
    const weights = {
      distance: 0.25,
      tier: 0.30,
      rating: 0.25,
      completion: 0.10,
      trust: 0.10
    };
    
    const totalScore = 
      (distanceScore * weights.distance) +
      (tierScore * weights.tier) +
      (ratingScore * weights.rating) +
      (completionScore * weights.completion) +
      (trustScore * weights.trust);
    
    return Math.round(totalScore);
  }

  static async repostJob(clientId, jobId){

       const client = await pool.connect();
    
    try{
   
      await client.query('BEGIN');

      await client.query(`
            DELETE FROM job_offers WHERE job_id = $1 and status = 'pending'
        `, [jobId]);
      
    
    const res = await client.query(
       `SELECT *
        FROM jobs where id = $1 `, 
       [jobId]
    );
    if(res.rows.length !== 1){
      return 'The job is undefined';
    }
    const job = res.rows[0];

    const location = job.location;
    const category = job.category;
      // Update offer status
    const expires_at = process.env.JOB_OFFER_EXPIRY_MINUTES ||  2040;

 
     const Google_map_radius = process.env.GOOGLE_MAP_RADIUS || 20;

    
      // Find and notify nearby artisans
      const nearbyArtisans = await this.findNearbyArtisans(category, location, Google_map_radius);
  
      const offers = [];
      for (const artisan of nearbyArtisans.slice(0, 5)) {
        const offerResult = await client.query(
          `INSERT INTO job_offers (job_id, artisan_id, match_score, distance, status, expires_at)
           VALUES ($1, $2, $3, $4, 'pending', NOW() + INTERVAL  '${expires_at} minutes')
           RETURNING *`,
          [job.id, artisan.user_id, artisan.score, artisan.distance]
        );
        
        offers.push(offerResult.rows[0]);
        logger.info(`Sent job offer to artisan ${artisan.user_id} for job ${job.id}`);
        
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
         WHERE job_id = $1 AND artisan_id = $2 AND (status = 'pending' OR status = 'rejected') 
         AND expires_at > NOW()`,
        [jobId, artisanId]
      );
      
      if (offerResult.rows.length === 0) {
        throw new AppError(400, 'No valid offer found 1');
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
      const pin_expires = process.env.JOB_GENERATED_PIN_ARRIVAL_EXPIRES_MINUTES || 2400;
      await client.query(
        `INSERT INTO arrival_pins (job_id, pin, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '${pin_expires}  minutes')`,
        [jobId, pin],
      );

      const descript = `Job accepted by artisan with id: ${artisanId}`;
      const userId = artisanId;
      const userType = 'artisan';
     //this.addTimelineEntry(job.id, 'Accepted', descript, userType, userId);
      
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
      const baseFee = process.env.JOB_BASE_FEE || 2500; // Configurable
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

      const descript = 'Artisan arrived at location';
      //this.addTimelineEntry(jobId, 'arrived', descript);
      
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

     const descript = 'Diagnostics started';
     // this.addTimelineEntry(jobId, 'diagnostics', descript);
    
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
        [diagnosticsFee, diagnosticsDuration, jobId],
      );
      
      // Update escrow for diagnostics
      await client.query(
        `INSERT INTO escrow_transactions (job_id, client_id, artisan_id, amount, transaction_type, status)
         SELECT $1, client_id, artisan_id, $2, 'diagnostics_fee', 'held'
         FROM jobs WHERE id = $1`,
        [jobId, diagnosticsFee],
      );
      
      const descript = `Diagnostics completed for job ${jobId}: ${diagnosticsDuration} minutes`;
      //this.addTimelineEntry(jobId, 'diagnostics', descript, 'artisan', artisanId);

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

    const descript = 'Execution started';
   // this.addTimelineEntry(jobId, 'execution', descript);
    
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

     const descript = 'Execution paused';
   // this.addTimelineEntry(jobId, 'execution', descript);
    
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
    
    const descript = 'Execution resumed';
   // this.addTimelineEntry(jobId, 'execution', descript);
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
    const job_exc_fee_min = process.env.JOB_EXEC_FEE_MIN || 1000;
    const executionFee = Math.ceil(totalDuration * job_exc_fee_min); // ₦1000 per minute
    
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

    const descript = `Execution stopped for job ${jobId}: ${totalDuration} minutes`;
   // this.addTimelineEntry(jobId, 'execution completed', descript);
      
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
       WHERE id = $1 AND client_id = $2 AND (
       job_status = 'pending_quote_approval' OR job_status = 'quote_rejected')
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

    static async rejectQuote(jobId, clientId) {
    const result = await pool.query(
      `UPDATE jobs 
       SET job_status = 'quote_rejected', quote_approved_at = NOW()
       WHERE id = $1 AND client_id = $2 AND 
       ( job_status = 'pending_quote_approval' OR job_status = 'quote_rejected')
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
      'Quote Rejected',
      'Your quote has not been approved. You may not start the job.',
      { jobId, type: 'quote_rejected' }
    );
    
    logger.info(`Quote rejected for job ${jobId}`);
    
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

    const descript = 'Job completed';
    this.addTimelineEntry(jobId, 'completed', descript);

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

      const descript = 'Job cancelled';
      this.addTimelineEntry(jobId, 'cancelled', descript);
      
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
              uc.phone as client_phone,
              uc.email as client_email,
              ap.full_legal_name as artisan_name,
              ua.phone as artisan_phone,
              ua.email as artisan_email,
              ap.star_rating as artisan_rating,
              jb.*,
              boq.items as boq_items,
              boq.status as boq_status,
              (SELECT json_agg(row_to_json(offers)) FROM job_offers offers WHERE job_id = j.id) as offers
       FROM jobs j
       LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
       LEFT JOIN job_billing jb ON j.id = jb.job_id
       LEFT JOIN users ua ON ua.id = j.artisan_id 
       LEFT JOIN users uc ON uc.id = j.client_id
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
  //  this.addTimelineEntry(job.id, 'Created', descript, userType, userId, metadata);

  static async addTimelineEntry(jobId, status, description, userType = null, userId = null, metadata = {}) {
    
    let name;
    if (userType && userId){
    if(userType === 'client'){
    const res = await pool.query(
      `SELECT full_legal_name FROM client_profiles WHERE user_id = $1`, [userId]);
      name = res.rows[0].full_legal_name;
    }else if(userType === 'artisan'){
     const res = await pool.query(
      `SELECT full_legal_name FROM artisan_profiles WHERE user_id = $1`, [userId]);
        name = res.rows[0].full_legal_name;
     }
   }

    const descr = `${description}:  By: ${name}`;
    const result = await pool.query(
      `INSERT INTO job_timeline (job_id, status, description, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [jobId, status, descr, metadata, userId],
    );
    
    return result.rows[0];
  }


   
     static async getClientJobs(clientId, filters = {}) {
       const { status, page = 1, limit = 10, startDate, endDate } = filters;
       const offset = (page - 1) * limit;
       
       let query = `
         SELECT j.*, ap.full_legal_name as artisan_name, ap.star_rating,
         jb.base_fee, jb.total_amount, jb.billing_status, jb.paid_at,
         jo.expires_at, 
           CASE 
              WHEN jo.expires_at < NOW() AND (j.job_status = 'pending'  OR j.job_status = 'rejected') THEN 'expired'
              WHEN jo.expires_at > NOW() AND (j.job_status = 'pending'  OR  j.job_status = 'rejected')  THEN 'active'
              ELSE 'treated'
           END AS job_offer_status
         FROM jobs j
         LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
         LEFT JOIN job_billing jb ON j.id = jb.job_id
         LEFT JOIN job_offers jo ON j.id = jo.job_id
         WHERE j.client_id = $1
       `;
       const params = [clientId];
       let paramIndex = 2;
       
       if (status) {
         query += ` AND j.job_status = $${paramIndex}`;
         params.push(status);
         paramIndex++;
       }
       
       if (startDate) {
         query += ` AND j.created_at >= $${paramIndex}`;
         params.push(startDate);
         paramIndex++;
       }
       
       if (endDate) {
         query += ` AND j.created_at <= $${paramIndex}`;
         params.push(endDate);
         paramIndex++;
       }
       
       query += ` ORDER BY j.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
       params.push(limit, offset);
       
       const result = await pool.query(query, params);
       
       const countQuery = `
         SELECT COUNT(*) FROM jobs WHERE client_id = $1
         ${status ? 'AND job_status = $2' : ''}
       `;
       const countParams = status ? [clientId, status] : [clientId];
       const countResult = await pool.query(countQuery, countParams);
       
       return {
         jobs: result.rows,
         total: parseInt(countResult.rows[0].count),
         page,
         limit
       };
     }
   
     static async getArtisanJobs(artisanId, filters = {}) {
       const { status, page = 1, limit = 10, startDate, endDate } = filters;
       const offset = (page - 1) * limit;
       
       let query = `
         SELECT j.*, cp.full_legal_name as client_name,
         jb.base_fee, jb.total_amount, jb.billing_status, jb.paid_at
         FROM jobs j
         LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
         LEFT JOIN job_billing jb ON j.id = jb.job_id
         WHERE j.artisan_id = $1
       `;
       const params = [artisanId];
       let paramIndex = 2;
       
       if (status) {
         query += ` AND j.job_status = $${paramIndex}`;
         params.push(status);
         paramIndex++;
       }
       
       if (startDate) {
         query += ` AND j.created_at >= $${paramIndex}`;
         params.push(startDate);
         paramIndex++;
       }
       
       if (endDate) {
         query += ` AND j.created_at <= $${paramIndex}`;
         params.push(endDate);
         paramIndex++;
       }
       
       query += ` ORDER BY j.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
       params.push(limit, offset);
       
       const result = await pool.query(query, params);
       
       const countQuery = `
         SELECT COUNT(*) FROM jobs WHERE artisan_id = $1
         ${status ? 'AND job_status = $2' : ''}
       `;
       const countParams = status ? [artisanId, status] : [artisanId];
       const countResult = await pool.query(countQuery, countParams);

       
       return {
         jobs: result.rows,
         total: parseInt(countResult.rows[0].count),
         page,
         limit
       };
     }





   // Add these methods to the existing JobService class

/**
 * Get available jobs for artisans to browse
 * @param {Object} filters - Filter options
 * @param {string} artisanId - Artisan ID (for personalization)
 * @returns {Promise<Object>} Available jobs with pagination
 */
static async getAvailableJobs(filters = {}, artisanId = null) {
  const {
    category,
    minBudget,
    maxBudget,
    serviceType,
    location,
    radius = 20,
    sortBy = 'distance', // distance, budget, created_at
    page = 1,
    limit = 20
  } = filters;
  
  const offset = (page - 1) * limit;
  logger.info('Stage number 1');
  
  let query = `
    SELECT j.*,
           cp.full_legal_name as client_name,
           cp.street_address,
           c.name as category_name,
           COALESCE(jb.total_amount, 0) as estimated_budget,
           CASE WHEN sa.artisan_id IS NOT NULL THEN true ELSE false END as is_saved,
           CASE WHEN jv.artisan_id IS NOT NULL THEN true ELSE false END as is_viewed
    FROM jobs j
    JOIN client_profiles cp ON j.client_id = cp.user_id
    LEFT JOIN job_billing jb ON j.id = jb.job_id
    LEFT JOIN categories c ON j.category = c.name
    LEFT JOIN saved_jobs sa ON j.id = sa.job_id AND sa.artisan_id = $1
    LEFT JOIN job_views jv ON j.id = jv.job_id AND jv.artisan_id = $1
    WHERE j.job_status = 'pending'
      AND j.is_public = true
      AND (j.expires_at IS NULL OR j.expires_at > NOW())
  `;
  
  const params = [artisanId];
  let paramIndex = 2;
  
  // Apply filters
  if (category) {
    query += ` AND j.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }
  
  if (minBudget) {
    query += ` AND COALESCE(jb.total_amount, 0) >= $${paramIndex}`;
    params.push(minBudget);
    paramIndex++;
  }
  
  if (maxBudget) {
    query += ` AND COALESCE(jb.total_amount, 0) <= $${paramIndex}`;
    params.push(maxBudget);
    paramIndex++;
  }
  
  if (serviceType) {
    query += ` AND j.service_type = $${paramIndex}`;
    params.push(serviceType);
    paramIndex++;
  }
  
  logger.info('Stage number 2');
  // Location-based filtering
  if (location && location.latitude && location.longitude) {
    query += `
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326),
        ST_SetSRID(ST_MakePoint(
          (j.location->>'longitude')::float,
          (j.location->>'latitude')::float
        ), 4326),
        $${paramIndex + 2} * 1000
      )
    `;
    params.push(location.longitude, location.latitude, radius);
    paramIndex += 3;
  }
  logger.info('Stage number 3');
  // Sorting
  switch (sortBy) {
    case 'distance':
      if (location && location.latitude && location.longitude) {
        query += `
          ORDER BY ST_Distance(
            ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326),
            ST_SetSRID(ST_MakePoint(
              (j.location->>'longitude')::float,
              (j.location->>'latitude')::float
            ), 4326)
          ) ASC
        `;
        params.push(location.longitude, location.latitude);
        paramIndex += 2;
      } else {
        query += ` ORDER BY j.created_at DESC`;
      }
      break;
    case 'budget':
      query += ` ORDER BY COALESCE(jb.total_amount, 0) ASC`;
      break;
    case 'created_at':
    default:
      query += ` ORDER BY j.created_at DESC`;
      break;
  }
  logger.info('Stage number 4');
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  logger.info('Stage number 5');
  // Get total count
  const countQuery = `
    SELECT COUNT(*) 
    FROM jobs j
    WHERE j.job_status = 'pending'
      AND j.is_public = true
      AND (j.expires_at IS NULL OR j.expires_at > NOW())
      ${category ? `AND j.category = '${category}'` : ''}
      ${serviceType ? `AND j.service_type = '${serviceType}'` : ''}
  `;
  const countResult = await pool.query(countQuery);
  logger.info('Stage number 6');
  
  // Calculate distance for each job if location provided
  const jobsWithDetails = await Promise.all(result.rows.map(async (job) => {
    let distance = null;
    if (location && location.latitude && location.longitude && job.location) {
      distance = calculateDistance(
        location,
        job.location,
      );
    }
    
    // Get match score for this job
    const matchScore = await this.calculateJobMatchScore(artisanId, job);
    
    return {
      ...job,
      distance: distance ? Math.round(distance / 1000) : null,
      matchScore
    };
  }));
    logger.info('Stage number 7');
  return {
    jobs: jobsWithDetails,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };

  logger.info('Stage number 8');
}
 
/**
 * Get job details for artisan browsing
 * @param {string} jobId - Job ID
 * @param {string} artisanId - Artisan ID
 * @returns {Promise<Object>} Job details
 */
static async getAvailableJobDetails(jobId, artisanId) {
  const client = await pool.connect();
  
  try {
    // Track view
    await client.query(
      `INSERT INTO job_views (job_id, artisan_id)
       VALUES ($1, $2)
       ON CONFLICT (job_id, artisan_id) DO NOTHING`,
      [jobId, artisanId]
    );
    
    // Increment view count
    await client.query(
      `UPDATE jobs SET viewed_count = viewed_count + 1 WHERE id = $1`,
      [jobId]
    );
    
    // Get job details
    const result = await client.query(
      `SELECT j.*,
              cp.full_legal_name as client_name,
              cp.star_rating as client_rating,
              cp.service_address,
              c.name as category_name,
              COALESCE(jb.total_amount, 0) as estimated_budget,
              COALESCE(jb.materials_cost, 0) as materials_cost,
              COALESCE(jb.workmanship_cost, 0) as workmanship_cost,
              (SELECT COUNT(*) FROM job_offers WHERE job_id = j.id) as offer_count,
              (SELECT COUNT(*) FROM job_views WHERE job_id = j.id) as view_count,
              EXISTS(SELECT 1 FROM saved_jobs WHERE job_id = j.id AND artisan_id = $2) as is_saved
       FROM jobs j
       JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN job_billing jb ON j.id = jb.job_id
       LEFT JOIN categories c ON j.category = c.name
       WHERE j.id = $1`,
      [jobId, artisanId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    const job = result.rows[0];
    
    // Calculate match score
    job.matchScore = await this.calculateJobMatchScore(artisanId, job);
    
    // Get similar jobs
    job.similarJobs = await this.getSimilarJobs(jobId, artisanId);
    
    return job;
  } finally {
    client.release();
  }
}

/**
 * Calculate match score between artisan and job
 * @param {string} artisanId - Artisan ID
 * @param {Object} job - Job object
 * @returns {Promise<number>} Match score (0-100)
 */
static async calculateJobMatchScore(artisanId, job) {
  if (!artisanId) return 0;
  
  const artisanResult = await pool.query(
    `SELECT skill_category, tier_level, star_rating, 
            completion_rate, current_location
     FROM artisan_profiles
     WHERE user_id = $1`,
    [artisanId]
  );
  
  if (artisanResult.rows.length === 0) return 0;
  
  const artisan = artisanResult.rows[0];
  
  let score = 0;
  let totalWeight = 0;
  
  // Category match (40% weight)
  if (artisan.skill_category === job.category) {
    score += 40;
  }
  totalWeight += 40;
  
  // Distance score (20% weight)
  if (artisan.current_location && job.location) {
    const distance = calculateDistance(
      artisan.current_location,
      job.location,
    );
    const distanceScore = Math.max(0, 20 - (distance / 1000) * 2);
    score += Math.min(20, distanceScore);
  }
  totalWeight += 20;
  
  // Budget match (20% weight)
  const estimatedBudget = job.estimated_budget || 0;
  const artisanAvgEarning = await this.getArtisanAverageEarning(artisanId);
  if (artisanAvgEarning > 0 && estimatedBudget > 0) {
    const budgetRatio = Math.min(estimatedBudget / artisanAvgEarning, 2);
    const budgetScore = budgetRatio >= 1 ? 20 : (budgetRatio * 20);
    score += budgetScore;
  }
  totalWeight += 20;
  
  // Artisan rating (10% weight)
  const ratingScore = (artisan.star_rating / 5) * 10;
  score += ratingScore;
  totalWeight += 10;
  
  // Completion rate (10% weight)
  const completionScore = (artisan.completion_rate / 100) * 10;
  score += completionScore;
  totalWeight += 10;
  
  return Math.round(score);
}

static async getArtisanAverageEarning(clientId){
   const result = this.getEarnings(clientId);
   return result.average_earning;
}

 static async getEarnings(artisanId, startDate = null, endDate = null) {
    let query = `
      SELECT 
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_earned,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_earnings,
        COUNT(*) as total_jobs,
        AVG(amount) as average_earning
      FROM artisan_payouts
      WHERE artisan_id = $1
    `;
    
    const params = [artisanId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    const result = await pool.query(query, params);
    return result.rows[0];
  }


/**
 * Get similar jobs
 * @param {string} jobId - Job ID
 * @param {string} artisanId - Artisan ID
 * @returns {Promise<Array>} Similar jobs
 */
static async getSimilarJobs(jobId, artisanId) {
  const result = await pool.query(
    `SELECT j.id, j.category, j.description, j.created_at,
            cp.full_legal_name as client_name,
            COALESCE(jb.total_amount, 0) as estimated_budget
     FROM jobs j
     JOIN client_profiles cp ON j.client_id = cp.user_id
     LEFT JOIN job_billing jb ON j.id = jb.job_id
     WHERE j.job_status = 'pending'
       AND j.is_public = true
       AND j.id != $1
       AND j.category = (SELECT category FROM jobs WHERE id = $1)
     ORDER BY j.created_at DESC
     LIMIT 5`,
    [jobId]
  );
  
  return result.rows;
}

/**
 * Save job for later (bookmark)
 * @param {string} jobId - Job ID
 * @param {string} artisanId - Artisan ID
 * @param {string} notes - Optional notes
 * @returns {Promise<Object>} Saved job record
 */
static async saveJob(jobId, artisanId, notes = null) {
  const result = await pool.query(
    `INSERT INTO saved_jobs (job_id, artisan_id, notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (job_id, artisan_id) 
     DO UPDATE SET notes = EXCLUDED.notes, created_at = NOW()
     RETURNING *`,
    [jobId, artisanId, notes]
  );
  
  return result.rows[0];
}

/**
 * Remove saved job
 * @param {string} jobId - Job ID
 * @param {string} artisanId - Artisan ID
 * @returns {Promise<boolean>} Success status
 */
static async unsaveJob(jobId, artisanId) {
  const result = await pool.query(
    `DELETE FROM saved_jobs WHERE job_id = $1 AND artisan_id = $2 RETURNING *`,
    [jobId, artisanId]
  );
  
  return result.rows.length > 0;
}

/**
 * Get saved jobs for artisan
 * @param {string} artisanId - Artisan ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Saved jobs
 */
static async getSavedJobs(artisanId, filters = {}) {
  const { page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;
  
  const result = await pool.query(
    `SELECT sj.*, j.category, j.description, j.created_at,
            cp.full_legal_name as client_name,
            COALESCE(jb.total_amount, 0) as estimated_budget
     FROM saved_jobs sj
     JOIN jobs j ON sj.job_id = j.id
     JOIN client_profiles cp ON j.client_id = cp.user_id
     LEFT JOIN job_billing jb ON j.id = jb.job_id
     WHERE sj.artisan_id = $1
       AND j.job_status = 'pending'
     ORDER BY sj.created_at DESC
     LIMIT $2 OFFSET $3`,
    [artisanId, limit, offset]
  );
  
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM saved_jobs WHERE artisan_id = $1`,
    [artisanId]
  );
  
  return {
    jobs: result.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

/**
 * Create job alert for artisan
 * @param {string} artisanId - Artisan ID
 * @param {Object} alertSettings - Alert settings
 * @returns {Promise<Object>} Job alert
 */
static async createJobAlert(artisanId, alertSettings) {
  const { categories, minBudget, maxDistance } = alertSettings;
  
  const result = await pool.query(
    `INSERT INTO job_alerts (artisan_id, categories, min_budget, max_distance, is_active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (artisan_id) 
     DO UPDATE SET 
       categories = EXCLUDED.categories,
       min_budget = EXCLUDED.min_budget,
       max_distance = EXCLUDED.max_distance,
       is_active = true,
       updated_at = NOW()
     RETURNING *`,
    [artisanId, categories, minBudget, maxDistance]
  );
  
  return result.rows[0];
}

/**
 * Get job alerts for artisan
 * @param {string} artisanId - Artisan ID
 * @returns {Promise<Object>} Job alert settings
 */
static async getJobAlert(artisanId) {
  const result = await pool.query(
    `SELECT * FROM job_alerts WHERE artisan_id = $1`,
    [artisanId]
  );
  
  return result.rows[0] || null;
}

/**
 * Delete job alert
 * @param {string} artisanId - Artisan ID
 * @returns {Promise<boolean>} Success status
 */
static async deleteJobAlert(artisanId) {
  const result = await pool.query(
    `DELETE FROM job_alerts WHERE artisan_id = $1 RETURNING *`,
    [artisanId]
  );
  
  return result.rows.length > 0;
}

/**
 * Get recommended jobs based on artisan's history and preferences
 * @param {string} artisanId - Artisan ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Recommended jobs
 */
static async getRecommendedJobs(artisanId, filters = {}) {
  const { limit = 10 } = filters;
  
  // Get artisan's job alert preferences
  const alert = await this.getJobAlert(artisanId);
  
  // Get artisan's past jobs
  const pastJobs = await pool.query(
    `SELECT category FROM jobs 
     WHERE artisan_id = $1 AND job_status = 'completed'
     GROUP BY category
     ORDER BY COUNT(*) DESC
     LIMIT 3`,
    [artisanId]
  );
  
  const preferredCategories = pastJobs.rows.map(row => row.category);
  
  // If no history, use alert preferences or default categories
  const categories = alert?.categories || preferredCategories;
  
  let query = `
    SELECT j.*, cp.full_legal_name as client_name,
           COALESCE(jb.total_amount, 0) as estimated_budget,
           CASE WHEN sj.artisan_id IS NOT NULL THEN true ELSE false END as is_saved
    FROM jobs j
    JOIN client_profiles cp ON j.client_id = cp.user_id
    LEFT JOIN job_billing jb ON j.id = jb.job_id
    LEFT JOIN saved_jobs sj ON j.id = sj.job_id AND sj.artisan_id = $1
    WHERE j.job_status = 'pending'
      AND j.is_public = true
      AND j.category = ANY($2::text[])
    ORDER BY j.created_at DESC
    LIMIT $3
  `;
  
  const params = [artisanId, categories, limit];
  
  const result = await pool.query(query, params);
  
  // Calculate match scores
  const jobsWithScores = await Promise.all(result.rows.map(async (job) => {
    const matchScore = await this.calculateJobMatchScore(artisanId, job);
    return { ...job, matchScore };
  }));
  
  // Sort by match score
  jobsWithScores.sort((a, b) => b.matchScore - a.matchScore);
  
  return jobsWithScores;
}

}

module.exports = JobService;