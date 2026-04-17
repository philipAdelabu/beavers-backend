const { pool } = require('../config/database');

class Promotion {
  static async create(promotionData) {
    const { 
      name, type, value, startDate, endDate, maxUses, 
      userType, isNewUsersOnly, minSpend, maxDiscount 
    } = promotionData;
    
    const result = await pool.query(
      `INSERT INTO promotions 
       (name, type, value, start_date, end_date, max_uses, 
        user_type, is_new_users_only, min_spend, max_discount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, type, value, startDate, endDate, maxUses, 
       userType, isNewUsersOnly || false, minSpend, maxDiscount]
    );
    
    return result.rows[0];
  }

  static async findById(promotionId) {
    const result = await pool.query(
      `SELECT * FROM promotions WHERE id = $1`,
      [promotionId]
    );
    return result.rows[0];
  }

  static async findByCode(code) {
    const result = await pool.query(
      `SELECT * FROM promotions WHERE code = $1`,
      [code]
    );
    return result.rows[0];
  }

  static async getAllActive(filters = {}) {
    const { userType, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM promotions 
      WHERE is_active = true 
        AND start_date <= NOW() 
        AND end_date >= NOW()
        AND (max_uses IS NULL OR used_count < max_uses)
    `;
    const params = [];
    let paramIndex = 1;
    
    if (userType) {
      query += ` AND (user_type = $${paramIndex} OR user_type IS NULL)`;
      params.push(userType);
      paramIndex++;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM promotions 
      WHERE is_active = true 
        AND start_date <= NOW() 
        AND end_date >= NOW()
        AND (max_uses IS NULL OR used_count < max_uses)
        ${userType ? `AND (user_type = $1 OR user_type IS NULL)` : ''}
    `;
    const countParams = userType ? [userType] : [];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      promotions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async validatePromotion(promotionId, userId, amount) {
    const promotion = await this.findById(promotionId);
    
    if (!promotion) {
      return { valid: false, reason: 'Promotion not found' };
    }
    
    if (!promotion.is_active) {
      return { valid: false, reason: 'Promotion is inactive' };
    }
    
    const now = new Date();
    if (now < promotion.start_date) {
      return { valid: false, reason: 'Promotion has not started' };
    }
    
    if (now > promotion.end_date) {
      return { valid: false, reason: 'Promotion has expired' };
    }
    
    if (promotion.max_uses && promotion.used_count >= promotion.max_uses) {
      return { valid: false, reason: 'Promotion usage limit reached' };
    }
    
    if (promotion.min_spend && amount < promotion.min_spend) {
      return { valid: false, reason: `Minimum spend of ${promotion.min_spend} required` };
    }
    
    if (promotion.is_new_users_only) {
      const userResult = await pool.query(
        `SELECT COUNT(*) FROM jobs WHERE client_id = $1`,
        [userId]
      );
      if (parseInt(userResult.rows[0].count) > 0) {
        return { valid: false, reason: 'Promotion is for new users only' };
      }
    }
    
    // Check if user already used this promotion
    const usageResult = await pool.query(
      `SELECT COUNT(*) FROM promotion_usage 
       WHERE promotion_id = $1 AND user_id = $2`,
      [promotionId, userId]
    );
    
    if (parseInt(usageResult.rows[0].count) > 0) {
      return { valid: false, reason: 'You have already used this promotion' };
    }
    
    // Calculate discount
    let discountAmount = 0;
    if (promotion.type === 'percentage') {
      discountAmount = (amount * promotion.value) / 100;
      if (promotion.max_discount && discountAmount > promotion.max_discount) {
        discountAmount = promotion.max_discount;
      }
    } else if (promotion.type === 'fixed') {
      discountAmount = promotion.value;
      if (discountAmount > amount) {
        discountAmount = amount;
      }
    }
    
    return {
      valid: true,
      promotion,
      discountAmount,
      finalAmount: amount - discountAmount
    };
  }

  static async applyPromotion(promotionId, userId, jobId, discountAmount) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Record usage
      const result = await client.query(
        `INSERT INTO promotion_usage (promotion_id, user_id, job_id, discount_amount)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [promotionId, userId, jobId, discountAmount]
      );
      
      // Update used count
      await client.query(
        `UPDATE promotions 
         SET used_count = used_count + 1
         WHERE id = $1`,
        [promotionId]
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

  static async updatePromotion(promotionId, updates) {
    const allowedFields = ['name', 'value', 'start_date', 'end_date', 'max_uses', 'is_active'];
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
    
    values.push(promotionId);
    const query = `
      UPDATE promotions 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deletePromotion(promotionId) {
    const result = await pool.query(
      `UPDATE promotions SET is_active = false WHERE id = $1 RETURNING *`,
      [promotionId]
    );
    return result.rows[0];
  }

  static async getUserPromotionUsage(userId) {
    const result = await pool.query(
      `SELECT pu.*, p.name, p.type, p.value
       FROM promotion_usage pu
       JOIN promotions p ON pu.promotion_id = p.id
       WHERE pu.user_id = $1
       ORDER BY pu.created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  static async getPromotionStats(promotionId) {
    const result = await pool.query(
      `SELECT 
         p.*,
         COUNT(pu.id) as times_used,
         SUM(pu.discount_amount) as total_discount_given,
         AVG(pu.discount_amount) as average_discount
       FROM promotions p
       LEFT JOIN promotion_usage pu ON p.id = pu.promotion_id
       WHERE p.id = $1
       GROUP BY p.id`,
      [promotionId]
    );
    return result.rows[0];
  }
}

module.exports = Promotion;