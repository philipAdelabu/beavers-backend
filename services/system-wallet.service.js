const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const { v4: uuidv4 } = require('uuid');

class SystemWalletService {
  // ==================== Wallet Management ==================== 
  
  /**
   * Get wallet by type
   */
  static async getWalletByType(walletType) {
    const cacheKey = `system:wallet:${walletType}`;
    let wallet = await cacheGet(cacheKey);
    
    if (!wallet) {
      const result = await pool.query(
        `SELECT * FROM system_wallets WHERE wallet_type = $1 AND is_active = true`,
        [walletType]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, `Wallet type ${walletType} not found`);
      }
      
      wallet = result.rows[0];
      await cacheSet(cacheKey, wallet, 300);
    }
    
    return wallet;
  }
  
  /**
   * Get all system wallets
   */
  static async getAllWallets() {
    const result = await pool.query(
      `SELECT * FROM system_wallets WHERE is_active = true ORDER BY wallet_type`
    );
    return result.rows;
  }
  
  /**
   * Get wallet balance
   */
  static async getWalletBalance(walletType) {
    const wallet = await this.getWalletByType(walletType);
    return {
      balance: parseFloat(wallet.balance),
      pendingBalance: parseFloat(wallet.pending_balance),
      totalCredited: parseFloat(wallet.total_credited),
      totalDebited: parseFloat(wallet.total_debited),
      currency: wallet.currency,
      walletName: wallet.wallet_name,
      walletType: wallet.wallet_type
    };
  }
  
  /**
   * Get total system balance (all wallets combined)
   */
  static async getTotalSystemBalance() {
    const result = await pool.query(
      `SELECT 
         SUM(balance) as total_balance,
         SUM(pending_balance) as total_pending,
         SUM(total_credited) as total_credited,
         SUM(total_debited) as total_debited,
         COUNT(*) as wallet_count
       FROM system_wallets
       WHERE is_active = true`
    );
    
    return result.rows[0];
  }
  
  // ==================== Transactions ====================
  
  /**
   * Credit a system wallet
   */
  static async creditWallet(walletType, amount, transactionType, metadata = {}) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get wallet with lock
      const walletResult = await client.query(
        `SELECT * FROM system_wallets 
         WHERE wallet_type = $1 AND is_active = true 
         FOR UPDATE`,
        [walletType]
      );
      
      if (walletResult.rows.length === 0) {
        throw new AppError(404, `Wallet type ${walletType} not found`);
      }
      
      const wallet = walletResult.rows[0];
      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + Number(amount);
      
      // Update wallet
      await client.query(
        `UPDATE system_wallets 
         SET balance = $1,
             total_credited = total_credited + $2,
             last_transaction_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        [balanceAfter, amount, wallet.id]
      );
      
      // Generate reference
      const reference = `SYS-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
      
      // Create transaction record
      const transactionResult = await client.query(
        `INSERT INTO system_wallet_transactions (
          wallet_id, transaction_type, amount, balance_before, balance_after,
          currency, status, reference, description, source_type, source_id,
          metadata, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9, $10, $11, NOW())
        RETURNING *`,
        [
          wallet.id,
          transactionType,
          amount,
          balanceBefore,
          balanceAfter,
          wallet.currency,
          reference,
          metadata.description || `${transactionType} of ₦${amount}`,
          metadata.sourceType || null,
          metadata.sourceId || null,
          metadata
        ]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`system:wallet:${walletType}`);
      
      logger.info(`System wallet ${walletType} credited: ₦${amount} (${transactionType})`);
      
      return transactionResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Debit a system wallet
   */
  static async debitWallet(walletType, amount, transactionType, metadata = {}) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get wallet with lock
      const walletResult = await client.query(
        `SELECT * FROM system_wallets 
         WHERE wallet_type = $1 AND is_active = true 
         FOR UPDATE`,
        [walletType]
      );
      
      if (walletResult.rows.length === 0) {
        throw new AppError(404, `Wallet type ${walletType} not found`);
      }
      
      const wallet = walletResult.rows[0];
      const balanceBefore = Number(wallet.balance);
      
      if (balanceBefore < Number(amount)) {
        throw new AppError(400, `Insufficient balance in ${walletType} wallet`);
      }
      
      const balanceAfter = balanceBefore - Number(amount);
      
      // Update wallet
      await client.query(
        `UPDATE system_wallets 
         SET balance = $1,
             total_debited = total_debited + $2,
             last_transaction_at = NOW(),
             updated_at = NOW()
         WHERE id = $3`,
        [balanceAfter, amount, wallet.id]
      );
      
      // Generate reference
      const reference = `SYS-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
      
      // Create transaction record
      const transactionResult = await client.query(
        `INSERT INTO system_wallet_transactions (
          wallet_id, transaction_type, amount, balance_before, balance_after,
          currency, status, reference, description, destination_type, destination_id,
          metadata, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9, $10, $11, NOW())
        RETURNING *`,
        [
          wallet.id,
          transactionType,
          amount,
          balanceBefore,
          balanceAfter,
          wallet.currency,
          reference,
          metadata.description || `${transactionType} of ₦${amount}`,
          metadata.destinationType || null,
          metadata.destinationId || null,
          metadata
        ]
      );
      
      await client.query('COMMIT');
      
      // Invalidate cache
      await cacheDel(`system:wallet:${walletType}`);
      
      logger.info(`System wallet ${walletType} debited: ₦${amount} (${transactionType})`);
      
      return transactionResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Transfer between system wallets
   */
  static async transferBetweenWallets(fromWalletType, toWalletType, amount, reason, metadata = {}) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Debit from source wallet
      const debitTransaction = await this.debitWallet(
        fromWalletType,
        amount,
        'transfer_out',
        {
          description: `Transfer to ${toWalletType}: ${reason}`,
          destinationType: toWalletType,
          metadata
        }
      );
      
      // Credit to destination wallet
      const creditTransaction = await this.creditWallet(
        toWalletType,
        amount,
        'transfer_in',
        {
          description: `Transfer from ${fromWalletType}: ${reason}`,
          sourceType: fromWalletType,
          metadata
        }
      );
      
      await client.query('COMMIT');
      
      return {
        debit: debitTransaction,
        credit: creditTransaction
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ==================== Fee Processing ====================
  
  /**
   * Process onboarding fee
   */
  static async processOnboardingFee(artisanId, amount, paymentReference) {
    const metadata = {
      artisanId,
      paymentReference,
      feeType: 'onboarding',
      description: `Onboarding fee from artisan ${artisanId}`
    };
    
    // Credit to fees wallet
    const transaction = await this.creditWallet(
      'fees',
      amount,
      'onboarding_fee',
      metadata
    );
    
    // Auto-transfer to main wallet if configured
    const settings = await this.getSettings();
    if (settings.auto_transfer_settings?.enabled) {
      await this.transferBetweenWallets(
        'fees',
        'main',
        amount,
        'Auto-transfer of onboarding fee',
        { reference: paymentReference }
      );
    }
    
    return transaction;
  }
  
  /**
   * Process monthly fee
   */
  static async processMonthlyFee(artisanId, amount, paymentReference) {
    const metadata = {
      artisanId,
      paymentReference,
      feeType: 'monthly',
      description: `Monthly fee from artisan ${artisanId}`
    };
    
    // Credit to fees wallet
    const transaction = await this.creditWallet(
      'fees',
      amount,
      'monthly_fee',
      metadata
    );
    
    // Auto-transfer to main wallet if configured
    const settings = await this.getSettings();
    if (settings.auto_transfer_settings?.enabled) {
      await this.transferBetweenWallets(
        'fees',
        'main',
        amount,
        'Auto-transfer of monthly fee',
        { reference: paymentReference }
      );
    }
    
    return transaction;
  }
  
  /**
   * Process platform commission
   */
  static async processCommission(jobId, artisanId, clientId, amount, metadata = {}) {
    const transaction = await this.creditWallet(
      'commission',
      amount,
      'commission',
      {
        jobId,
        artisanId,
        clientId,
        description: `Platform commission for job ${jobId}`,
        ...metadata
      }
    );
    
    // Distribute commission to other wallets based on settings
    const settings = await this.getSettings();
    const distribution = settings.commission_distribution || { platform: 70, operations: 20, fees: 10 };
    
    // Transfer percentages to different wallets
    if (distribution.platform > 0) {
      const platformAmount = (amount * distribution.platform) / 100;
      await this.transferBetweenWallets(
        'commission',
        'main',
        platformAmount,
        `Platform share of commission (${distribution.platform}%)`,
        { jobId }
      );
    }
    
    if (distribution.operations > 0) {
      const opsAmount = (amount * distribution.operations) / 100;
      await this.transferBetweenWallets(
        'commission',
        'operations',
        opsAmount,
        `Operations share of commission (${distribution.operations}%)`,
        { jobId }
      );
    }
    
    if (distribution.fees > 0) {
      const feesAmount = (amount * distribution.fees) / 100;
      await this.transferBetweenWallets(
        'commission',
        'fees',
        feesAmount,
        `Fees share of commission (${distribution.fees}%)`,
        { jobId }
      );
    }
    
    return transaction;
  }
  
  // ==================== Transaction History ====================
  
  /**
   * Get transaction history
   */
  static async getTransactionHistory(filters = {}) {
    const { walletType, transactionType, page = 1, limit = 20, startDate, endDate } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT st.*, sw.wallet_name, sw.wallet_type
      FROM system_wallet_transactions st
      JOIN system_wallets sw ON st.wallet_id = sw.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (walletType) {
      query += ` AND sw.wallet_type = $${paramIndex}`;
      params.push(walletType);
      paramIndex++;
    }
    
    if (transactionType) {
      query += ` AND st.transaction_type = $${paramIndex}`;
      params.push(transactionType);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND st.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND st.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` ORDER BY st.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM system_wallet_transactions st
      JOIN system_wallets sw ON st.wallet_id = sw.id
      WHERE 1=1
      ${walletType ? `AND sw.wallet_type = '${walletType}'` : ''}
      ${transactionType ? `AND st.transaction_type = '${transactionType}'` : ''}
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
  
  /**
   * Get wallet balance history
   */
  static async getBalanceHistory(walletType, days = 30) {
    const result = await pool.query(
      `SELECT h.*, sw.wallet_name
       FROM system_wallet_balance_history h
       JOIN system_wallets sw ON h.wallet_id = sw.id
       WHERE sw.wallet_type = $1
         AND h.date > NOW() - INTERVAL '${days} days'
       ORDER BY h.date ASC`,
      [walletType]
    );
    
    return result.rows;
  }
  
  // ==================== Settings ====================
  
  /**
   * Get system wallet settings
   */
  static async getSettings() {
    const cacheKey = 'system:wallet:settings';
    let settings = await cacheGet(cacheKey);
    
    if (!settings) {
      const result = await pool.query(
        `SELECT key, value FROM system_wallet_settings`
      );
      
      settings = {};
      for (const row of result.rows) {
        settings[row.key] = row.value;
      }
      
      await cacheSet(cacheKey, settings, 3600);
    }
    
    return settings;
  }
  
  /**
   * Update system wallet settings
   */
  static async updateSettings(key, value, adminId) {
    const result = await pool.query(
      `INSERT INTO system_wallet_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) 
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [key, value, adminId]
    );
    
    await cacheDel('system:wallet:settings');
    
    return result.rows[0];
  }
  
  // ==================== Statistics ====================
  
  /**
   * Get system wallet statistics
   */
  static async getStatistics() {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_wallets,
        SUM(balance) as total_balance,
        SUM(pending_balance) as total_pending,
        SUM(total_credited) as total_credited,
        SUM(total_debited) as total_debited
      FROM system_wallets
      WHERE is_active = true
    `);
    
    const walletBreakdown = await pool.query(`
      SELECT 
        wallet_type,
        wallet_name,
        balance,
        pending_balance,
        total_credited,
        total_debited
      FROM system_wallets
      WHERE is_active = true
      ORDER BY wallet_type
    `);
    
    const transactionStats = await pool.query(`
      SELECT 
        transaction_type,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        AVG(amount) as average_amount
      FROM system_wallet_transactions
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY transaction_type
      ORDER BY total_amount DESC
    `);
    
    return {
      summary: stats.rows[0],
      walletBreakdown: walletBreakdown.rows,
      transactionStats: transactionStats.rows
    };
  }
  
  // ==================== Reconciliation ====================
  
  /**
   * Get daily summary for a specific date
   */
  static async getDailySummary(date) {
    const result = await pool.query(`
      SELECT 
        sw.wallet_type,
        sw.wallet_name,
        h.balance as opening_balance,
        (SELECT COALESCE(SUM(amount), 0) FROM system_wallet_transactions 
         WHERE wallet_id = sw.id 
         AND DATE(created_at) = $1
         AND transaction_type IN ('onboarding_fee', 'monthly_fee', 'commission', 'transfer_in')) as total_credit,
        (SELECT COALESCE(SUM(amount), 0) FROM system_wallet_transactions 
         WHERE wallet_id = sw.id 
         AND DATE(created_at) = $1
         AND transaction_type IN ('transfer_out', 'refund', 'operational_cost')) as total_debit,
        sw.balance as closing_balance
      FROM system_wallets sw
      LEFT JOIN system_wallet_balance_history h ON sw.id = h.wallet_id AND h.date = $1
      WHERE sw.is_active = true
    `, [date]);
    
    return result.rows;
  }
  
  /**
   * Reconcile wallet (verify transactions match balance)
   */
  static async reconcileWallet(walletType) {
    const wallet = await this.getWalletByType(walletType);
    
    const transactions = await pool.query(
      `SELECT 
         SUM(CASE WHEN transaction_type IN ('onboarding_fee', 'monthly_fee', 'commission', 'transfer_in') 
              THEN amount ELSE 0 END) as total_credit,
         SUM(CASE WHEN transaction_type IN ('transfer_out', 'refund', 'operational_cost') 
              THEN amount ELSE 0 END) as total_debit
       FROM system_wallet_transactions
       WHERE wallet_id = $1 AND status = 'completed'`,
      [wallet.id]
    );
    
    const totalCredit = parseFloat(transactions.rows[0].total_credit || 0);
    const totalDebit = parseFloat(transactions.rows[0].total_debit || 0);
    const expectedBalance = totalCredit - totalDebit;
    const actualBalance = parseFloat(wallet.balance);
    
    return {
      walletType,
      walletName: wallet.wallet_name,
      totalCredit,
      totalDebit,
      expectedBalance,
      actualBalance,
      isReconciled: expectedBalance === actualBalance,
      difference: expectedBalance - actualBalance
    };
  }
}

module.exports = SystemWalletService;