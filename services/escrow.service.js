const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');

class EscrowService {
  static async createHold(escrowData) {
    const { jobId, clientId, artisanId, amount, transactionType, disputeBufferDays = 3 } = escrowData;
    
    const result = await pool.query(
      `INSERT INTO escrow_transactions 
       (job_id, client_id, artisan_id, amount, transaction_type, status, dispute_buffer_until)
       VALUES ($1, $2, $3, $4, $5, 'held', NOW() + ($6 || ' days')::INTERVAL)
       RETURNING *`,
      [jobId, clientId, artisanId, amount, transactionType, disputeBufferDays]
    );
    
    logger.info(`Escrow hold created: ${result.rows[0].id} - ${transactionType}: ₦${amount}`);
    
    return result.rows[0];
  }
  
  static async releaseFunds(transactionId, releaseReason = 'normal', releasedBy = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE escrow_transactions 
         SET status = 'released', 
             release_date = NOW(),
             release_reason = $1,
             released_by = $2
         WHERE id = $3 AND status = 'held'
         RETURNING *`,
        [releaseReason, releasedBy, transactionId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Transaction not found or not held');
      }
      
      const transaction = result.rows[0];
      
      // If this is workmanship payment, create payout record
      if (transaction.transaction_type === 'workmanship') {
        await client.query(
          `INSERT INTO artisan_payouts (job_id, artisan_id, amount, status)
           VALUES ($1, $2, $3, 'pending')`,
          [transaction.job_id, transaction.artisan_id, transaction.amount]
        );
      }
      
      await client.query('COMMIT');
      
      // Send notification to artisan
      if (transaction.artisan_id && transaction.transaction_type === 'workmanship') {
        await NotificationService.sendPushNotification(
          transaction.artisan_id,
          'Payment Released',
          `₦${transaction.amount.toLocaleString()} has been released to your account.`,
          { type: 'payment_released', amount: transaction.amount }
        );
      }
      
      logger.info(`Escrow funds released: ${transactionId} - ₦${transaction.amount}`);
      
      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async releaseJobFunds(jobId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const transactions = await client.query(
        `SELECT * FROM escrow_transactions 
         WHERE job_id = $1 AND status = 'held'
         AND dispute_buffer_until < NOW()`,
        [jobId]
      );
      
      const released = [];
      for (const transaction of transactions.rows) {
        const releasedTransaction = await this.releaseFunds(transaction.id, 'job_completed', 'system');
        released.push(releasedTransaction);
      }
      
      await client.query('COMMIT');
      
      logger.info(`Released ${released.length} escrow transactions for job ${jobId}`);
      
      return released;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async freezeFunds(transactionId, reason, frozenBy = null) {
    const result = await pool.query(
      `UPDATE escrow_transactions 
       SET status = 'frozen', 
           frozen_at = NOW(),
           freeze_reason = $1,
           frozen_by = $2
       WHERE id = $3 AND status = 'held'
       RETURNING *`,
      [reason, frozenBy, transactionId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Transaction not found or not held');
    }
    
    logger.info(`Escrow funds frozen: ${transactionId} - Reason: ${reason}`);
    
    return result.rows[0];
  }
  
  static async freezeJobFunds(jobId, reason, frozenBy = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const transactions = await client.query(
        `UPDATE escrow_transactions 
         SET status = 'frozen', 
             frozen_at = NOW(),
             freeze_reason = $1,
             frozen_by = $2
         WHERE job_id = $3 AND status = 'held'
         RETURNING *`,
        [reason, frozenBy, jobId]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Frozen ${transactions.rowCount} escrow transactions for job ${jobId}`);
      
