const { pool } = require('../config/database');

class Inventory {
  static async createItem(itemData) {
    const { warehouseId, name, sku, category, unitPrice, unit, quantity, reorderLevel } = itemData;
    
    const result = await pool.query(
      `INSERT INTO inventory_items 
       (warehouse_id, name, sku, category, unit_price, unit, quantity, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [warehouseId, name, sku, category, unitPrice, unit, quantity, reorderLevel]
    );
    
    return result.rows[0];
  }

  static async findById(itemId) {
    const result = await pool.query(
      `SELECT i.*, w.name as warehouse_name, w.zone
       FROM inventory_items i
       JOIN warehouses w ON i.warehouse_id = w.id
       WHERE i.id = $1`,
      [itemId]
    );
    return result.rows[0];
  }

  static async findBySku(sku) {
    const result = await pool.query(
      `SELECT * FROM inventory_items WHERE sku = $1`,
      [sku]
    );
    return result.rows;
  }

  static async getInventory(warehouseId = null, filters = {}) {
    const { category, lowStockOnly, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT i.*, w.name as warehouse_name
      FROM inventory_items i
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (warehouseId) {
      query += ` AND i.warehouse_id = $${paramIndex}`;
      params.push(warehouseId);
      paramIndex++;
    }
    
    if (category) {
      query += ` AND i.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (lowStockOnly) {
      query += ` AND i.quantity <= i.reorder_level`;
    }
    
    query += ` ORDER BY i.name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM inventory_items i
      WHERE 1=1
      ${warehouseId ? 'AND i.warehouse_id = $1' : ''}
      ${category ? `AND i.category = $${warehouseId ? 2 : 1}` : ''}
    `;
    const countParams = [];
    if (warehouseId) countParams.push(warehouseId);
    if (category) countParams.push(category);
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async updateQuantity(itemId, quantityChange, reason, referenceId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current quantity
      const currentResult = await client.query(
        `SELECT quantity FROM inventory_items WHERE id = $1 FOR UPDATE`,
        [itemId]
      );
      
      if (currentResult.rows.length === 0) {
        throw new Error('Item not found');
      }
      
      const currentQuantity = currentResult.rows[0].quantity;
      const newQuantity = currentQuantity + quantityChange;
      
      if (newQuantity < 0) {
        throw new Error('Insufficient stock');
      }
      
      // Update quantity
      const result = await client.query(
        `UPDATE inventory_items 
         SET quantity = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [newQuantity, itemId]
      );
      
      // Log transaction
      await client.query(
        `INSERT INTO inventory_transactions 
         (item_id, quantity_change, new_quantity, reason, reference_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [itemId, quantityChange, newQuantity, reason, referenceId]
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

  static async checkAvailability(itemId, requestedQuantity) {
    const result = await pool.query(
      `SELECT quantity FROM inventory_items WHERE id = $1`,
      [itemId]
    );
    
    if (result.rows.length === 0) {
      return { available: false, availableQuantity: 0 };
    }
    
    const availableQuantity = result.rows[0].quantity;
    return {
      available: availableQuantity >= requestedQuantity,
      availableQuantity
    };
  }

  static async checkMultipleAvailability(items) {
    const results = [];
    
    for (const item of items) {
      const availability = await this.checkAvailability(item.itemId, item.quantity);
      results.push({
        ...item,
        ...availability
      });
    }
    
    return results;
  }

  static async getLowStockItems(warehouseId = null) {
    let query = `
      SELECT i.*, w.name as warehouse_name
      FROM inventory_items i
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE i.quantity <= i.reorder_level
    `;
    const params = [];
    
    if (warehouseId) {
      query += ` AND i.warehouse_id = $1`;
      params.push(warehouseId);
    }
    
    query += ` ORDER BY (i.reorder_level - i.quantity) DESC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getCategories() {
    const result = await pool.query(
      `SELECT DISTINCT category FROM inventory_items ORDER BY category`,
      []
    );
    return result.rows.map(r => r.category);
  }

  static async updateItem(itemId, updates) {
    const allowedFields = ['name', 'sku', 'category', 'unit_price', 'unit', 'reorder_level'];
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
    
    values.push(itemId);
    const query = `
      UPDATE inventory_items 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async deleteItem(itemId) {
    const result = await pool.query(
      `DELETE FROM inventory_items WHERE id = $1 RETURNING *`,
      [itemId]
    );
    return result.rows[0];
  }

  static async getTransactionHistory(itemId, filters = {}) {
    const { startDate, endDate, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM inventory_transactions
      WHERE item_id = $1
    `;
    const params = [itemId];
    let paramIndex = 2;
    
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
      SELECT COUNT(*) FROM inventory_transactions WHERE item_id = $1
      ${startDate ? 'AND created_at >= $2' : ''}
      ${endDate ? `AND created_at <= $${startDate ? 3 : 2}` : ''}
    `;
    const countParams = [itemId];
    if (startDate) countParams.push(startDate);
    if (endDate) countParams.push(endDate);
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }
}

module.exports = Inventory;