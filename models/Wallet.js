const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');

class Wallet {
  /**
   * Create or get wallet for a user
   * @param {string} userId - User ID
   * @param {string} userType - User type (client/artisan)
   * @returns {Promise<Object>} Wallet object
   */
  static async getOrCreateWallet(userId, userType) {
    // Check if wallet exists
    const result = await pool.query(
      `SELECT * FROM wallets WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Create new wallet
    const walletResult = await pool.query(
      `INSERT INTO wallets (user_id, user_type, balance, pending_balance, currency)
       VALUES ($1, $2, 0, 0, 'NGN')
       RETURNING *`,
      [userId, userType]
    );
    
    return walletResult.rows[0];
  }

  /**
   * Get wallet by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Wallet object
   */
  static async findByUserId(userId) {
    const cacheKey = `wallet:user:${userId}`;
    let wallet = await cacheGet(cacheKey);
    
    if (!wallet) {
      const result = await pool.query(
        `SELECT w.*, u.email, u.phone 
         FROM wallets w
         JOIN users u ON w.user_id = u.id
         WHERE w.user_id = $1`,
        [userId]
      );
      
      wallet = result.rows[0] || null;
      if (wallet) {
        await cacheSet(cacheKey, wallet, 300); // Cache for 5 minutes
      }
    }
    
    return wallet;
  }

  /**
   * Get wallet by ID
   * @param {string} walletId - Wallet ID
   * @returns {Promise<Object|null>} Wallet object
   */
  static async findById(walletId) {
    const result = await pool.query(
      `SELECT * FROM wallets WHERE id = $1`,
      [walletId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Credit wallet
   * @param {string} userId - User ID
   * @param {number} amount - Amount to credit
   * @param {string} transactionType - Type of transaction
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Transaction record
   */
  static async credit(userId, amount, transactionType, metadata = {}) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get wallet with lock
      const walletResult = await client.query(
        `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      
      if (walletResult.rows.length === 0) {
        throw new Error('Wallet not found');
      }
      
      const wallet = walletResult.rows[0];
      const balanceBefore = parseFloat(wallet.balance);
      const balanceAfter = balanceBefore + amount;
      
      // Update wallet balance
      await client.query(
        `UPDATE wallets 
         SET balance = $1, 
             total_deposited = total_deposited + $2,
             total_earned = CASE WHEN $3 = 'earning' THEN total_earned + $2 ELSE total_earned END,
             updated_at = NOW()
         WHERE user_id = $4`,
        [balanceAfter, amount, transactionType, userId]
      );
      
      // Create transaction record
      const reference = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const transactionResult = await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, 
          currency, status, reference, description, metadata, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10, NOW())
         RETURNING *`,
        [wallet.id, userId, transactionType, amount, balanceBefore, balanceAfter, 
         wallet.currency, reference, metadata.description || `${transactionType} of ₦${amount}`, metadata]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`wallet:user:${userId}`);
      
      return transactionResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Debit wallet
   * @param {string} userId - User ID
   * @param {number} amount - Amount to debit
   * @param {string} transactionType - Type of transaction
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Transaction record
   */
  static async debit(userId, amount, transactionType, metadata = {}) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get wallet with lock
      const walletResult = await client.query(
        `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      
      if (walletResult.rows.length === 0) {
        throw new Error('Wallet not found');
      }
      
      const wallet = walletResult.rows[0];
      const balanceBefore = parseFloat(wallet.balance);
      
      if (balanceBefore < amount) {
        throw new Error('Insufficient balance');
      }
      
      const balanceAfter = balanceBefore - amount;
      
      // Update wallet balance
      await client.query(
        `UPDATE wallets 
         SET balance = $1, 
             total_withdrawn = total_withdrawn + $2,
             total_spent = CASE WHEN $3 = 'payment' THEN total_spent + $2 ELSE total_spent END,
             updated_at = NOW()
         WHERE user_id = $4`,
        [balanceAfter, amount, transactionType, userId]
      );
      
      // Create transaction record
      const reference = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const transactionResult = await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, 
          currency, status, reference, description, metadata, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10, NOW())
         RETURNING *`,
        [wallet.id, userId, transactionType, amount, balanceBefore, balanceAfter, 
         wallet.currency, reference, metadata.description || `${transactionType} of ₦${amount}`, metadata]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`wallet:user:${userId}`);
      
      return transactionResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Hold funds (for escrow)
   * @param {string} userId - User ID
   * @param {number} amount - Amount to hold
   * @param {string} reason - Reason for hold
   * @param {string} jobId - Related job ID
   * @returns {Promise<Object>} Hold record
   */
  static async holdFunds(userId, amount, reason, jobId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // First debit the amount
      await this.debit(userId, amount, 'hold', { description: reason, jobId });
      
      // Get wallet
      const wallet = await this.findByUserId(userId);
      
      // Create hold record
      const holdResult = await client.query(
        `INSERT INTO transaction_holds 
         (wallet_id, job_id, amount, reason, release_date, status, created_by)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '3 days', 'active', $5)
         RETURNING *`,
        [wallet.id, jobId, amount, reason, userId]
      );
      
      await client.query('COMMIT');
      
      return holdResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Release held funds
   * @param {string} holdId - Hold ID
   * @returns {Promise<Object>} Released hold record
   */
  static async releaseHold(holdId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const holdResult = await client.query(
        `SELECT * FROM transaction_holds WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [holdId]
      );
      
      if (holdResult.rows.length === 0) {
        throw new Error('Hold not found or already released');
      }
      
      const hold = holdResult.rows[0];
      
      // Update hold status
      await client.query(
        `UPDATE transaction_holds 
         SET status = 'released', released_at = NOW()
         WHERE id = $1`,
        [holdId]
      );
      
      // Return funds to wallet? Or transfer to payee?
      // This depends on business logic
      
      await client.query('COMMIT');
      
      return hold;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get transaction history
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Transaction history
   */
  static async getTransactionHistory(userId, filters = {}) {
    const { type, status, startDate, endDate, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT wt.*, j.category as job_category
      FROM wallet_transactions wt
      LEFT JOIN jobs j ON wt.job_id = j.id
      WHERE wt.user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;
    
    if (type) {
      query += ` AND wt.transaction_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND wt.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND wt.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND wt.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY wt.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM wallet_transactions
      WHERE user_id = $1
      ${type ? `AND transaction_type = '${type}'` : ''}
      ${status ? `AND status = '${status}'` : ''}
    `;
    const countResult = await pool.query(countQuery, [userId]);
    
    return {
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Get wallet balance
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Balance info
   */
  static async getBalance(userId) {
    const wallet = await this.findByUserId(userId);
    
    if (!wallet) {
      return { balance: 0, pending_balance: 0, available_balance: 0 };
    }
    
    return {
      balance: parseFloat(wallet.balance),
      pending_balance: parseFloat(wallet.pending_balance),
      available_balance: parseFloat(wallet.balance) - parseFloat(wallet.pending_balance),
      total_deposited: parseFloat(wallet.total_deposited),
      total_withdrawn: parseFloat(wallet.total_withdrawn),
      total_earned: parseFloat(wallet.total_earned),
      total_spent: parseFloat(wallet.total_spent),
      currency: wallet.currency
    };
  }

  /**
   * Create withdrawal request (artisan only)
   * @param {string} artisanId - Artisan ID
   * @param {number} amount - Amount to withdraw
   * @param {Object} bankDetails - Bank account details
   * @returns {Promise<Object>} Withdrawal request
   */
  static async requestWithdrawal(artisanId, amount, bankDetails) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const wallet = await this.findByUserId(artisanId);
      
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      if (parseFloat(wallet.balance) < amount) {
        throw new Error('Insufficient balance');
      }
      
      // Create withdrawal request
      const reference = `WDR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const withdrawalResult = await client.query(
        `INSERT INTO withdrawal_requests 
         (artisan_id, wallet_id, amount, bank_code, account_number, account_name, bank_name, status, reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
         RETURNING *`,
        [artisanId, wallet.id, amount, bankDetails.bankCode, bankDetails.accountNumber, 
         bankDetails.accountName, bankDetails.bankName, reference]
      );
      
      // Hold the amount in pending balance
      await client.query(
        `UPDATE wallets 
         SET pending_balance = pending_balance + $1
         WHERE user_id = $2`,
        [amount, artisanId]
      );
      
      await client.query('COMMIT');
      
      return withdrawalResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process withdrawal (admin only)
   * @param {string} withdrawalId - Withdrawal request ID
   * @param {string} status - New status (completed/failed)
   * @param {string} adminId - Admin user ID
   * @param {string} failureReason - Reason if failed
   * @returns {Promise<Object>} Updated withdrawal request
   */
  static async processWithdrawal(withdrawalId, status, adminId, failureReason = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const withdrawalResult = await client.query(
        `SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE`,
        [withdrawalId]
      );
      
      if (withdrawalResult.rows.length === 0) {
        throw new Error('Withdrawal request not found');
      }
      
      const withdrawal = withdrawalResult.rows[0];
      
      if (withdrawal.status !== 'pending') {
        throw new Error('Withdrawal already processed');
      }
      
      if (status === 'completed') {
        // Debit the wallet
        await this.debit(withdrawal.artisan_id, withdrawal.amount, 'withdrawal', {
          description: `Withdrawal to bank account ${withdrawal.account_number}`,
          withdrawalId
        });
        
        // Update pending balance
        await client.query(
          `UPDATE wallets 
           SET pending_balance = pending_balance - $1
           WHERE user_id = $2`,
          [withdrawal.amount, withdrawal.artisan_id]
        );
      } else if (status === 'failed') {
        // Release pending balance
        await client.query(
          `UPDATE wallets 
           SET pending_balance = pending_balance - $1
           WHERE user_id = $2`,
          [withdrawal.amount, withdrawal.artisan_id]
        );
      }
      
      // Update withdrawal request
      const result = await client.query(
        `UPDATE withdrawal_requests 
         SET status = $1, 
             failure_reason = $2,
             processed_by = $3,
             processed_at = NOW(),
             completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
         WHERE id = $4
         RETURNING *`,
        [status, failureReason, adminId, withdrawalId]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`wallet:user:${withdrawal.artisan_id}`);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get withdrawal requests for artisan
   * @param {string} artisanId - Artisan ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Withdrawal requests
   */
  static async getWithdrawalRequests(artisanId, filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM withdrawal_requests
      WHERE artisan_id = $1
    `;
    const params = [artisanId];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM withdrawal_requests
      WHERE artisan_id = $1
      ${status ? `AND status = '${status}'` : ''}
    `;
    const countResult = await pool.query(countQuery, [artisanId]);
    
    return {
      withdrawals: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Get wallet statistics for admin
   * @returns {Promise<Object>} Wallet statistics
   */
  static async getStatistics() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_wallets,
        SUM(balance) as total_balance,
        SUM(pending_balance) as total_pending,
        SUM(total_deposited) as total_deposited,
        SUM(total_withdrawn) as total_withdrawn,
        SUM(total_earned) as total_earned,
        SUM(total_spent) as total_spent,
        COUNT(CASE WHEN user_type = 'client' THEN 1 END) as client_wallets,
        COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as artisan_wallets,
        SUM(CASE WHEN user_type = 'client' THEN balance ELSE 0 END) as client_balance,
        SUM(CASE WHEN user_type = 'artisan' THEN balance ELSE 0 END) as artisan_balance
      FROM wallets
      WHERE is_active = true
    `);
    return result.rows[0];
  }
}

module.exports = Wallet;
