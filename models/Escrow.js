const { pool } = require('../config/database');

class Escrow {
  static async createHold(escrowData) {
    const { jobId, clientId, artisanId, amount, transactionType, disputeBufferDays = 3 } = escrowData;
    
    const result = await pool.query(
      `INSERT INTO escrow_transactions 
       (job_id, client_id, artisan_id, amount, transaction_type, status, dispute_buffer_until)
       VALUES ($1, $2, $3, $4, $5, 'held', NOW() + ($6 || ' days')::INTERVAL)
       RETURNING *`,
      [jobId, clientId, artisanId, amount, transactionType, disputeBufferDays]
    );
    
    return result.rows[0];
  }

  static async findByJobId(jobId) {
    const result = await pool.query(
      `SELECT * FROM escrow_transactions 
       WHERE job_id = $1 
       ORDER BY created_at DESC`,
      [jobId]
    );
    return result.rows;
  }

  static async findByTransactionId(transactionId) {
    const result = await pool.query(
      `SELECT * FROM escrow_transactions WHERE id = $1`,
      [transactionId]
    );
    return result.rows[0];
  }

  static async releaseFunds(transactionId, releaseReason = 'normal') {
    const result = await pool.query(
      `UPDATE escrow_transactions 
       SET status = 'released', 
           release_date = NOW(),
           release_reason = $1
       WHERE id = $2 AND status = 'held'
       RETURNING *`,
      [releaseReason, transactionId]
    );
    return result.rows[0];
  }

  static async releaseAllForJob(jobId) {
    const result = await pool.query(
      `UPDATE escrow_transactions 
       SET status = 'released', 
           release_date = NOW(),
           release_reason = 'job_completed'
       WHERE job_id = $1 AND status = 'held'
       RETURNING *`,
      [jobId]
    );
    return result.rows;
  }

  static async freezeFunds(transactionId, reason) {
    const result = await pool.query(
      `UPDATE escrow_transactions 
       SET status = 'frozen', 
           frozen_at = NOW(),
           freeze_reason = $1
       WHERE id = $2
       RETURNING *`,
      [reason, transactionId]
    );
    return result.rows[0];
  }

  static async freezeAllForJob(jobId, reason) {
    const result = await pool.query(
      `UPDATE escrow_transactions 
       SET status = 'frozen', 
           frozen_at = NOW(),
           freeze_reason = $1
       WHERE job_id = $2 AND status = 'held'
       RETURNING *`,
      [reason, jobId]
    );
    return result.rows;
  }

  static async releaseFrozen(transactionId, adminId) {
    const result = await pool.query(
      `UPDATE escrow_transactions 
       SET status = 'released', 
           release_date = NOW(),
           released_by_admin = $1
       WHERE id = $2 AND status = 'frozen'
       RETURNING *`,
      [adminId, transactionId]
    );
    return result.rows[0];
  }

  static async getEscrowBalance(clientId = null) {
    let query = `
      SELECT 
        SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END) as held_balance,
        SUM(CASE WHEN status = 'frozen' THEN amount ELSE 0 END) as frozen_balance,
        SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END) as released_balance,
        COUNT(*) as total_transactions
      FROM escrow_transactions
    `;
    
    const params = [];
    if (clientId) {
      query += ` WHERE client_id = $1`;
      params.push(clientId);
    }
    
    const result = await pool.query(query, params);
    return result.rows[0];
  }

  static async getJobEscrowStatus(jobId) {
    const result = await pool.query(
      `SELECT 
         transaction_type,
         amount,
         status,
         created_at,
         dispute_buffer_until,
         release_date
       FROM escrow_transactions
       WHERE job_id = $1
       ORDER BY created_at ASC`,
      [jobId]
    );
    return result.rows;
  }

  static async checkDisputeBufferExpired(jobId) {
    const result = await pool.query(
      `SELECT COUNT(*) as expired_count
       FROM escrow_transactions
       WHERE job_id = $1 
         AND status = 'held' 
         AND dispute_buffer_until < NOW()`,
      [jobId]
    );
    return parseInt(result.rows[0].expired_count) > 0;
  }

  static async releaseExpiredBuffers() {
    const result = await pool.query(
      `UPDATE escrow_transactions 
       SET status = 'released', 
           release_date = NOW(),
           release_reason = 'dispute_buffer_expired'
       WHERE status = 'held' 
         AND dispute_buffer_until < NOW()
       RETURNING *`
    );
    return result.rows;
  }

  static async getTransactionHistory(filters = {}) {
    const { clientId, artisanId, status, startDate, endDate, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT et.*, j.category, j.service_type
      FROM escrow_transactions et
      JOIN jobs j ON et.job_id = j.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (clientId) {
      query += ` AND et.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }
    
    if (artisanId) {
      query += ` AND et.artisan_id = $${paramIndex}`;
      params.push(artisanId);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND et.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND et.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND et.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY et.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM escrow_transactions et
      JOIN jobs j ON et.job_id = j.id
      WHERE 1=1
      ${clientId ? 'AND et.client_id = $1' : ''}
      ${status ? `AND et.status = $${clientId ? 2 : 1}` : ''}
    `;
    const countParams = clientId ? [clientId] : [];
    if (status) countParams.push(status);
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }
}

module.exports = Escrow;