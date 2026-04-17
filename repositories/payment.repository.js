const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class PaymentRepository {
  /**
   * Create payment intent
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} Created payment intent
   */
  static async createPaymentIntent(paymentData) {
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

  /**
   * Find payment intent by ID
   * @param {string} paymentIntentId - Payment intent ID
   * @returns {Promise<Object|null>} Payment intent or null
   */
  static async findPaymentIntentById(paymentIntentId) {
    const result = await pool.query(
      `SELECT * FROM payment_intents WHERE payment_intent_id = $1`,
      [paymentIntentId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Find payment intent by job ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object|null>} Payment intent or null
   */
  static async findPaymentIntentByJob(jobId) {
    const result = await pool.query(
      `SELECT * FROM payment_intents WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [jobId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Update payment intent status
   * @param {string} paymentIntentId - Payment intent ID
   * @param {string} status - New status
   * @param {Object} metadata - Additional data
   * @returns {Promise<Object|null>} Updated payment intent or null
   */
  static async updatePaymentIntentStatus(paymentIntentId, status, metadata = null) {
    const result = await pool.query(
      `UPDATE payment_intents 
       SET status = $1, 
           metadata = COALESCE($2, metadata),
           paid_at = CASE WHEN $1 = 'succeeded' THEN NOW() ELSE paid_at END,
           failed_at = CASE WHEN $1 = 'failed' THEN NOW() ELSE failed_at END,
           updated_at = NOW()
       WHERE payment_intent_id = $3
       RETURNING *`,
      [status, metadata, paymentIntentId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Create refund
   * @param {Object} refundData - Refund data
   * @returns {Promise<Object>} Created refund
   */
  static async createRefund(refundData) {
    const { jobId, paymentIntentId, amount, reason } = refundData;
    
    const result = await pool.query(
      `INSERT INTO refunds (job_id, payment_intent_id, amount, reason, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [jobId, paymentIntentId, amount, reason]
    );
    
    return result.rows[0];
  }

  /**
   * Update refund status
   * @param {string} refundId - Refund ID
   * @param {string} status - New status
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object|null>} Updated refund or null
   */
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
    
    return result.rows[0] || null;
  }

  /**
   * Get client payment methods
   * @param {string} clientId - Client ID
   * @returns {Promise<Array>} Payment methods
   */
  static async getPaymentMethods(clientId) {
    const result = await pool.query(
      `SELECT * FROM payment_methods 
       WHERE client_id = $1 
       ORDER BY is_default DESC, created_at DESC`,
      [clientId]
    );
    
    return result.rows;
  }

  /**
   * Add payment method
   * @param {string} clientId - Client ID
   * @param {Object} methodData - Payment method data
   * @returns {Promise<Object>} Created payment method
   */
  static async addPaymentMethod(clientId, methodData) {
    const { paymentMethodId, type, last4, expiryMonth, expiryYear, isDefault } = methodData;
    
    const result = await pool.query(
      `INSERT INTO payment_methods 
       (client_id, payment_method_id, type, last4, expiry_month, expiry_year, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [clientId, paymentMethodId, type, last4, expiryMonth, expiryYear, isDefault || false]
    );
    
    return result.rows[0];
  }

  /**
   * Delete payment method
   * @param {string} methodId - Payment method ID
   * @param {string} clientId - Client ID
   * @returns {Promise<Object|null>} Deleted payment method or null
   */
  static async deletePaymentMethod(methodId, clientId) {
    const result = await pool.query(
      `DELETE FROM payment_methods 
       WHERE id = $1 AND client_id = $2
       RETURNING *`,
      [methodId, clientId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Set default payment method
   * @param {string} methodId - Payment method ID
   * @param {string} clientId - Client ID
   * @returns {Promise<Object|null>} Updated payment method or null
   */
  static async setDefaultPaymentMethod(methodId, clientId) {
    // First, remove default from all methods
    await pool.query(
      `UPDATE payment_methods SET is_default = false WHERE client_id = $1`,
      [clientId]
    );
    
    // Set the selected method as default
    const result = await pool.query(
      `UPDATE payment_methods 
       SET is_default = true 
       WHERE id = $1 AND client_id = $2
       RETURNING *`,
      [methodId, clientId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get client payment history
   * @param {string} clientId - Client ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Payment history
   */
  static async getClientPaymentHistory(clientId, filters = {}) {
    const { page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT pi.*, j.category, j.service_type, j.job_status
      FROM payment_intents pi
      JOIN jobs j ON pi.job_id = j.id
      WHERE j.client_id = $1
    `;
    const params = [clientId];
    let paramIndex = 2;
    
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
    `;
    const countResult = await pool.query(countQuery, [clientId]);
    
    return {
      payments: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Get artisan payout history
   * @param {string} artisanId - Artisan ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Payout history
   */
  static async getArtisanPayoutHistory(artisanId, filters = {}) {
    const { page = 1, limit = 10, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT ap.*, j.category, j.service_type
      FROM artisan_payouts ap
      JOIN jobs j ON ap.job_id = j.id
      WHERE j.artisan_id = $1
    `;
    const params = [artisanId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND ap.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND ap.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY ap.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM artisan_payouts ap
      JOIN jobs j ON ap.job_id = j.id
      WHERE j.artisan_id = $1
    `;
    const countResult = await pool.query(countQuery, [artisanId]);
    
    return {
      payouts: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Create artisan payout record
   * @param {string} jobId - Job ID
   * @param {string} artisanId - Artisan ID
   * @param {number} amount - Payout amount
   * @returns {Promise<Object>} Created payout
   */
  static async createPayout(jobId, artisanId, amount) {
    const result = await pool.query(
      `INSERT INTO artisan_payouts (job_id, artisan_id, amount, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [jobId, artisanId, amount]
    );
    
    return result.rows[0];
  }

  /**
   * Update payout status
   * @param {string} payoutId - Payout ID
   * @param {string} status - New status
   * @param {string} transferReference - Transfer reference
   * @returns {Promise<Object|null>} Updated payout or null
   */
  static async updatePayoutStatus(payoutId, status, transferReference = null) {
    const result = await pool.query(
      `UPDATE artisan_payouts 
       SET status = $1,
           transfer_reference = COALESCE($2, transfer_reference),
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
           failed_at = CASE WHEN $1 = 'failed' THEN NOW() ELSE failed_at END
       WHERE id = $3
       RETURNING *`,
      [status, transferReference, payoutId]
    );
    
    return result.rows[0] || null;
  }
}

module.exports = PaymentRepository;