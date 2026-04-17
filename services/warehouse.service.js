const { pool } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const { calculateDistance } = require('../utils/geo.utils');

class WarehouseService {
  static async createWarehouse(warehouseData) {
    const { name, location, address, zone, managerName, managerPhone, isActive = true } = warehouseData;
    
    const result = await pool.query(
      `INSERT INTO warehouses 
       (name, location, address, zone, manager_name, manager_phone, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, location, address, zone, managerName, managerPhone, isActive]
    );
    
    await cacheDel('warehouse:all');
    
    logger.info(`Warehouse created: ${name}`);
    
    return result.rows[0];
  }
  
  static async getWarehouse(warehouseId) {
    const cacheKey = `warehouse:${warehouseId}`;
    let warehouse = await cacheGet(cacheKey);
    
    if (!warehouse) {
      const result = await pool.query(
        `SELECT * FROM warehouses WHERE id = $1`,
        [warehouseId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Warehouse not found');
      }
      
      warehouse = result.rows[0];
      await cacheSet(cacheKey, warehouse, 3600);
    }
    
    return warehouse;
  }
  
  static async getAllWarehouses(filters = {}) {
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
  
  static async updateWarehouse(warehouseId, updateData) {
    const { name, address, zone, managerName, managerPhone, isActive } = updateData;
    
    const result = await pool.query(
      `UPDATE warehouses 
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           zone = COALESCE($3, zone),
           manager_name = COALESCE($4, manager_name),
           manager_phone = COALESCE($5, manager_phone),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [name, address, zone, managerName, managerPhone, isActive, warehouseId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Warehouse not found');
    }
    
    await cacheDel(`warehouse:${warehouseId}`);
    await cacheDel('warehouse:all');
    
    return result.rows[0];
  }
  
  static async getNearestWarehouse(location) {
    const warehouses = await this.getAllWarehouses({ isActive: true });
    
    let nearest = null;
    let minDistance = Infinity;
    
    for (const warehouse of warehouses.warehouses) {
      const distance = calculateDistance(
        { latitude: location.latitude, longitude: location.longitude },
        { latitude: warehouse.location.latitude, longitude: warehouse.location.longitude }
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = warehouse;
      }
    }
    
    if (!nearest) {
      throw new AppError(404, 'No active warehouses found');
    }
    
    return { warehouse: nearest, distance: minDistance };
  }
  
  static async addInventoryItem(itemData) {
    const { warehouseId, name, sku, category, unitPrice, unit, quantity, reorderLevel } = itemData;
    
    const result = await pool.query(
      `INSERT INTO inventory_items 
       (warehouse_id, name, sku, category, unit_price, unit, quantity, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [warehouseId, name, sku, category, unitPrice, unit, quantity, reorderLevel]
    );
    
    await cacheDel(`warehouse:inventory:${warehouseId}`);
    
    logger.info(`Inventory item added: ${name} (${sku})`);
    
    return result.rows[0];
  }
  
  static async updateInventoryItem(itemId, updateData) {
    const { name, sku, category, unitPrice, unit, reorderLevel, isActive } = updateData;
    
    const result = await pool.query(
      `UPDATE inventory_items 
       SET name = COALESCE($1, name),
           sku = COALESCE($2, sku),
           category = COALESCE($3, category),
           unit_price = COALESCE($4, unit_price),
           unit = COALESCE($5, unit),
           reorder_level = COALESCE($6, reorder_level),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [name, sku, category, unitPrice, unit, reorderLevel, isActive, itemId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Inventory item not found');
    }
    
    const item = result.rows[0];
    await cacheDel(`warehouse:inventory:${item.warehouse_id}`);
    
    return item;
  }
  
  static async getInventory(warehouseId, filters = {}) {
    const cacheKey = `warehouse:inventory:${warehouseId}`;
    let inventory = await cacheGet(cacheKey);
    
    if (!inventory) {
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
      
      inventory = {
        items: result.rows,
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      };
      
      await cacheSet(cacheKey, inventory, 300);
    }
    
    return inventory;
  }
  
  static async adjustStock(itemId, quantityChange, reason, referenceId = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE inventory_items 
         SET quantity = quantity + $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [quantityChange, itemId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Inventory item not found');
      }
      
      const item = result.rows[0];
      
      if (item.quantity < 0) {
        throw new AppError(400, 'Insufficient stock');
      }
      
      // Log transaction
      await client.query(
        `INSERT INTO inventory_transactions (item_id, quantity_change, new_quantity, reason, reference_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [itemId, quantityChange, item.quantity, reason, referenceId]
      );
      
      await client.query('COMMIT');
      
      await cacheDel(`warehouse:inventory:${item.warehouse_id}`);
      
      // Check if reorder needed
      if (item.quantity <= item.reorder_level) {
        logger.warn(`Low stock alert: ${item.name} (${item.sku}) - ${item.quantity} left`);
      }
      
      return item;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
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
  
  static async getInventoryCategories() {
    const result = await pool.query(
      `SELECT DISTINCT category FROM inventory_items WHERE is_active = true ORDER BY category`,
      []
    );
    
    return result.rows.map(r => r.category);
  }
  
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
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
}

module.exports = WarehouseService;