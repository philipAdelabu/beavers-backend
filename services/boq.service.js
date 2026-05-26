const PDFDocument = require('pdfkit');
const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');


class BOQService { 
  /**
   * Create a new Bill of Quantities
   * @param {Object} boqData - BOQ data
   * @returns {Promise<Object>} Created BOQ
   */
  static async createBOQ(boqData) {
    const { jobId, artisanId, items, workmanshipCost, notes } = boqData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify artisan is assigned to this job
      const jobResult = await client.query(
        `SELECT * FROM jobs WHERE id = $1 AND artisan_id = $2 AND job_status = 'diagnostics'`,
        [jobId, artisanId]
      );
      
      if (jobResult.rows.length === 0) {
        throw new AppError(403, 'Not authorized to create BOQ for this job or job not in diagnostics phase');
      }
      
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

  /**
   * Update BOQ (only in draft status)
   * @param {string} boqId - BOQ ID
   * @param {string} artisanId - Artisan ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated BOQ
   */
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
      
      await cacheDel(`boq:${boqId}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Submit BOQ for approval
   * @param {string} boqId - BOQ ID
   * @param {string} artisanId - Artisan ID
   * @returns {Promise<Object>} Submitted BOQ
   */
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
        `SELECT j.client_id, cp.full_legal_name, cp.email, cp.phone
         FROM jobs j
         JOIN client_profiles cp ON j.client_id = cp.user_id
         WHERE j.id = $1`,
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
      
      await NotificationService.sendEmail(
        jobResult.rows[0].email,
        'Bill of Quantities Ready for Review',
        `Dear ${jobResult.rows[0].full_legal_name},\n\nYour artisan has submitted a bill of quantities for review. Please login to approve or reject it.\n\nTotal Materials: ₦${boq.total_materials_cost.toLocaleString()}\nWorkmanship: ₦${boq.total_workmanship_cost.toLocaleString()}\nTotal: ₦${(boq.total_materials_cost + boq.total_workmanship_cost).toLocaleString()}\n\nThank you for using BeaverWorks!`
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

  /**
   * Client approve BOQ
   * @param {string} boqId - BOQ ID
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} Approved BOQ
   */
  static async clientApprove(boqId, clientId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify client owns the job
      const boqResult = await client.query(
        `SELECT b.*, j.client_id, j.artisan_id
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
        throw new AppError(400, 'BOQ is not pending client approval');
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
      
      // Update job billing with BOQ costs
      await client.query(
        `UPDATE job_billing 
         SET materials_cost = $1,
             workmanship_cost = $2
         WHERE job_id = $3`,
        [boq.total_materials_cost, boq.total_workmanship_cost, boq.job_id]
      );
      
      await client.query('COMMIT');
      
      // Notify artisan
      await NotificationService.sendPushNotification(
        boq.artisan_id,
        'BOQ Approved by Client',
        'Your BOQ has been approved by the client and is pending admin review.',
        { boqId, jobId: boq.job_id, type: 'boq_client_approved' }
      );
      
      logger.info(`BOQ ${boqId} approved by client`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Client reject BOQ
   * @param {string} boqId - BOQ ID
   * @param {string} clientId - Client ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Rejected BOQ
   */
  static async clientReject(boqId, clientId, reason) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const boqResult = await client.query(
        `SELECT b.*, j.client_id, j.artisan_id
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
        'BOQ Rejected by Client',
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

  /**
   * Admin approve BOQ
   * @param {string} boqId - BOQ ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Approved BOQ
   */
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
      
      // Update job billing with final approved costs
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
        'Your BOQ has been approved by admin. You can proceed with the job.',
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

  /**
   * Admin reject BOQ
   * @param {string} boqId - BOQ ID
   * @param {string} adminId - Admin ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Rejected BOQ
   */
  static async adminReject(boqId, adminId, reason) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE bill_of_quantities 
         SET admin_approved = false, 
             status = 'rejected_by_admin',
             rejection_reason = $1,
             rejected_at = NOW(),
             admin_id = $2
         WHERE id = $3 AND status = 'pending_admin_approval'
         RETURNING *`,
        [reason, adminId, boqId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'BOQ not found or not pending admin approval');
      }
      
      await client.query('COMMIT');
      
      logger.info(`BOQ ${boqId} rejected by admin: ${reason}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get BOQ by ID with authorization check
   * @param {string} boqId - BOQ ID
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @returns {Promise<Object>} BOQ details
   */
  static async getBOQ(boqId, userId, userType) {
    const cacheKey = `boq:${boqId}`;
    let boq = await cacheGet(cacheKey);
    
    if (!boq) {
      const result = await pool.query(
        `SELECT b.*, j.client_id, j.artisan_id,
                cp.full_legal_name as client_name,
                ap.full_legal_name as artisan_name,
                cp.email as client_email,
                ap.email as artisan_email
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
      
      boq = result.rows[0];
      
      // Check authorization
      if (boq.client_id !== userId && boq.artisan_id !== userId && userType !== 'admin') {
        throw new AppError(403, 'Not authorized to view this BOQ');
      }
      
      await cacheSet(cacheKey, boq, 3600);
    }
    
    return boq;
  }

  /**
   * Get BOQ by Job ID
   * @param {string} jobId - Job ID
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @returns {Promise<Object>} Latest BOQ
   */
  static async getBOQByJob(jobId, userId, userType) {
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
      throw new AppError(403, 'Not authorized to view BOQ for this job');
    }
    
    const result = await pool.query(
      `SELECT * FROM bill_of_quantities 
       WHERE job_id = $1 
       ORDER BY version DESC 
       LIMIT 1`,
      [jobId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get BOQ history for a job
   * @param {string} jobId - Job ID
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @returns {Promise<Array>} BOQ history
   */
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

  /**
   * Request material substitution
   * @param {string} boqId - BOQ ID
   * @param {string} artisanId - Artisan ID
   * @param {number} itemIndex - Item index
   * @param {Object} alternativeItem - Alternative item
   * @param {string} reason - Request reason
   * @returns {Promise<Object>} Substitution request
   */
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

  /**
   * Approve substitution request
   * @param {string} requestId - Request ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Approved request
   */
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
      
      // Replace the item
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
      
      await cacheDel(`boq:${request.boq_id}`);
      
      // Notify artisan
      await NotificationService.sendPushNotification(
        boq.artisan_id,
        'Substitution Approved',
        'Your material substitution request has been approved.',
        { boqId: request.boq_id, type: 'substitution_approved' }
      );
      
      logger.info(`Substitution request ${requestId} approved`);
      
      return { approved: true, requestId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject substitution request
   * @param {string} requestId - Request ID
   * @param {string} adminId - Admin ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Rejected request
   */
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

  /**
   * Get all substitution requests (Admin)
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Substitution requests
   */
  static async getSubstitutionRequests(filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT sr.*, b.job_id, b.artisan_id,
             ap.full_legal_name as artisan_name,
             j.category as job_category
      FROM substitution_requests sr
      JOIN bill_of_quantities b ON sr.boq_id = b.id
      JOIN artisan_profiles ap ON b.artisan_id = ap.user_id
      JOIN jobs j ON b.job_id = j.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      query += ` AND sr.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY sr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM substitution_requests
      WHERE 1=1
      ${status ? `AND status = '${status}'` : ''}
    `;
    const countResult = await pool.query(countQuery);
    
    return {
      requests: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Get BOQ statistics for admin dashboard
   * @returns {Promise<Object>} BOQ statistics
   */
  static async getBOQStatistics() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_boqs,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN status = 'pending_client_approval' THEN 1 END) as pending_client,
        COUNT(CASE WHEN status = 'pending_admin_approval' THEN 1 END) as pending_admin,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'rejected_by_client' THEN 1 END) as rejected_by_client,
        COUNT(CASE WHEN status = 'rejected_by_admin' THEN 1 END) as rejected_by_admin,
        AVG(total_materials_cost + total_workmanship_cost) as average_total,
        SUM(total_materials_cost + total_workmanship_cost) as total_value
      FROM bill_of_quantities
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    
    const monthlyTrend = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as count,
        AVG(total_materials_cost + total_workmanship_cost) as avg_value
      FROM bill_of_quantities
      WHERE created_at > NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `);
    
    return {
      summary: result.rows[0],
      monthlyTrend: monthlyTrend.rows
    };
  }

  /**
   * Download BOQ as PDF
   * @param {string} boqId - BOQ ID
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async downloadBOQ(boqId, userId, userType) {
    const boq = await this.getBOQ(boqId, userId, userType);
    
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Header
      doc.fontSize(20).text('BILL OF QUANTITIES', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`BOQ ID: ${boq.id.slice(0, 8)}`, { align: 'center' });
      doc.text(`Version: ${boq.version}`, { align: 'center' });
      doc.text(`Status: ${boq.status.replace(/_/g, ' ').toUpperCase()}`, { align: 'center' });
      doc.text(`Date: ${new Date(boq.created_at).toLocaleDateString()}`, { align: 'center' });
      doc.moveDown();
      
      // Job Information
      doc.fontSize(12).text('JOB INFORMATION', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Job ID: ${boq.job_id.slice(0, 8)}`);
      doc.text(`Client: ${boq.client_name}`);
      doc.text(`Artisan: ${boq.artisan_name}`);
      doc.moveDown();
      
      // Materials
      doc.fontSize(12).text('MATERIALS', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9);
      
      // Table headers
      const startX = 50;
      let y = doc.y;
      doc.text('S/N', startX, y);
      doc.text('Item', startX + 50, y);
      doc.text('Specifications', startX + 200, y);
      doc.text('Qty', startX + 350, y);
      doc.text('Unit Price (₦)', startX + 400, y);
      doc.text('Total (₦)', startX + 480, y);
      doc.moveDown();
      
      // Table rows
      let serialNumber = 1;
      for (const item of boq.items) {
        y = doc.y;
        doc.text(serialNumber.toString(), startX, y);
        doc.text(item.name.substring(0, 30), startX + 50, y);
        doc.text((item.specifications || '-').substring(0, 30), startX + 200, y);
        doc.text(item.quantity.toString(), startX + 350, y);
        doc.text(item.unitCost.toLocaleString(), startX + 400, y);
        doc.text((item.quantity * item.unitCost).toLocaleString(), startX + 480, y);
        doc.moveDown();
        serialNumber++;
      }
      
      doc.moveDown();
      doc.text('-' .repeat(80));
      
      // Totals
      const totalMaterials = boq.total_materials_cost;
      const totalWorkmanship = boq.total_workmanship_cost;
      const grandTotal = totalMaterials + totalWorkmanship;
      
      doc.fontSize(10);
      doc.text(`Total Materials Cost: ₦${totalMaterials.toLocaleString()}`, { align: 'right' });
      doc.text(`Workmanship Cost: ₦${totalWorkmanship.toLocaleString()}`, { align: 'right' });
      doc.fontSize(12);
      doc.text(`GRAND TOTAL: ₦${grandTotal.toLocaleString()}`, { align: 'right', bold: true });
      
      doc.moveDown();
      
      // Notes
      if (boq.notes) {
        doc.fontSize(10);
        doc.text('NOTES:', { underline: true });
        doc.text(boq.notes);
      }
      
      doc.end();
    });
  }
}

module.exports = BOQService;