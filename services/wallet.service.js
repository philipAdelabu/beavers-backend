const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');
const { v4: uuidv4 } = require('uuid');
const LogService = require('./log.services');
const FeePaymentService = require('./fee.payment.service');
const PayStackService = require('./paystack.service');
const PaymentService = require('./payment.service');
const {PRICING, TIMEOUTS, GEOFENCE } = require('../config/constants');
const SysConfig = require('../config/syst-config');


class WalletService {
  // ==================== Wallet Management ====================
  
  /**
   * Get or create wallet for artisan
   * @param {string} artisanId - Artisan ID
   * @returns {Promise<Object>} Wallet object
   */
  static async getOrCreateWallet(userId, userType) {
    // Check cache first
    const cacheKey = `wallet:user:${userId}`;
    
    // Check database
    const result = await pool.query(
      `SELECT * FROM wallets WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return  result.rows[0];
    }
    
    // Create new wallet
    const newWallet = await pool.query(
      `INSERT INTO wallets (user_id, user_type, balance, pending_balance, currency)
       VALUES ($1, $2, 0, 0, 'NGN')
       RETURNING *`,
      [userId, userType]
    );
    
    return newWallet.rows[0];
  }
  
  /**
   * Get wallet balance
   * @param {string} artisanId - Artisan ID
   * @returns {Promise<Object>} Balance info
   */
  static async getWalletBalance(userId) {
    const wallet = await this.getOrCreateWallet(userId);
    
    return {
      balance: Number(wallet.balance),
      pendingBalance: Number(wallet.pending_balance),
      availableBalance: Number(wallet.balance) - Number(wallet.pending_balance),
      totalEarned: Number(wallet.total_earned),
      totalWithdrawn: Number(wallet.total_withdrawn),
      totalFeesPaid: Number(wallet.total_fees_paid),
      currency: wallet.currency
    };
  }
  
  /**
   * Credit wallet (earnings, bonus, etc.)
   * @param {string} artisanId - Artisan ID
   * @param {number} amount - Amount to credit
   * @param {string} transactionType - Type of transaction
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Transaction record
   */
  static async creditWallet(userId, amount, transactionType, metadata = {}, userType = 'artisan', req = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get wallet with lock
      const walletResult = await client.query(
        `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      
      let wallet;
      if (walletResult.rows.length === 0) {
         const usrT = await this.getUserType(userId);
        // Create wallet if doesn't exist
        const newWallet = await client.query(
          `INSERT INTO wallets (user_id, user_type, balance, pending_balance, currency)
           VALUES ($1, $2, 0, 0, 'NGN')
           RETURNING *`,
          [userId, usrT]
        );
        wallet = newWallet.rows[0];
      } else {
        wallet = walletResult.rows[0];
      }
      
      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + Number(amount);
      
      // Update wallet balance
      await client.query(
        `UPDATE wallets 
         SET balance = $1, 
             total_earned = CASE WHEN $4 <> 'deposit' AND $5 <> 'client' THEN total_earned + $2 ELSE total_earned END,
             total_deposited = CASE WHEN $4 = 'deposit' THEN total_deposited + $2 ELSE total_deposited END,
             updated_at = NOW()
         WHERE id = $3`,
        [balanceAfter, amount, wallet.id, transactionType, userType]
      );
      
      // Create transaction record
      const reference = `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const transactionResult = await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, 
          currency, status, reference, description, metadata, completed_at, job_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10, NOW(), $11)
         RETURNING *`,
        [
          wallet.id, 
          userId, 
          transactionType, 
          amount, 
          balanceBefore, 
          balanceAfter,
          wallet.currency, 
          reference, 
          metadata.description || `${transactionType} of ₦${amount}`,
          metadata,
          metadata.jobId || null
        ]
      );

       //  const { entityType, entityId, action, userId, newData, metaData} = logData; 
      // static async logActivity(logData, req) 
      const logData = {
        entityType: 'wallet',
        entityId: wallet.id,
        action: 'wallet credited',
        userId,
        newData: { amount, userType, balanceBefore, balanceAfter },
        metadata,
      };
      await LogService.logActivity(logData, req);
    
      
     
        await client.query('COMMIT');
      // Invalidate cache
      await cacheDel(`wallet:user:${userId}`);
      await cacheDel(`wallet:balance:${userId}`);

       
     
      const title = 'Payment Recieved';
      const body = `₦${amount} has been sent to your account.`;
      const data = { type: 'payment_credited', amount }; 
      const options = {
        sms: false,
        email: false,
        push: true,
      };    
      await NotificationService.sendNotification(userId, title, body, data, options);

      logger.info(`Wallet credited: ${userId} - ₦${amount} (${transactionType})`);
     
      
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
   * @param {string} artisanId - Artisan ID
   * @param {number} amount - Amount to debit
   * @param {string} transactionType - Type of transaction
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Transaction record
   */
  static async debitWallet(userId, amount, transactionType, metadata = {}, req = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get wallet with lock
      const walletResult = await client.query(
        `SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [userId]
      );
      
      if (walletResult.rows.length === 0) {
        throw new AppError(404, 'Wallet not found');
      }
      
      const wallet = walletResult.rows[0];
      const balanceBefore = Number(wallet.balance);
      
      if (balanceBefore < amount) {
        throw new AppError(400, 'Insufficient balance');
      }
      
      const balanceAfter = balanceBefore - amount;
      
      // Update wallet balance
      await client.query(
        `UPDATE wallets 
         SET balance = $1,
             total_withdrawn = total_withdrawn + $2,
             updated_at = NOW()
         WHERE id = $3`,
        [balanceAfter, amount, wallet.id]
      );
      
      // Create transaction record
      const reference = `WALLET-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const transactionResult = await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, 
          currency, status, reference, description, metadata, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10, NOW())
         RETURNING *`,
        [
          wallet.id, 
          userId, 
          transactionType, 
          amount, 
          balanceBefore, 
          balanceAfter,
          wallet.currency, 
          reference, 
          metadata.description || `${transactionType} of ₦${amount}`,
          metadata
        ]
      );
        const userType = this.getUserType(userId);
            //  const { entityType, entityId, action, userId, newData, metaData} = logData; 
      // static async logActivity(logData, req)
      if(userType !== 'admin'){ 
        const logData = {
          entityType: 'wallet',
          entityId: wallet.id,
          action: 'wallet debited',
          userId,
          newData: { amount, userType, balanceBefore, balanceAfter },
          metadata,
        };
        await LogService.logActivity(logData, req);
      }
    
      
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`wallet:user:${userId}`);
      await cacheDel(`wallet:balance:${userId}`);
      
      logger.info(`Wallet debited: ${userId} - ₦${amount} (${transactionType})`);
      
      return transactionResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Hold funds in wallet (for escrow)
   * @param {string} artisanId - Artisan ID
   * @param {number} amount - Amount to hold
   * @param {string} reason - Reason for hold
   * @param {string} jobId - Related job ID
   * @returns {Promise<Object>} Hold record
   */
  static async holdFunds(userId, amount, reason, jobId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const wallet = await this.getOrCreateWallet(userId);
      
      // Check if enough balance
      const balance = Number(wallet.balance);
      const pendingBalance = Number(wallet.pending_balance);
      const availableBalance = balance - pendingBalance;
      
      if (availableBalance < amount) {
        throw new AppError(400, 'Insufficient available balance');
      }
      
      // Update pending balance
      await client.query(
        `UPDATE wallets 
         SET pending_balance = pending_balance + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [amount, wallet.id]
      );
      
      // Create hold record
      const holdResult = await client.query(
        `INSERT INTO wallet_holds 
         (wallet_id, job_id, amount, reason, release_date, status, created_by)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '3 days', 'active', $5)
         RETURNING *`,
        [wallet.id, jobId, amount, reason, userId]
      );
      
      // Create transaction record for hold
      const reference = `HOLD-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, 
          currency, status, reference, description, metadata, job_id)
         VALUES ($1, $2, 'hold', $3, $4, $5, $6, 'pending', $7, $8, $9, $10)`,
        [
          wallet.id,
          userId,
          amount,
          balance,
          balance,
          wallet.currency,
          reference,
          `Hold of ₦${amount} for ${reason}`,
          { holdId: holdResult.rows[0].id, reason, jobId },
          jobId
        ]
      );
      
