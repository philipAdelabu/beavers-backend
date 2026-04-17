const { pool } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');

class BOQService {
  static async createBOQ(boqData) {
    const { jobId, artisanId, items, workmanshipCost, notes } = boqData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current version
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 as next_version 
         FROM bill_of_quantities WHERE job_id = $1`,
        [jobId]
      );
      const version = versionResult.rows[0].next_version;
      
      // Calculate totals
      const totalMaterialsCost = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      
      const result = await client.query(
        `INSERT INTO bill_of_quantities 
         (job_id, artisan_id, items, total_materials_cost, total_workmanship_cost, notes, version, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
         RETURNING *`,
        [jobId, artisanId, items, totalMaterialsCost, workmanshipCost || 0, notes, version]
      );
      
      await client.query('COMMIT');
      
      logger.info(`BOQ created for job ${jobId} by artisan ${artisanId}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async updateBOQ(boqId, artisanId, updateData) {
    const { items, workmanshipCost, notes } = updateData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if BOQ exists and is in draft status
      const boqResult = await client.query(
        `SELECT * FROM bill_of_quantities WHERE id = $1 AND artisan_id = $2`,
        [boqId, artisanId]
      );
      
      if (boqResult.rows.length === 0) {
        throw new AppError(404, 'BOQ not found or unauthorized');
      }
      
      const boq = boqResult.rows[0];
      
      if (boq.status !== 'draft') {
        throw new AppError(400, 'Cannot update BOQ after submission');
      }
      
      let totalMaterialsCost = boq.total_materials_cost;
      
      if (items) {
        totalMaterialsCost = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      }
      
      const result = await client.query(
        `UPDATE bill_of_quantities 
         SET items = COALESCE($1, items),
             total_materials_cost = COALESCE($2, total_materials_cost),
             total_workmanship_cost = COALESCE($3, total_workmanship_cost),
             notes = COALESCE($4, notes),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [items, totalMaterialsCost, workmanshipCost, notes, boqId]
      );
      
      await client.query('COMMIT');
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async submitForApproval(boqId, artisanId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE bill_of_quantities 
         SET status = 'pending_client_approval', 
             submitted_at = NOW()
         WHERE id = $1 AND artisan_id = $2 AND status = 'draft'
         RETURNING *`,
        [boqId, artisanId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'BOQ not found or already submitted');
      }
      
      const boq = result.rows[0];
      
      // Get client info for notification
      const jobResult = await client.query(
        `SELECT client_id FROM jobs WHERE id = $1`,
        [boq.job_id]
      );
      
      await client.query('COMMIT');
      
      // Notify client
      await NotificationService.sendPushNotification(
        jobResult.rows[0].client_id,
        'BOQ Ready for Review',
        'The artisan has submitted a bill of quantities for your approval.',
        { boqId, jobId: boq.job_id, type: 'boq_submitted' }
      );
      
      logger.info(`BOQ ${boqId} submitted for approval`);
      
      return boq;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async clientApprove(boqId, clientId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify client owns the job
      const boqResult = await client.query(
        `SELECT b.*, j.client_id 
         FROM bill_of_quantities b
         JOIN jobs j ON b.job_id = j.id
         WHERE b.id = $1`,
        [boqId]
      );
      
      if (boqResult.rows.length === 0) {
        throw new AppError(404, 'BOQ not found');
      }
      
      const boq = boqResult.rows[0];
      
      if (boq.client_id !== clientId) {
        throw new AppError(403, 'Not authorized to approve this BOQ');
      }
      
      if (boq.status !== 'pending_client_approval') {
        throw new AppError(400, 'BOQ is not pending approval');
      }
      
      const result = await client.query(
        `UPDATE bill_of_quantities 
         SET client_approved = true, 
             status = 'pending_admin_approval',
             client_approved_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [boqId]
      );
      
      await client.query('COMMIT');
      
      // Notify admin
      logger.info(`BOQ ${boqId} approved by client`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async clientReject(boqId, clientId, reason) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const boqResult = await client.query(
        `SELECT b.*, j.client_id 
         FROM bill_of_quantities b
         JOIN jobs j ON b.job_id = j.id
         WHERE b.id = $1`,
        [boqId]
      );
      
      if (boqResult.rows.length === 0) {
        throw new AppError(404, 'BOQ not found');
      }
      
      const boq = boqResult.rows[0];
      
      if (boq.client_id !== clientId) {
        throw new AppError(403, 'Not authorized to reject this BOQ');
      }
      
      const result = await client.query(
        `UPDATE bill_of_quantities 
         SET client_approved = false, 
             status = 'rejected_by_client',
             rejection_reason = $1,
             rejected_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [reason, boqId]
      );
      
      await client.query('COMMIT');
      
      // Notify artisan
      await NotificationService.sendPushNotification(
        boq.artisan_id,
        'BOQ Rejected',
        `Your BOQ was rejected. Reason: ${reason}`,
        { boqId, jobId: boq.job_id, type: 'boq_rejected' }
      );
      
      logger.info(`BOQ ${boqId} rejected by client: ${reason}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async adminApprove(boqId, adminId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE bill_of_quantities 
         SET admin_approved = true, 
             status = 'approved',
             admin_approved_at = NOW(),
             admin_id = $1
         WHERE id = $2 AND status = 'pending_admin_approval'
         RETURNING *`,
        [adminId, boqId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'BOQ not found or not pending admin approval');
      }
      
      const boq = result.rows[0];
      
      // Update job billing with BOQ costs
      await client.query(
        `UPDATE job_billing 
         SET materials_cost = $1,
             workmanship_cost = $2
         WHERE job_id = $3`,
        [boq.total_materials_cost, boq.total_workmanship_cost, boq.job_id]
      );
      
      await client.query('COMMIT');
      
      // Notify artisan and client
      const jobResult = await client.query(
        `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
        [boq.job_id]
      );
      
      await NotificationService.sendPushNotification(
        jobResult.rows[0].artisan_id,
        'BOQ Approved',
        'Your BOQ has been approved by admin.',
        { boqId, jobId: boq.job_id, type: 'boq_approved' }
      );
      
      await NotificationService.sendPushNotification(
        jobResult.rows[0].client_id,
        'BOQ Approved',
        'The BOQ has been approved. Materials will be dispatched soon.',
        { boqId, jobId: boq.job_id, type: 'boq_approved' }
      );
      
      logger.info(`BOQ ${boqId} approved by admin`);
      
      return boq;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async getBOQ(boqId, userId, userType) {
    const result = await pool.query(
      `SELECT b.*, j.client_id, j.artisan_id,
              cp.full_legal_name as client_name,
              ap.full_legal_name as artisan_name
       FROM bill_of_quantities b
       JOIN jobs j ON b.job_id = j.id
       LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON b.artisan_id = ap.user_id
       WHERE b.id = $1`,
      [boqId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'BOQ not found');
    }
    
    const boq = result.rows[0];
    
    // Check authorization
    if (boq.client_id !== userId && boq.artisan_id !== userId && userType !== 'admin') {
      throw new AppError(403, 'Not authorized to view this BOQ');
    }
    
    return boq;
  }
  
  static async getBOQHistory(jobId, userId, userType) {
    // Verify authorization
    const jobResult = await pool.query(
      `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      throw new AppError(404, 'Job not found');
    }
    
    const job = jobResult.rows[0];
    
    if (job.client_id !== userId && job.artisan_id !== userId && userType !== 'admin') {
      throw new AppError(403, 'Not authorized to view BOQ history');
    }
    
    const result = await pool.query(
      `SELECT * FROM bill_of_quantities 
       WHERE job_id = $1 
       ORDER BY version DESC`,
      [jobId]
    );
    
    return result.rows;
  }
  
  static async requestSubstitution(boqId, artisanId, itemIndex, alternativeItem, reason) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify artisan owns the BOQ
      const boqResult = await client.query(
        `SELECT * FROM bill_of_quantities WHERE id = $1 AND artisan_id = $2`,
        [boqId, artisanId]
      );
      
      if (boqResult.rows.length === 0) {
        throw new AppError(404, 'BOQ not found or unauthorized');
      }
      
      const boq = boqResult.rows[0];
      
      if (boq.status !== 'approved') {
        throw new AppError(400, 'Can only request substitution for approved BOQ');
      }
      
      const result = await client.query(
        `INSERT INTO substitution_requests (boq_id, item_index, alternative_item, reason, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *`,
        [boqId, itemIndex, alternativeItem, reason]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Substitution request created for BOQ ${boqId}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async approveSubstitution(requestId, adminId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const requestResult = await client.query(
        `SELECT * FROM substitution_requests WHERE id = $1`,
        [requestId]
      );
      
      if (requestResult.rows.length === 0) {
        throw new AppError(404, 'Substitution request not found');
      }
      
      const request = requestResult.rows[0];
      
      // Update the BOQ item
      const boqResult = await client.query(
        `SELECT * FROM bill_of_quantities WHERE id = $1`,
        [request.boq_id]
      );
      
      const boq = boqResult.rows[0];
      const items = boq.items;
      items[request.item_index] = request.alternative_item;
      
      // Recalculate totals
      const totalMaterialsCost = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      
      await client.query(
        `UPDATE bill_of_quantities 
         SET items = $1, 
             total_materials_cost = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [items, totalMaterialsCost, request.boq_id]
      );
      
      await client.query(
        `UPDATE substitution_requests 
         SET status = 'approved', 
             approved_by = $1, 
             approved_at = NOW()
         WHERE id = $2`,
        [adminId, requestId]
      );
      
      await client.query('COMMIT');
      
      // Notify artisan
      await NotificationService.sendPushNotification(
        boq.artisan_id,
        'Substitution Approved',
        'Your material substitution request has been approved.',
        { boqId: request.boq_id, type: 'substitution_approved' }
      );
      
      logger.info(`Substitution request ${requestId} approved`);
      
      return { approved: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async rejectSubstitution(requestId, adminId, reason) {
    const result = await pool.query(
      `UPDATE substitution_requests 
       SET status = 'rejected', 
           rejection_reason = $1,
           approved_by = $2,
           approved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [reason, adminId, requestId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Substitution request not found');
    }
    
    const request = result.rows[0];
    
    // Notify artisan
    const boqResult = await pool.query(
      `SELECT artisan_id FROM bill_of_quantities WHERE id = $1`,
      [request.boq_id]
    );
    
    if (boqResult.rows[0]) {
      await NotificationService.sendPushNotification(
        boqResult.rows[0].artisan_id,
        'Substitution Rejected',
        `Your material substitution request was rejected. Reason: ${reason}`,
        { boqId: request.boq_id, type: 'substitution_rejected' }
      );
    }
    
    logger.info(`Substitution request ${requestId} rejected: ${reason}`);
    
    return result.rows[0];
  }
}

module.exports = BOQService;