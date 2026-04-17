const { pool } = require('../config/database');

class Warehouse {
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

  static async findById(warehouseId) {
    const result = await pool.query(
      `SELECT * FROM warehouses WHERE id = $1`,
      [warehouseId]
    );
    return result.rows[0];
  }

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
      ${zone ? 'AND zone = $1' : ''}
      ${isActive !== undefined ? `AND is_active = $${zone ? 2 : 1}` : ''}
    `;
    const countParams = [];
    if (zone) countParams.push(zone);
    if (isActive !== undefined) countParams.push(isActive);
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      warehouses: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

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
    return result.rows[0];
  }

  static async getNearestWarehouse(location) {
    const result = await pool.query(
      `SELECT w.*,
             ST_Distance(
               ST_SetSRID(ST_MakePoint($1, $2), 4326),
               ST_SetSRID(ST_MakePoint(
                 (w.location->>'longitude')::float,
                 (w.location->>'latitude')::float
               ), 4326)
             ) as distance
       FROM warehouses w
       WHERE w.is_active = true
       ORDER BY distance ASC
       LIMIT 1`,
      [location.longitude, location.latitude]
    );
    return result.rows[0];
  }

  static async getZones() {
    const result = await pool.query(
      `SELECT DISTINCT zone FROM warehouses WHERE is_active = true ORDER BY zone`,
      []
    );
    return result.rows.map(r => r.zone);
  }

  static async delete(warehouseId) {
    const result = await pool.query(
      `UPDATE warehouses SET is_active = false WHERE id = $1 RETURNING *`,
      [warehouseId]
    );
    return result.rows[0];
  }
}

module.exports = Warehouse;