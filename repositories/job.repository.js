const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class JobRepository {
  /**
   * Create a new job
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} Created job
   */
  static async create(jobData) {
    const { clientId, category, description, mediaUrls, serviceType, location } = jobData;
    
    const result = await pool.query(
      `INSERT INTO jobs 
       (client_id, category, description, media_urls, service_type, job_status, location)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING *`,
      [clientId, category, description, mediaUrls || [], serviceType, location]
    );
    
    return result.rows[0];
  }

  /**
   * Find job by ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object|null>} Job or null
   */
  static async findById(jobId) {
    const result = await pool.query(
      `SELECT j.*, 
              cp.full_legal_name as client_name, cp.phone as client_phone,
              ap.full_legal_name as artisan_name, ap.phone as artisan_phone,
              ap.star_rating as artisan_rating,
              jb.base_fee, jb.diagnostics_fee, jb.execution_fee, 
              jb.materials_cost, jb.workmanship_cost, jb.total_amount,
              jb.billing_status,
              boq.items as boq_items, boq.status as boq_status
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
    
    return result.rows[0] || null;
  }

  /**
   * Update job
   * @param {string} jobId - Job ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated job or null
   */
  static async update(jobId, updates) {
    const allowedFields = [
      'artisan_id', 'job_status', 'service_type', 'billing_mode',
      'diagnostics_started_at', 'diagnostics_ended_at', 'diagnostics_findings',
      'execution_started_at', 'execution_ended_at',
      'completed_at', 'cancelled_at', 'cancellation_reason', 'cancelled_by',
      'quoted_amount', 'quote_details', 'estimated_duration',
      'quote_approved_at', 'quote_rejected_at', 'quote_rejection_reason',
      'completion_notes', 'accepted_at', 'arrived_at'
    ];
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
    
    values.push(jobId);
    const query = `
      UPDATE jobs 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Get jobs for client
   * @param {string} clientId - Client ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Jobs and pagination
   */
  static async getClientJobs(clientId, filters = {}) {
    const { status, page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT j.*, ap.full_legal_name as artisan_name, ap.star_rating,
             jb.total_amount, jb.billing_status
      FROM jobs j
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
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
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Get jobs for artisan
   * @param {string} artisanId - Artisan ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Jobs and pagination
   */
  static async getArtisanJobs(artisanId, filters = {}) {
    const { status, page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT j.*, cp.full_legal_name as client_name, cp.phone as client_phone,
             jb.total_amount, jb.billing_status
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
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Create job offer
   * @param {string} jobId - Job ID
   * @param {string} artisanId - Artisan ID
   * @returns {Promise<Object>} Created offer
   */
  static async createOffer(jobId, artisanId) {
    const result = await pool.query(
      `INSERT INTO job_offers (job_id, artisan_id, status, expires_at)
       VALUES ($1, $2, 'pending', NOW() + INTERVAL '2 minutes')
       RETURNING *`,
      [jobId, artisanId]
    );
    
    return result.rows[0];
  }

  /**
   * Accept job offer
   * @param {string} jobId - Job ID
   * @param {string} artisanId - Artisan ID
   * @returns {Promise<Object|null>} Updated job or null
   */
  static async acceptOffer(jobId, artisanId) {
    const result = await pool.query(
      `UPDATE jobs 
       SET artisan_id = $1, job_status = 'accepted', accepted_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND job_status = 'pending'
       RETURNING *`,
      [artisanId, jobId]
    );
    
    if (result.rows.length > 0) {
      // Reject other offers
      await pool.query(
        `UPDATE job_offers SET status = 'rejected' 
         WHERE job_id = $1 AND artisan_id != $2 AND status = 'pending'`,
        [jobId, artisanId]
      );
      
      // Accept this offer
      await pool.query(
        `UPDATE job_offers SET status = 'accepted' 
         WHERE job_id = $1 AND artisan_id = $2`,
        [jobId, artisanId]
      );
    }
    
    return result.rows[0] || null;
  }

  /**
   * Get job timeline
   * @param {string} jobId - Job ID
   * @returns {Promise<Array>} Timeline entries
   */
  static async getTimeline(jobId) {
    const result = await pool.query(
      `SELECT * FROM job_timeline 
       WHERE job_id = $1 
       ORDER BY created_at ASC`,
      [jobId]
    );
    
    return result.rows;
  }

  /**
   * Add timeline entry
   * @param {string} jobId - Job ID
   * @param {string} status - Status
   * @param {string} description - Description
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Created entry
   */
  static async addTimelineEntry(jobId, status, description, metadata = {}) {
    const result = await pool.query(
      `INSERT INTO job_timeline (job_id, status, description, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [jobId, status, description, metadata]
    );
    
    return result.rows[0];
  }

  /**
   * Get active jobs count
   * @returns {Promise<number>} Active jobs count
   */
  static async getActiveJobsCount() {
    const result = await pool.query(
      `SELECT COUNT(*) FROM jobs 
       WHERE job_status IN ('pending', 'accepted', 'arrived', 'diagnostics', 'execution')`
    );
    
    return parseInt(result.rows[0].count);
  }

  /**
   * Get jobs by category
   * @param {string} category - Job category
   * @param {number} limit - Limit
   * @returns {Promise<Array>} Jobs
   */
  static async getJobsByCategory(category, limit = 10) {
    const result = await pool.query(
      `SELECT j.*, cp.full_legal_name as client_name
       FROM jobs j
       JOIN client_profiles cp ON j.client_id = cp.user_id
       WHERE j.category = $1 AND j.job_status = 'pending'
       ORDER BY j.created_at DESC
       LIMIT $2`,
      [category, limit]
    );
    
    return result.rows;
  }

  /**
   * Get job statistics
   * @returns {Promise<Object>} Job statistics
   */
  static async getStatistics() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
        COUNT(CASE WHEN job_status = 'pending' THEN 1 END) as pending_jobs,
        COUNT(CASE WHEN job_status IN ('accepted', 'arrived', 'diagnostics', 'execution') THEN 1 END) as active_jobs,
        COALESCE(AVG(jb.total_amount), 0) as average_job_value,
        COALESCE(SUM(jb.total_amount), 0) as total_job_value
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
    `);
    
    const categoryBreakdown = await pool.query(`
      SELECT 
        category,
        COUNT(*) as job_count,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_count
      FROM jobs
      GROUP BY category
      ORDER BY job_count DESC
    `);
    
    return {
      ...result.rows[0],
      categoryBreakdown: categoryBreakdown.rows
    };
  }
}

module.exports = JobRepository;