      return transactions.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async releaseFrozenFunds(transactionId, releasedBy) {
    const result = await pool.query(
      `UPDATE escrow_transactions 
       SET status = 'released', 
           release_date = NOW(),
           released_by = $1,
           release_reason = 'dispute_resolved'
       WHERE id = $2 AND status = 'frozen'
       RETURNING *`,
      [releasedBy, transactionId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Transaction not found or not frozen');
    }
    
    logger.info(`Frozen funds released: ${transactionId}`);
    
    return result.rows[0];
  }
  
  static async refundFunds(transactionId, refundReason, refundedBy = null) {
    const result = await pool.query(
      `UPDATE escrow_transactions 
       SET status = 'refunded', 
           refunded_at = NOW(),
           refund_reason = $1,
           refunded_by = $2
       WHERE id = $3 AND status IN ('held', 'frozen')
       RETURNING *`,
      [refundReason, refundedBy, transactionId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Transaction not found or cannot be refunded');
    }
    
    const transaction = result.rows[0];
    
    // Create refund record
    await pool.query(
      `INSERT INTO refunds (job_id, client_id, amount, reason, status)
       VALUES ($1, $2, $3, $4, 'completed')`,
      [transaction.job_id, transaction.client_id, transaction.amount, refundReason]
    );
    
    logger.info(`Escrow funds refunded: ${transactionId} - ₦${transaction.amount}`);
    
    // Send notification to client
    await NotificationService.sendPushNotification(
      transaction.client_id,
      'Refund Processed',
      `A refund of ₦${transaction.amount.toLocaleString()} has been processed for your job.`,
      { type: 'refund', amount: transaction.amount, jobId: transaction.job_id }
    );
    
    return transaction;
  }
  
  static async getBalance(jobId) {
    const result = await pool.query(
      `SELECT 
         transaction_type,
         SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END) as held_amount,
         SUM(CASE WHEN status = 'frozen' THEN amount ELSE 0 END) as frozen_amount,
         SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END) as released_amount
       FROM escrow_transactions
       WHERE job_id = $1
       GROUP BY transaction_type`,
      [jobId]
    );
    
    const summary = {
      totalHeld: 0,
      totalFrozen: 0,
      totalReleased: 0,
      breakdown: {}
    };
    
    for (const row of result.rows) {
      summary.breakdown[row.transaction_type] = {
        held: parseFloat(row.held_amount || 0),
        frozen: parseFloat(row.frozen_amount || 0),
        released: parseFloat(row.released_amount || 0)
      };
      
      summary.totalHeld += parseFloat(row.held_amount || 0);
      summary.totalFrozen += parseFloat(row.frozen_amount || 0);
      summary.totalReleased += parseFloat(row.released_amount || 0);
    }
    
    return summary;
  }
  
  static async getTransactionHistory(filters = {}) {
    const { jobId, clientId, artisanId, status, transactionType, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT et.*, 
             j.category, j.service_type,
             cp.full_legal_name as client_name,
             ap.full_legal_name as artisan_name
      FROM escrow_transactions et
      JOIN jobs j ON et.job_id = j.id
      LEFT JOIN client_profiles cp ON et.client_id = cp.user_id
      LEFT JOIN artisan_profiles ap ON et.artisan_id = ap.user_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (jobId) {
      query += ` AND et.job_id = $${paramIndex}`;
      params.push(jobId);
      paramIndex++;
    }
    
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
    
    if (transactionType) {
      query += ` AND et.transaction_type = $${paramIndex}`;
      params.push(transactionType);
      paramIndex++;
    }
    
    query += ` ORDER BY et.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM escrow_transactions
      WHERE 1=1
      ${jobId ? `AND job_id = '${jobId}'` : ''}
      ${clientId ? `AND client_id = '${clientId}'` : ''}
      ${status ? `AND status = '${status}'` : ''}
    `;
    const countResult = await pool.query(countQuery);
    
    return {
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  static async getEscrowSummary(filters = {}) {
    const { startDate, endDate } = filters;
    
    let dateCondition = '';
    const params = [];
    
    if (startDate && endDate) {
      dateCondition = 'AND created_at BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    }
    
    const result = await pool.query(`
      SELECT 
        SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END) as total_held,
        SUM(CASE WHEN status = 'frozen' THEN amount ELSE 0 END) as total_frozen,
        SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END) as total_released,
        SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) as total_refunded,
        COUNT(*) as total_transactions,
        COUNT(DISTINCT job_id) as unique_jobs
      FROM escrow_transactions
      WHERE 1=1 ${dateCondition}
    `, params);
    
    const byType = await pool.query(`
      SELECT 
        transaction_type,
        SUM(CASE WHEN status = 'held' THEN amount ELSE 0 END) as held,
        SUM(CASE WHEN status = 'released' THEN amount ELSE 0 END) as released,
        COUNT(*) as count
      FROM escrow_transactions
      WHERE 1=1 ${dateCondition}
      GROUP BY transaction_type
    `, params);
    
    return {
      summary: result.rows[0],
      byType: byType.rows
    };
  }
  
  static async autoReleaseExpiredBuffers() {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const transactions = await client.query(
        `SELECT * FROM escrow_transactions 
         WHERE status = 'held' 
           AND dispute_buffer_until < NOW()
           AND transaction_type != 'base_fee'
           AND transaction_type != 'materials'`,
        []
      );
      
      const released = [];
      for (const transaction of transactions.rows) {
        const releasedTransaction = await this.releaseFunds(transaction.id, 'buffer_expired', 'system');
        released.push(releasedTransaction);
      }
      
      await client.query('COMMIT');
      
      logger.info(`Auto-released ${released.length} escrow transactions with expired buffers`);
      
      return released;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async getPendingDisbursements() {
    const result = await pool.query(`
      SELECT 
        et.artisan_id,
        ap.full_legal_name,
        SUM(et.amount) as total_amount,
        COUNT(*) as transaction_count
      FROM escrow_transactions et
      JOIN artisan_profiles ap ON et.artisan_id = ap.user_id
      WHERE et.status = 'released' 
        AND et.transaction_type = 'workmanship'
        AND et.artisan_id NOT IN (
          SELECT artisan_id FROM artisan_payouts 
          WHERE status IN ('pending', 'completed')
            AND created_at > NOW() - INTERVAL '1 hour'
        )
      GROUP BY et.artisan_id, ap.full_legal_name
      HAVING SUM(et.amount) > 0
    `);
    
    return result.rows;
  }
}

module.exports = EscrowService;