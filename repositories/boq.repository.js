const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class BOQRepository {
  /**
   * Create bill of quantities
   * @param {Object} boqData - BOQ data
   * @returns {Promise<Object>} Created BOQ
   */
  static async create(boqData) {
    const { jobId, artisanId, items, totalMaterialsCost, totalWorkmanshipCost, notes, version } = boqData;
    
    const result = await pool.query(
      `INSERT INTO bill_of_quantities 
       (job_id, artisan_id, items, total_materials_cost, total_workmanship_cost, notes, version, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
       RETURNING *`,
      [jobId, artisanId, items, totalMaterialsCost, totalWorkmanshipCost, notes, version]
    );
    
    return result.rows[0];
  }

  /**
   * Find BOQ by ID
   * @param {string} boqId - BOQ ID
   * @returns {Promise<Object|null>} BOQ or null
   */
  static async findById(boqId) {
    const result = await pool.query(
      `SELECT b.*, j.client_id, cp.full_legal_name as client_name,
              ap.full_legal_name as artisan_name
       FROM bill_of_quantities b
       JOIN jobs j ON b.job_id = j.id
       LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON b.artisan_id = ap.user_id
       WHERE b.id = $1`,
      [boqId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Find BOQ by job ID
   * @param {string} jobId - Job ID
   * @param {number} version - Version number (optional)
   * @returns {Promise<Object|Array>} BOQ or BOQs
   */
  static async findByJobId(jobId, version = null) {
    if (version !== null) {
      const result = await pool.query(
        `SELECT * FROM bill_of_quantities WHERE job_id = $1 AND version = $2`,
        [jobId, version]
      );
      return result.rows[0] || null;
    }
    
    const result = await pool.query(
      `SELECT * FROM bill_of_quantities WHERE job_id = $1 ORDER BY version DESC LIMIT 1`,
      [jobId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get BOQ history for job
   * @param {string} jobId - Job ID
   * @returns {Promise<Array>} BOQ history
   */
  static async getHistory(jobId) {
    const result = await pool.query(
      `SELECT * FROM bill_of_quantities 
       WHERE job_id = $1 
       ORDER BY version DESC`,
      [jobId]
    );
    
    return result.rows;
  }

  /**
   * Update BOQ
   * @param {string} boqId - BOQ ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated BOQ or null
   */
  static async update(boqId, updates) {
    const allowedFields = ['items', 'total_materials_cost', 'total_workmanship_cost', 'notes', 'status'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) return null;
    
    values.push(boqId);
    const query = `
      UPDATE bill_of_quantities 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Submit BOQ for approval
   * @param {string} boqId - BOQ ID
   * @returns {Promise<Object|null>} Updated BOQ or null
   */
  static async submitForApproval(boqId) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET status = 'pending_client_approval', submitted_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [boqId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Client approve BOQ
   * @param {string} boqId - BOQ ID
   * @returns {Promise<Object|null>} Updated BOQ or null
   */
  static async clientApprove(boqId) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET client_approved = true, status = 'pending_admin_approval', client_approved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [boqId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Client reject BOQ
   * @param {string} boqId - BOQ ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object|null>} Updated BOQ or null
   */
  static async clientReject(boqId, reason) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET client_approved = false, status = 'rejected_by_client', rejection_reason = $1, rejected_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reason, boqId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Admin approve BOQ
   * @param {string} boqId - BOQ ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object|null>} Updated BOQ or null
   */
  static async adminApprove(boqId, adminId) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET admin_approved = true, status = 'approved', admin_approved_at = NOW(), admin_id = $1
       WHERE id = $2
       RETURNING *`,
      [adminId, boqId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Admin reject BOQ
   * @param {string} boqId - BOQ ID
   * @param {string} adminId - Admin ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object|null>} Updated BOQ or null
   */
  static async adminReject(boqId, adminId, reason) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET admin_approved = false, status = 'rejected_by_admin', rejection_reason = $1, rejected_at = NOW(), admin_id = $2
       WHERE id = $3
       RETURNING *`,
      [reason, adminId, boqId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Create substitution request
   * @param {string} boqId - BOQ ID
   * @param {number} itemIndex - Item index
   * @param {Object} alternativeItem - Alternative item
   * @param {string} reason - Request reason
   * @returns {Promise<Object>} Created substitution request
   */
  static async createSubstitutionRequest(boqId, itemIndex, alternativeItem, reason) {
    const result = await pool.query(
      `INSERT INTO substitution_requests (boq_id, item_index, alternative_item, reason, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [boqId, itemIndex, alternativeItem, reason]
    );
    
    return result.rows[0];
  }

  /**
   * Approve substitution request
   * @param {string} requestId - Request ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object|null>} Updated request or null
   */
  static async approveSubstitution(requestId, adminId) {
    const result = await pool.query(
      `UPDATE substitution_requests 
       SET status = 'approved', approved_by = $1, approved_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [adminId, requestId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Reject substitution request
   * @param {string} requestId - Request ID
   * @param {string} adminId - Admin ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object|null>} Updated request or null
   */
  static async rejectSubstitution(requestId, adminId, reason) {
    const result = await pool.query(
      `UPDATE substitution_requests 
       SET status = 'rejected', rejection_reason = $1, approved_by = $2, approved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [reason, adminId, requestId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get next version number for job
   * @param {string} jobId - Job ID
   * @returns {Promise<number>} Next version number
   */
  static async getNextVersion(jobId) {
    const result = await pool.query(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version 
       FROM bill_of_quantities WHERE job_id = $1`,
      [jobId]
    );
    
    return parseInt(result.rows[0].next_version);
  }
}

module.exports = BOQRepository;