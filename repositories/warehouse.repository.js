const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class WarehouseRepository {
  /**
   * Create warehouse
   * @param {Object} warehouseData - Warehouse data
   * @returns {Promise<Object>} Created warehouse
   */
  static async create(warehouseData) {
    const { name, location, address, zone, managerName, managerPhone, isActive = true } = warehouseData;
    
    const result = await pool.query(
      `INSERT INTO warehouses 
       (name, location, address, zone, manager_name, manager_phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, location, address, zone, managerName, managerPhone, isActive]
    );
    
    return result.rows[0];
  }

  /**
   * Find warehouse by ID
   * @param {string} warehouseId - Warehouse ID
   * @returns {Promise<Object|null>} Warehouse or null
   */
  static async findById(warehouseId) {
    const result = await pool.query(
      `SELECT * FROM warehouses WHERE id = $1`,
      [warehouseId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get all warehouses
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Warehouses and pagination
   */
  static async findAll(filters = {}) {
    const { zone, isActive, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM warehouses WHERE 1=1`;
    const params = [];
    let paramIndex = 1;
    
    if (zone) {
      query += ` AND zone = $${paramIndex}`;
      params.push(zone);
      paramIndex++;
    }
    
    if (isActive !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(isActive);
      paramIndex++;
    }
    
    query += ` ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM warehouses WHERE 1=1
      ${zone ? `AND zone = '${zone}'` : ''}
      ${isActive !== undefined ? `AND is_active = ${isActive}` : ''}
    `;
    const countResult = await pool.query(countQuery);
    
    return {
      warehouses: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Update warehouse
   * @param {string} warehouseId - Warehouse ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated warehouse or null
   */
  static async update(warehouseId, updates) {
    const allowedFields = ['name', 'address', 'zone', 'manager_name', 'manager_phone', 'is_active'];
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
    
    values.push(warehouseId);
    const query = `
      UPDATE warehouses 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Delete warehouse (soft delete)
   * @param {string} warehouseId - Warehouse ID
   * @returns {Promise<Object|null>} Deleted warehouse or null
   */
  static async delete(warehouseId) {
    const result = await pool.query(
      `UPDATE warehouses SET is_active = false WHERE id = $1 RETURNING *`,
      [warehouseId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Create inventory item
   * @param {Object} itemData - Inventory item data
   * @returns {Promise<Object>} Created item
   */
  static async createInventoryItem(itemData) {
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

  /**
   * Find inventory item by ID
   * @param {string} itemId - Item ID
   * @returns {Promise<Object|null>} Item or null
   */
  static async findInventoryItemById(itemId) {
    const result = await pool.query(
      `SELECT i.*, w.name as warehouse_name, w.zone
       FROM inventory_items i
       JOIN warehouses w ON i.warehouse_id = w.id
       WHERE i.id = $1`,
      [itemId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get inventory items
   * @param {string} warehouseId - Warehouse ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Inventory items
   */
  static async getInventory(warehouseId, filters = {}) {
    const { category, lowStockOnly, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT * FROM inventory_items
      WHERE warehouse_id = $1 AND is_active = true
    `;
    const params = [warehouseId];
    let paramIndex = 2;
    
    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (lowStockOnly) {
      query += ` AND quantity <= reorder_level`;
    }
    
    query += ` ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM inventory_items
      WHERE warehouse_id = $1 AND is_active = true
      ${category ? `AND category = '${category}'` : ''}
    `;
    const countResult = await pool.query(countQuery, [warehouseId]);
    
    return {
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }

  /**
   * Update inventory quantity
   * @param {string} itemId - Item ID
   * @param {number} quantityChange - Change in quantity (positive or negative)
   * @param {string} reason - Reason for change
   * @param {string} referenceId - Reference ID (dispatch, etc.)
   * @returns {Promise<Object|null>} Updated item or null
   */
  static async updateInventoryQuantity(itemId, quantityChange, reason, referenceId = null) {
    const result = await pool.query(
      `UPDATE inventory_items 
       SET quantity = quantity + $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [quantityChange, itemId]
    );
    
    if (result.rows.length === 0) return null;
    
    const item = result.rows[0];
    
    // Log transaction
    await pool.query(
      `INSERT INTO inventory_transactions (item_id, quantity_change, new_quantity, reason, reference_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [itemId, quantityChange, item.quantity, reason, referenceId]
    );
    
    return item;
  }

  /**
   * Check inventory availability
   * @param {string} itemId - Item ID
   * @param {number} requestedQuantity - Requested quantity
   * @returns {Promise<Object>} Availability info
   */
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

  /**
   * Get low stock items
   * @param {string} warehouseId - Warehouse ID (optional)
   * @returns {Promise<Array>} Low stock items
   */
  static async getLowStockItems(warehouseId = null) {
    let query = `
      SELECT i.*, w.name as warehouse_name
      FROM inventory_items i
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE i.quantity <= i.reorder_level AND i.is_active = true
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

  /**
   * Get inventory statistics
   * @param {string} warehouseId - Warehouse ID (optional)
   * @returns {Promise<Object>} Inventory statistics
   */
  static async getInventoryStats(warehouseId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_items,
        SUM(quantity) as total_quantity,
        SUM(quantity * unit_price) as total_value,
        COUNT(CASE WHEN quantity <= reorder_level THEN 1 END) as low_stock_items,
        AVG(unit_price) as average_price
      FROM inventory_items
      WHERE is_active = true
    `;
    const params = [];
    
    if (warehouseId) {
      query += ` AND warehouse_id = $1`;
      params.push(warehouseId);
    }
    
    const result = await pool.query(query, params);
    return result.rows[0];
  }
}

module.exports = WarehouseRepository;