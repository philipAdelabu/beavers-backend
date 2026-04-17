const { pool } = require('../config/database');

class Job {
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

  static async findById(jobId) {
    const result = await pool.query(
      `SELECT j.*, 
              cp.full_legal_name as client_name, cp.phone as client_phone,
              ap.full_legal_name as artisan_name, ap.phone as artisan_phone,
              ap.star_rating as artisan_rating,
              jb.base_fee, jb.diagnostics_fee, jb.execution_fee, 
              jb.materials_cost, jb.workmanship_cost, jb.total_amount,
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
    
    return result.rows[0];
  }

  static async update(jobId, updates) {
    const allowedFields = [
      'artisan_id', 'job_status', 'service_type', 'billing_mode',
      'diagnostics_started_at', 'diagnostics_ended_at',
      'execution_started_at', 'execution_ended_at',
      'completed_at', 'cancelled_at', 'cancellation_reason'
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
    return result.rows[0];
  }

  static async getClientJobs(clientId, filters = {}) {
    const { status, page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT j.*, ap.full_legal_name as artisan_name, ap.star_rating
      FROM jobs j
      LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
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
      SELECT j.*, cp.full_legal_name as client_name
      FROM jobs j
      LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
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

  static async createOffer(jobId, artisanId) {
    const result = await pool.query(
      `INSERT INTO job_offers (job_id, artisan_id, status, expires_at)
       VALUES ($1, $2, 'pending', NOW() + INTERVAL '2 minutes')
       RETURNING *`,
      [jobId, artisanId]
    );
    return result.rows[0];
  }

  static async acceptOffer(jobId, artisanId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update job
      const jobResult = await client.query(
        `UPDATE jobs 
         SET artisan_id = $1, job_status = 'accepted', updated_at = NOW()
         WHERE id = $2 AND job_status = 'pending'
         RETURNING *`,
        [artisanId, jobId]
      );
      
      if (jobResult.rows.length === 0) {
        throw new Error('Job not available');
      }
      
      // Update offer status
      await client.query(
        `UPDATE job_offers 
         SET status = 'accepted' 
         WHERE job_id = $1 AND artisan_id = $2`,
        [jobId, artisanId]
      );
      
      // Reject other offers
      await client.query(
        `UPDATE job_offers 
         SET status = 'rejected' 
         WHERE job_id = $1 AND artisan_id != $2 AND status = 'pending'`,
        [jobId, artisanId]
      );
      
      await client.query('COMMIT');
      return jobResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getTimeline(jobId) {
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

  static async getActiveJobsForArtisan(artisanId) {
    const result = await pool.query(
      `SELECT * FROM jobs 
       WHERE artisan_id = $1 
       AND job_status IN ('accepted', 'arrived', 'diagnostics', 'execution')
       ORDER BY created_at DESC`,
      [artisanId]
    );
    return result.rows;
  }

  static async getNearbyJobs(location, radius = 10) {
    const result = await pool.query(
      `SELECT j.*, cp.full_legal_name as client_name,
             ST_Distance(
               ST_SetSRID(ST_MakePoint($1, $2), 4326),
               ST_SetSRID(ST_MakePoint(
                 (j.location->>'longitude')::float,
                 (j.location->>'latitude')::float
               ), 4326)
             ) as distance
       FROM jobs j
       JOIN client_profiles cp ON j.client_id = cp.user_id
       WHERE j.job_status = 'pending'
       HAVING ST_Distance(...) <= $3 * 1000
       ORDER BY distance ASC
       LIMIT 20`,
      [location.longitude, location.latitude, radius]
    );
    return result.rows;
  }
}

module.exports = Job;