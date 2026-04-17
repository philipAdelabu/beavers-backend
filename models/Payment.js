const { pool } = require('../config/database');

class Payment {
  static async createIntent(paymentData) {
    const { jobId, clientId, paymentIntentId, clientSecret, amount, currency = 'ngn' } = paymentData;
    
    const result = await pool.query(
      `INSERT INTO payment_intents 
       (job_id, client_id, payment_intent_id, client_secret, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [jobId, clientId, paymentIntentId, clientSecret, amount, currency]
    );
    
    return result.rows[0];
  }

  static async findByIntentId(paymentIntentId) {
    const result = await pool.query(
      `SELECT * FROM payment_intents WHERE payment_intent_id = $1`,
      [paymentIntentId]
    );
    return result.rows[0];
  }

  static async findByJobId(jobId) {
    const result = await pool.query(
      `SELECT * FROM payment_intents WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [jobId]
    );
    return result.rows[0];
  }

  static async updateStatus(paymentIntentId, status, metadata = null) {
    const result = await pool.query(
      `UPDATE payment_intents 
       SET status = $1, 
           metadata = COALESCE($2, metadata),
           paid_at = CASE WHEN $1 = 'succeeded' THEN NOW() ELSE paid_at END,
           updated_at = NOW()
       WHERE payment_intent_id = $3
       RETURNING *`,
      [status, metadata, paymentIntentId]
    );
    return result.rows[0];
  }

  static async getClientPayments(clientId, filters = {}) {
    const { status, page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT pi.*, j.category, j.service_type, j.job_status
      FROM payment_intents pi
      JOIN jobs j ON pi.job_id = j.id
      WHERE j.client_id = $1
    `;
    const params = [clientId];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND pi.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND pi.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND pi.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY pi.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM payment_intents pi
      JOIN jobs j ON pi.job_id = j.id
      WHERE j.client_id = $1
      ${status ? 'AND pi.status = $2' : ''}
    `;
    const countParams = status ? [clientId, status] : [clientId];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      payments: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async createRefund(jobId, amount, reason) {
    const result = await pool.query(
      `INSERT INTO refunds (job_id, amount, reason, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [jobId, amount, reason]
    );
    return result.rows[0];
  }

  static async updateRefundStatus(refundId, status, transactionId = null) {
    const result = await pool.query(
      `UPDATE refunds 
       SET status = $1, 
           transaction_id = COALESCE($2, transaction_id),
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
       WHERE id = $3
       RETURNING *`,
      [status, transactionId, refundId]
    );
    return result.rows[0];
  }

  static async getPaymentMethods(clientId) {
    const result = await pool.query(
      `SELECT * FROM payment_methods 
       WHERE client_id = $1 
       ORDER BY is_default DESC, created_at DESC`,
      [clientId]
    );
    return result.rows;
  }

  static async addPaymentMethod(clientId, methodData) {
    const { paymentMethodId, type, last4, expiryMonth, expiryYear, isDefault } = methodData;
    
    if (isDefault) {
      await pool.query(
        `UPDATE payment_methods SET is_default = false WHERE client_id = $1`,
        [clientId]
      );
    }
    
    const result = await pool.query(
      `INSERT INTO payment_methods 
       (client_id, payment_method_id, type, last4, expiry_month, expiry_year, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [clientId, paymentMethodId, type, last4, expiryMonth, expiryYear, isDefault || false]
    );
    
    return result.rows[0];
  }

  static async deletePaymentMethod(methodId, clientId) {
    const result = await pool.query(
      `DELETE FROM payment_methods 
       WHERE id = $1 AND client_id = $2
       RETURNING *`,
      [methodId, clientId]
    );
    return result.rows[0];
  }

  static async setDefaultPaymentMethod(methodId, clientId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      await client.query(
        `UPDATE payment_methods SET is_default = false WHERE client_id = $1`,
        [clientId]
      );
      
      const result = await client.query(
        `UPDATE payment_methods 
         SET is_default = true 
         WHERE id = $1 AND client_id = $2
         RETURNING *`,
        [methodId, clientId]
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

  static async getTransactionSummary(clientId, period = 'month') {
    let interval;
    switch (period) {
      case 'week':
        interval = "INTERVAL '7 days'";
        break;
      case 'month':
        interval = "INTERVAL '30 days'";
        break;
      case 'year':
        interval = "INTERVAL '365 days'";
        break;
      default:
        interval = "INTERVAL '30 days'";
    }
    
    const result = await pool.query(
      `SELECT 
         COUNT(*) as total_transactions,
         SUM(amount) as total_amount,
         AVG(amount) as average_amount,
         COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as successful_transactions,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions
       FROM payment_intents pi
       JOIN jobs j ON pi.job_id = j.id
       WHERE j.client_id = $1 
         AND pi.created_at > NOW() - ${interval}`,
      [clientId]
    );
    
    return result.rows[0];
  }
}

module.exports = Payment;