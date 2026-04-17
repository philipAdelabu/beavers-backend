const { pool } = require('../config/database');

class Dispute {
  static async create(disputeData) {
    const { jobId, clientId, reason, description, evidence } = disputeData;
    
    const result = await pool.query(
      `INSERT INTO disputes 
       (job_id, client_id, reason, description, evidence, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [jobId, clientId, reason, description, evidence || []]
    );
    
    return result.rows[0];
  }

  static async findById(disputeId) {
    const result = await pool.query(
      `SELECT d.*, 
              j.category, j.service_type, j.job_status,
              cp.full_legal_name as client_name, cp.email as client_email,
              ap.full_legal_name as artisan_name, ap.email as artisan_email,
              a.full_legal_name as admin_name
       FROM disputes d
       JOIN jobs j ON d.job_id = j.id
       JOIN client_profiles cp ON d.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
       LEFT JOIN users a ON d.resolved_by = a.id
       WHERE d.id = $1`,
      [disputeId]
    );
    return result.rows[0];
  }

  static async findByJobId(jobId) {
    const result = await pool.query(
      `SELECT * FROM disputes 
       WHERE job_id = $1 
       ORDER BY created_at DESC`,
      [jobId]
    );
    return result.rows;
  }

  static async updateStatus(disputeId, status, resolution = null, resolvedBy = null) {
    const result = await pool.query(
      `UPDATE disputes 
       SET status = $1,
           resolution = COALESCE($2, resolution),
           resolved_by = COALESCE($3, resolved_by),
           resolved_at = CASE WHEN $1 IN ('resolved', 'rejected') THEN NOW() ELSE resolved_at END
       WHERE id = $4
       RETURNING *`,
      [status, resolution, resolvedBy, disputeId]
    );
    return result.rows[0];
  }

  static async addMessage(disputeId, userId, message, attachments = []) {
    const result = await pool.query(
      `INSERT INTO dispute_messages (dispute_id, user_id, message, attachments)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [disputeId, userId, message, attachments]
    );
    return result.rows[0];
  }

  static async getMessages(disputeId) {
    const result = await pool.query(
      `SELECT dm.*, 
              CASE WHEN u.user_type = 'client' THEN cp.full_legal_name
                   WHEN u.user_type = 'artisan' THEN ap.full_legal_name
                   ELSE 'Admin'
              END as user_name,
              u.user_type
       FROM dispute_messages dm
       JOIN users u ON dm.user_id = u.id
       LEFT JOIN client_profiles cp ON u.id = cp.user_id
       LEFT JOIN artisan_profiles ap ON u.id = ap.user_id
       WHERE dm.dispute_id = $1
       ORDER BY dm.created_at ASC`,
      [disputeId]
    );
    return result.rows;
  }

  static async getAllDisputes(filters = {}) {
    const { status, page = 1, limit = 20, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT d.*, j.category, j.service_type,
             cp.full_legal_name as client_name,
             ap.full_legal_name as artisan_name
      FROM disputes d
      JOIN jobs j ON d.job_id = j.id
      JOIN client_profiles cp ON d.client_id = cp.user_id
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      query += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND d.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND d.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY d.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM disputes
      WHERE 1=1
      ${status ? 'AND status = $1' : ''}
    `;
    const countParams = status ? [status] : [];
    const countResult = await pool.query(countQuery, countParams);
    
    // Get statistics
    const statsResult = await pool.query(
      `SELECT 
         status,
         COUNT(*) as count
       FROM disputes
       GROUP BY status`
    );
    
    return {
      disputes: result.rows,
      statistics: statsResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async getDisputesByClient(clientId, filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT d.*, j.category, j.service_type,
             ap.full_legal_name as artisan_name
      FROM disputes d
      JOIN jobs j ON d.job_id = j.id
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      WHERE d.client_id = $1
    `;
    const params = [clientId];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY d.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM disputes WHERE client_id = $1
      ${status ? 'AND status = $2' : ''}
    `;
    const countParams = status ? [clientId, status] : [clientId];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      disputes: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async getDisputesByArtisan(artisanId, filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT d.*, j.category, j.service_type,
             cp.full_legal_name as client_name
      FROM disputes d
      JOIN jobs j ON d.job_id = j.id
      JOIN client_profiles cp ON d.client_id = cp.user_id
      WHERE j.artisan_id = $1
    `;
    const params = [artisanId];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY d.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return {
      disputes: result.rows,
      page,
      limit
    };
  }

  static async escalateDispute(disputeId, reason) {
    const result = await pool.query(
      `UPDATE disputes 
       SET escalated = true,
           escalation_reason = $1,
           escalated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reason, disputeId]
    );
    return result.rows[0];
  }

  static async getPendingDisputes() {
    const result = await pool.query(
      `SELECT d.*, 
              j.category, 
              cp.full_legal_name as client_name,
              ap.full_legal_name as artisan_name,
              EXTRACT(EPOCH FROM (NOW() - d.created_at)) / 3600 as hours_pending
       FROM disputes d
       JOIN jobs j ON d.job_id = j.id
       JOIN client_profiles cp ON d.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
       WHERE d.status = 'pending'
       ORDER BY d.created_at ASC`,
      []
    );
    return result.rows;
  }

  static async getDisputeStats() {
    const result = await pool.query(
      `SELECT 
         COUNT(*) as total_disputes,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_disputes,
         COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_disputes,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_disputes,
         AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_resolution_hours,
         COUNT(CASE WHEN escalated = true THEN 1 END) as escalated_disputes
       FROM disputes
       WHERE created_at > NOW() - INTERVAL '30 days'`,
      []
    );
    return result.rows[0];
  }
}

module.exports = Dispute;