      await client.query('COMMIT');
      
      await cacheDel(`wallet:user:${userId}`);
      await cacheDel(`wallet:balance:${userId}`);
      
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
   * @param {string} artisanId - Artisan ID
   * @param {boolean} releaseToWallet - Whether to release to wallet balance
   * @returns {Promise<Object>} Released hold record
   */
  static async releaseHold(holdId, userId, releaseToWallet = true) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const holdResult = await client.query(
        `SELECT * FROM wallet_holds WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [holdId]
      );
      
      if (holdResult.rows.length === 0) {
        throw new AppError(404, 'Hold not found or already released');
      }
      
      const hold = holdResult.rows[0];
      
      // Verify ownership
      const walletResult = await client.query(
        `SELECT id FROM wallets WHERE user_id = $1`,
        [userId]
      );
      
      if (walletResult.rows.length === 0 || walletResult.rows[0].id !== hold.wallet_id) {
        throw new AppError(403, 'Not authorized to release this hold');
      }
      
      // Update hold status
      await client.query(
        `UPDATE wallet_holds 
         SET status = 'released', released_at = NOW()
         WHERE id = $1`,
        [holdId]
      );
      
      // Update pending balance
      await client.query(
        `UPDATE wallets 
         SET pending_balance = pending_balance - $1,
             updated_at = NOW()
         WHERE id = $2`,
        [hold.amount, hold.wallet_id]
      );
      
      // If release to wallet, add to balance
      if (releaseToWallet) {
        await client.query(
          `UPDATE wallets 
           SET balance = balance + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [hold.amount, hold.wallet_id]
        );
      }
      
      // Update transaction status
      await client.query(
        `UPDATE wallet_transactions 
         SET status = 'completed', 
             balance_after = $1,
             completed_at = NOW()
         WHERE metadata->>'holdId' = $2`,
        [hold.amount, holdId]
      );
      
      await client.query('COMMIT');
      
      await cacheDel(`wallet:user:${userId}`);
      await cacheDel(`wallet:balance:${userId}`);
      
      return hold;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ==================== Withdrawals ====================
  
  /**
   * Request withdrawal
   * @param {string} artisanId - Artisan ID
   * @param {number} amount - Amount to withdraw
   * @param {Object} bankDetails - Bank account details
   * @returns {Promise<Object>} Withdrawal request
   */
  static async requestWithdrawal(userId, amount, bankDetails) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get wallet
      const wallet = await this.getOrCreateWallet(userId);
      
      
      const balance = Number(wallet.balance);
      const pendingBalance = Number(wallet.pending_balance);
      const availableBalance = balance - pendingBalance;
      
      if (availableBalance < amount) {
        throw new AppError(400, 'Insufficient available balance');
      }
      
      // Check minimum withdrawal amount
      /*
      const minWithdrawal = 5000; // ₦5,000 minimum
      if (amount < minWithdrawal) {
        throw new AppError(400, `Minimum withdrawal amount is ₦${minWithdrawal}`);
      } */
      
      // Generate reference
      const reference = `WDR-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
      
      // Create withdrawal request
      const withdrawalResult = await client.query(
        `INSERT INTO withdrawal_requests 
         (artisan_id, wallet_id, amount, bank_code, account_number, account_name, bank_name, status, reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
         RETURNING *`,
        [
          userId, 
          wallet.id, 
          amount, 
          bankDetails.bankCode, 
          bankDetails.accountNumber, 
          bankDetails.accountName, 
          bankDetails.bankName,
          reference
        ]
      );
      
      // Hold the amount in pending balance
      await client.query(
        `UPDATE wallets 
         SET pending_balance = pending_balance + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [amount, wallet.id]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`wallet:user:${userId}`);
      await cacheDel(`wallet:balance:${userId}`);
      
      logger.info(`Withdrawal requested: ${userId} - ₦${amount}`);
      
   
      
      return withdrawalResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Process withdrawal (Admin only)
   * @param {string} withdrawalId - Withdrawal ID
   * @param {string} adminId - Admin ID
   * @param {string} action - 'approve' or 'reject'
   * @param {string} notes - Admin notes
   * @returns {Promise<Object>} Updated withdrawal
   */
  static async processWithdrawal(withdrawalId, adminId, action, notes = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const withdrawalResult = await client.query(
        `SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE`,
        [withdrawalId]
      );
      
      if (withdrawalResult.rows.length === 0) {
        throw new AppError(404, 'Withdrawal request not found');
      }
      
      const withdrawal = withdrawalResult.rows[0];
      
      if (withdrawal.status !== 'pending') {
        throw new AppError(400, 'Withdrawal already processed');
      }
      
      let newStatus;
      if (action === 'approve') {
        newStatus = 'processing';
      } else if (action === 'reject') {
        newStatus = 'failed';
      } else {
        throw new AppError(400, 'Invalid action. Use "approve" or "reject"');
      }
      
      // Update withdrawal request
      const result = await client.query(
        `UPDATE withdrawal_requests 
         SET status = $1,
             admin_notes = $2,
             processed_by = $3,
             processed_at = NOW(),
             failed_at = CASE WHEN $1 = 'failed' THEN NOW() ELSE failed_at END
         WHERE id = $4
         RETURNING *`,
        [newStatus, notes, adminId, withdrawalId]
      );
      
      // If rejected, release the held amount
      if (action === 'reject') {
        await client.query(
          `UPDATE wallets 
           SET pending_balance = pending_balance - $1,
               updated_at = NOW()
           WHERE id = $2`,
          [withdrawal.amount, withdrawal.wallet_id]
        );
        
        // Create transaction for failed withdrawal
        await client.query(
          `INSERT INTO wallet_transactions 
           (wallet_id, user_id, transaction_type, amount, balance_before, balance_after, 
            currency, status, reference, description, metadata, completed_at)
           SELECT 
             $1, $2, 'withdrawal', $3, balance, balance - $3,
             currency, 'failed', $4, $5, $6, NOW()
           FROM wallets WHERE id = $1`,
          [
            withdrawal.wallet_id,
            withdrawal.artisan_id,
            withdrawal.amount,
            `WDR-FAILED-${Date.now()}`,
            `Failed withdrawal: ${notes || 'Rejected by admin'}`,
            { withdrawalId, reason: notes }
          ]
        );
      }
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`wallet:user:${withdrawal.artisan_id}`);
      await cacheDel(`wallet:balance:${withdrawal.artisan_id}`);
      
      logger.info(`Withdrawal ${action}d: ${withdrawalId}`);
      
      // Send notification
      const artisanEmail = await this.getArtisanEmail(withdrawal.artisan_id);
      const subject = action === 'approve' 
        ? 'Withdrawal Approved - Processing' 
        : 'Withdrawal Request Rejected';
      
      const message = action === 'approve'
        ? `Your withdrawal of ₦${withdrawal.amount.toLocaleString()} has been approved and is being processed.`
        : `Your withdrawal of ₦${withdrawal.amount.toLocaleString()} has been rejected. Reason: ${notes || 'Please contact support.'}`;
      
      await NotificationService.sendEmail(artisanEmail, subject, message);
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Complete withdrawal (Admin only)
   * @param {string} withdrawalId - Withdrawal ID
   * @param {string} adminId - Admin ID
   * @param {string} transactionId - Bank transaction ID
   * @returns {Promise<Object>} Completed withdrawal
   */
  static async completeWithdrawal(withdrawalId, adminId, transactionId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const withdrawalResult = await client.query(
        `SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'processing' FOR UPDATE`,
        [withdrawalId]
      );
      
      if (withdrawalResult.rows.length === 0) {
        throw new AppError(404, 'Withdrawal not found or not in processing state');
      }
      
      const withdrawal = withdrawalResult.rows[0];
      
      // Update withdrawal
      const result = await client.query(
        `UPDATE withdrawal_requests 
         SET status = 'completed',
             transaction_id = $1,
             processed_by = $2,
             completed_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [transactionId, adminId, withdrawalId]
      );
      
      // Update wallet - remove from pending balance
      await client.query(
        `UPDATE wallets 
         SET pending_balance = pending_balance - $1,
             total_withdrawn = total_withdrawn + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [withdrawal.amount, withdrawal.wallet_id]
      );
      
      // Update transaction status
      await client.query(
        `UPDATE wallet_transactions 
         SET status = 'completed',
             completed_at = NOW(),
             transaction_id = $1
         WHERE reference = $2`,
        [transactionId, withdrawal.reference]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`wallet:user:${withdrawal.artisan_id}`);
      await cacheDel(`wallet:balance:${withdrawal.artisan_id}`);
      
      logger.info(`Withdrawal completed: ${withdrawalId}`);
      
      // Send notification
      const artisanEmail = await this.getArtisanEmail(withdrawal.artisan_id);
      await NotificationService.sendEmail(
        artisanEmail,
        'Withdrawal Completed',
        `<h2>Withdrawal Completed</h2>
         <p>Your withdrawal of <strong>₦${withdrawal.amount.toLocaleString()}</strong> has been completed.</p>
         <p>Transaction Reference: ${transactionId}</p>
         <p>Thank you for using BeaverWorks!</p>`
      );
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get withdrawal history
   * @param {string} artisanId - Artisan ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Withdrawal history
   */
  static async getWithdrawalHistory(userId, filters = {}) {
    const { status, page = 1, limit = 20, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM withdrawal_requests
      WHERE artisan_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
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
    const countParams = [artisanId];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      withdrawals: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  // ==================== Transaction History ====================
  
  /**
   * Get transaction history
   * @param {string} artisanId - Artisan ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Transaction history
   */
  static async getTransactionHistory(userId, filters = {}) {
    const { type, status, page = 1, limit = 20, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT wt.*, 
             j.category as job_category,
             j.service_type,
             j.id as job_id,
             j.job_status
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
      WHERE artisan_id = $1
      ${type ? `AND transaction_type = '${type}'` : ''}
      ${status ? `AND status = '${status}'` : ''}
    `;
    const countParams = [userId];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  // ==================== Settlement / Payout ====================
  
  /**
   * Create settlement payout from escrow to wallet
   * @param {string} jobId - Job ID
   * @param {string} artisanId - Artisan ID
   * @param {number} amount - Amount to settle
   * @returns {Promise<Object>} Transaction record
   */
  static async settleJobPayout(jobId, artisanId, amount) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Credit wallet
      const transaction = await this.creditWallet(
        artisanId,
        amount,
        'earnings',
        {
          jobId,
          description: `Earnings from job #${jobId.slice(0, 8)}`,
          source: 'job_completion'
        }, 'artisan'
      );
      
     
       // Mark payout as settled
      await client.query(
        `UPDATE artisan_payouts
         SET status = 'settled', 
             completed_at = NOW(),
             settled_amount = $1
         WHERE job_id = $2`,
        [amount, jobId]
      ); 
      
      await client.query('COMMIT');
      
      logger.info(`Settlement processed for job ${jobId}: ₦${amount} to artisan ${artisanId}`);
      
      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get all pending settlements (Admin)
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Pending settlements
   */
  static async getPendingSettlements(filters = {}) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    const result = await pool.query(`
      SELECT et.job_id, et.artisan_id, et.amount,
             j.category, j.service_type,
             ap.full_legal_name as artisan_name,
             cp.full_legal_name as client_name,
             et.created_at,
             et.dispute_buffer_until
      FROM escrow_transactions et
      JOIN jobs j ON et.job_id = j.id
      JOIN artisan_profiles ap ON et.artisan_id = ap.user_id
      JOIN client_profiles cp ON j.client_id = cp.user_id
      WHERE et.status = 'released' 
        AND et.transaction_type IN ('workmanship', 'execution_fee')
        AND et.settled = false
        AND et.dispute_buffer_until < NOW()
      ORDER BY et.created_at ASC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM escrow_transactions
      WHERE status = 'released' 
        AND transaction_type IN ('workmanship', 'execution_fee')
        AND settled = false
        AND dispute_buffer_until < NOW()
    `);
    
    return {
      settlements: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  /**
   * Process batch settlements (Admin)
   * @param {Array} jobIds - Array of job IDs to settle
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Batch settlement result
   */
  static async processBatchSettlements(jobIds, adminId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const results = [];
      let totalAmount = 0;
      
      for (const jobId of jobIds) {
        try {
          const jobResult = await client.query(`
            SELECT artisan_id, 
                   (SELECT SUM(amount) FROM escrow_transactions 
                    WHERE job_id = $1 AND transaction_type IN ('workmanship', 'execution_fee') 
                    AND status = 'released' AND settled = false) as amount
            FROM jobs WHERE id = $1
          `, [jobId]);
          
          if (jobResult.rows.length > 0 && jobResult.rows[0].amount > 0) {
            const { artisan_id, amount } = jobResult.rows[0];
            
            // Settle payout
            await this.settleJobPayout(jobId, artisan_id, Number(amount));
            
            totalAmount += Number(amount);
            results.push({ jobId, artisan_id, amount: Number(amount), status: 'success' });
          }
        } catch (error) {
          results.push({ jobId, status: 'failed', error: error.message });
        }
      }
      
      // Create settlement batch record
      const batchReference = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
      await client.query(
        `INSERT INTO settlement_batches 
         (batch_reference, total_amount, transaction_count, status, initiated_by, processed_at)
         VALUES ($1, $2, $3, 'completed', $4, NOW())`,
        [batchReference, totalAmount, results.length, adminId]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Batch settlement completed: ${results.length} jobs, ₦${totalAmount}`);
      
      return {
        batchReference,
        totalAmount,
        processed: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'failed').length,
        results
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ==================== Helper Methods ====================
  
  /**
   * Get artisan email
   */
  static async getArtisanEmail(artisanId) {
    const result = await pool.query(
      `SELECT email FROM users WHERE id = $1`,
      [artisanId]
    );
    return result.rows[0]?.email;
  }
  
  /**
   * Get wallet statistics (Admin)
   */
  static async getWalletStatistics() {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_wallets,
        SUM(balance) as total_balance,
        SUM(pending_balance) as total_pending,
        AVG(balance) as average_balance,
        SUM(total_earned) as total_earned,
        SUM(total_withdrawn) as total_withdrawn,
        SUM(total_fees_paid) as total_fees_paid,
        COUNT(CASE WHEN balance > 0 THEN 1 END) as active_wallets
      FROM wallets
      WHERE is_active = true
    `);
    
    const recentTransactions = await pool.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount
      FROM wallet_transactions
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date DESC
    `);
    
    return {
      summary: stats.rows[0],
      recentTransactions: recentTransactions.rows
    };
  }
 /*
      return {
            authorizationUrl: metadata.authorization_url,
            reference,
            user_id: userId,
            payment_intent_id: metadata.reference,
            access_code: metadata.access_code,
            amount: totalAmount,
            currency: 'NGN',
            metadata,
          };
 */

  static async initializeWalletFunding(amount, userId, email){
     
      try{
        
      const initPay = await PayStackService.initializePayment(userId, amount, email);
     
      const client_secret = `${initPay.reference}_${userId}`;
      
       await pool.query(
        `INSERT INTO funding_payment_intents (payment_reference, user_id, payment_intent_id, 
        client_secret,  amount, currency, status, metadata, fee_type, payment_method_type, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, 'online_payment', NOW())`,
        [initPay.reference, userId, initPay.metadata.reference,
         client_secret, amount, 'NGN', initPay.metadata, 'funding'],
      );
             
        logger.info(`Payment initialized for user ${userId}: ₦${amount}, Reference: ${initPay.reference}`);
      return initPay;

    }catch(error){
      throw error;
    }
      
   }

   static async getUserEmail(userId){
        const user = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
        return user.rows[0].email;
   }

 

   static async fundWallet(userId, amount, req){

     try{
    const userType = await this.getUserType(userId);
    if(!userType) return null;
    const metadata = {gateway: 'paystack', amount };
    const result = await this.creditWallet(userId, amount, 'deposit', metadata, userType, req );
    return result; 
     }catch(error){
       throw error;
     }   
   }

   static async getBankList(){
       const banks = await PayStackService.getBankList();
       return banks;
   }

   static async verifyBankAccount(accountNumber, bankCode){
     const result = await PayStackService.verifyBankAccount(accountNumber, bankCode);
     return result;
   }

   static async bankTransferrecipient(accountNumber, bankCode, name){
     const result = await PayStackService.bankTransferrecipient(accountNumber, bankCode, name);
     console.log(result);
     return result;
   }



   static async getUserType(userId){
       const user = await pool.query(
        ` SELECT user_type FROM users WHERE id = $1`, [userId]
       )
      const userType = user.rows[0].user_type;
       return userType;
   }

     /**
   * Get transaction history
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Transaction history
   */
  static async getWalletHistory(userId, filters = {}) {
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

    static async getFundingIntents(userId, status = null){   

     try{
       let query = `
       SELECT id, user_id, fee_type, amount, currency, status, payment_reference, 
       payment_intent_id, client_secret, metadata, gateway, payment_method_type, payment_method_id, gateway_transaction_id, gateway_reference, paid_at, failed_at, failure_reason, expires_at, refunded_at, created_at, updated_at 
       FROM funding_payment_intents WHERE user_id = $1 `;
       const params = [userId];
       let paramIndex = 2;

       if(status){
        query += ` AND status = $${paramIndex}`;
        params.push(status);
       }
      
       const payInts = await pool.query(query, params);
       return payInts.rows;

     }catch(error){
       throw error;
     }
  }

     static async getFundingStatus(paymentIntentId){   

     try{
       let query = `
       SELECT id, user_id, fee_type, amount, currency, status, payment_reference, 
       payment_intent_id, client_secret, metadata, gateway, payment_method_type, payment_method_id, gateway_transaction_id, gateway_reference, paid_at, failed_at, failure_reason, expires_at, refunded_at, created_at, updated_at 
       FROM funding_payment_intents WHERE payment_intent_id = $1 `;

       const params = [paymentIntentId];
   
       const payInts = await pool.query(query, params);
       return payInts.rows;

     }catch(error){
       throw error;
     }
  }

  static async verifyFunding(reference, userId, req) {
    const client = await pool.connect();
     try{
         await client.query('BEGIN');
           // Check if already processed
            const existingPayment = await client.query(
              `SELECT * FROM funding_payment_intents WHERE payment_intent_id = $1 AND user_id = $2`,
              [reference, userId]
            );
            
            if (existingPayment.rows.length === 0) {
              throw new AppError(404, 'Payment record not found');
            }
            
            const payment = existingPayment.rows[0];
  
            if (payment.status === 'succeeded') {
              return {
                status: 'already_verified',
                amount: payment.amount,
                message: 'Payment already verified'
              };
            } 
       
      const verify = await PayStackService.verifyPayment(reference, userId);
      
       if(verify.status === 'succeeded'){
         const wallet = await this.fundWallet(userId, payment.amount, req);
         await client.query(
          `UPDATE funding_payment_intents 
            SET status = 'succeeded' WHERE user_id = $1 AND payment_intent_id = $2
          `, [userId, reference]
         );
         
       }
   
       await client.query('COMMIT');
      return verify;

     }catch(error){
      await client.query('ROLLBACK');
       throw error;
     }finally{
       client.release();
     }
    }


     static async userRequestWithdrawal(userId, amount, bankDetails, reference) {

    const client = await pool.connect();
    
    try {
    
      // Get wallet
      const wallet = await this.getOrCreateWallet(userId);
        
      const balance = Number(wallet.balance);
      const pendingBalance = Number(wallet.pending_balance);
      const availableBalance = balance - pendingBalance;
      
      if (availableBalance < amount) {
        throw new AppError(400, 'Insufficient available balance');
      }
       
      // Create withdrawal request
      const withdrawalResult = await client.query(
        `INSERT INTO withdrawal_requests 
         (artisan_id, wallet_id, amount, bank_code, account_number, account_name, bank_name, status, reference)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
         RETURNING *`,
        [
          userId, 
          wallet.id, 
          amount, 
          bankDetails.bankCode, 
          bankDetails.accountNumber, 
          bankDetails.accountName, 
          bankDetails.bankName,
          reference
        ]
      );
      
      // Hold the amount in pending balance
      await client.query(
        `UPDATE wallets 
         SET pending_balance = pending_balance + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [amount, wallet.id]
      );
      
      // Invalidate cache
      await cacheDel(`wallet:user:${userId}`);
      await cacheDel(`wallet:balance:${userId}`);
      
      logger.info(`Withdrawal requested: ${userId} - ₦${amount}`);
      
      return withdrawalResult.rows[0];
    } catch (error) {
      throw error;
    } 
  }


      static async userCompleteWithdrawal(withdrawalId, userId, referenceId) {
        const client = await pool.connect();
        try {
       
          
          const withdrawalResult = await client.query(
            `SELECT * FROM withdrawal_requests WHERE reference = $1 AND (status = 'processing' OR status = 'pending') FOR UPDATE`,
            [referenceId]
          );
          
          if (withdrawalResult.rows.length === 0) {
            return;
          }
          
          const withdrawal = withdrawalResult.rows[0];
          
          // Update withdrawal
          const result = await client.query(
            `UPDATE withdrawal_requests 
            SET status = 'completed',
                processed_by = $1,
                completed_at = NOW()
            WHERE id = $2
            RETURNING *`,
            [userId, withdrawalId]
          );
          
          // Update wallet - remove from pending balance
          await client.query(
            `UPDATE wallets 
            SET pending_balance = pending_balance - $1,
                total_withdrawn = total_withdrawn + $1,
                updated_at = NOW()
            WHERE id = $2`,
            [withdrawal.amount, withdrawal.wallet_id]
          );
       
          logger.info(`Withdrawal completed: ${withdrawalId}`);
    
          return result.rows[0];
        } catch (error) {
      
          return;
        } 
      }

      static async reversePendingDebit(amount, userId,  req){
             const client = await pool.connect();
             try{
                    const resp = await client.query( `UPDATE wallets SET 
                    balance = CASE WHEN pending_balance >= $1 THEN balance + $1 END,
                    pending_balance = CASE WHEN pending_balance >= $1 THEN pending_balance - $1 END, 
                    total_withdrawn = CASE WHEN total_withdrawn >= $1 THEN total_withdrawn - $1 END
                    WHERE user_id = $2 RETURNING *`, 
                     [amount, userId]);

                    return resp.rows[0];
             }catch(error){
               throw error;
             } 
       } 

       static async getPendingUserWithdrawalRequestAll(userId){
            const result = await pool.query(`SELECT * FROM withdrawal_requests 
              WHERE status = 'pending' AND artisan_id = $1`, [userId]); 
              return result.rows;
       }

         static async getPendingUserWithdrawalRequestByAmount(userId, amount){
            const result = await pool.query(`SELECT * FROM withdrawal_requests 
              WHERE status = 'pending' AND artisan_id = $1 AND amount = $2`, [userId, amount]); 
              return result.rows[0];
       }

          static async getPendingUserWithdrawalRequestByRecipientCode(userId, amount, recipientCode){
            const result = await pool.query(`SELECT * FROM withdrawal_requests 
              WHERE status = 'pending' AND artisan_id = $1 AND amount = $2`, [userId, amount]); 
              
              if(result.rows.length === 0)
                  return 0;
                const length = result.rows.length;
                for(let i = 0; i < length; i++){
                    const dt = result.rows[i];
                    const reference = dt.reference;
                    const ref = (reference.split('|'))[0];
                    if((reference.split('|'))[1] === recipientCode)
                       return { 
                              amount : dt.amount, 
                              reference: ref, 
                              recipient_code: (reference.split('|'))[1],
                              id: dt.id 
                            };
                  }
              return 0;
       }
  

     // bankCode, accountNumber, bankName, accountName, userId, amount, {ipAddress, userAgent}
    static async initiateTransfer(bankCode, accountNumber, bankName, accountName, userId, amount, req){
            const client = await pool.connect();
            try{

              await client.query('BEGIN'); 
              const wallet = await this.getOrCreateWallet(userId);
             
             if(Number(amount) > (Number(wallet.balance) - Number(wallet.pending_balance))) 
                throw new AppError(403, 'Insufficient available balance');

            const recipient  = await PayStackService.bankTransferrecipient(accountNumber, bankCode, accountName);
            let recipient_code = recipient.data.recipient_code;

            let withdrawalRequest = await this.getPendingUserWithdrawalRequestByRecipientCode(userId, amount, recipient_code);
        
               // Generate reference
            let reference;
            let reference_code;
            const bankDetails =  { bankCode, accountNumber, accountName, bankName};
           
             if(!withdrawalRequest ||( withdrawalRequest && parseInt(withdrawalRequest.amount) !== parseInt(amount))){
              reference = `wdr_${uuidv4()}`;
              reference_code = `${reference}|${recipient_code}`;
              bankDetails.reference = reference;
              bankDetails.recipient_code = recipient_code;
               withdrawalRequest = await this.userRequestWithdrawal(userId, amount, bankDetails, reference_code) 
               const result = await this.debitWallet(userId, amount, 'withdrawal', bankDetails, req);
               const response =  await PayStackService.initiateTransfer(amount, recipient_code, reference);
               reference = response.reference;
            }else{
               reference = withdrawalRequest.reference;
               recipient_code = withdrawalRequest.recipient_code;
            }

             const verifyTransfer = await PayStackService.verifyTransfer(reference);
             console.log('verify:', verifyTransfer);
             const status = verifyTransfer.status;
             if(verifyTransfer.status === 'success'){
                 const reqRes = await this.userCompleteWithdrawal(withdrawalRequest.id, userId, reference_code);
             }else{
                await client.query(
                     `UPDATE withdrawal_requests SET status = $1 WHERE reference = $2`, 
                     [status, reference_code]);
              }
              if(status !== 'success' || status !== 'pending' || status !== 'received'){
                 await this.creditWallet(userId, amount, 'refund', verifyTransfer, 'artisan', req) 
              }

             await client.query('COMMIT');
             return {
                    status,
                    amount, 
                    bankDetails,
                    reference
               }

            }catch(error){
              await client.query('ROLLBACK');
               throw error;
            }finally{
              client.release();
            }

         }

    static async cashoutFund(userId, amount, req){

     try{
      const userType = await this.getUserType(userId);
      if(!userType) return null;

      const metadata = {gateway: 'paystack', amount };
      const result = await this.debitWallet(userId, amount, 'withdrawal', metadata, req );
      return result; 
      }catch(error){
        throw error;
      }   
   }

    static async payCompletedJob(jobId, amount, clientId, email, req) {
       const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      // Get job billing details
      const billingResult = await client.query(
        `SELECT jb.*, j.client_id, j.artisan_id, j.category, j.description, j.billing_mode
         FROM job_billing jb
         JOIN jobs j ON jb.job_id = j.id
         WHERE jb.job_id = $1`,
        [jobId]
      ); 
      
      if (billingResult.rows.length === 0) {
        throw new AppError(404, 'Job billing not found');
      }
      
      const billing = billingResult.rows[0];
  
     
      if(billing.billing_status === 'paid' || billing.billing_status === 'settled')
          throw new AppError(400, 'Billing already paid to escrow');

      const totalAmount = Number(billing.total_amount);

      if(Number(amount) !== totalAmount){
        throw new AppError(400, `Invalid payment amount. Amount required is: ${totalAmount}`);
      }
    
      if (!totalAmount || totalAmount <= 0) {
        throw new AppError(400, 'Invalid payment amount');
      }

    
  
      const result = this.debitWallet(clientId, amount, 'payment', billing, req) 
      await PaymentService.processEscrow(jobId, clientId, amount);

        // Send notifications
        if(process.env.NODE_ENV === 'production'){
         await PaymentService.sendPaymentSuccessNotifications(jobId, clientId, amount);
        }else{
        logger.info(`Payment made successfully for job ${jobId}: ₦${amount}`);
        }

        await client.query('COMMIT');
        return {
          status: 'succeeded',
          amount: amount,
        };

    }catch(error){
      await client.query('ROLLBACK');
       throw error;
    }finally{
      client.release();
    }
  }
  


       
   }



module.exports = WalletService;