const { pool } = require('../config/database');

class Dispatch {
  static async create(dispatchData) {
    const { boqId, warehouseId, items, deliveryAddress, clientId, jobId } = dispatchData;
    
    const result = await pool.query(
      `INSERT INTO dispatch_requests 
       (boq_id, warehouse_id, items, delivery_address, client_id, job_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [boqId, warehouseId, items, deliveryAddress, clientId, jobId]
    );
    
    return result.rows[0];
  }

  static async findById(dispatchId) {
    const result = await pool.query(
      `SELECT d.*, 
              w.name as warehouse_name, w.address as warehouse_address,
              cp.full_legal_name as client_name, cp.phone as client_phone,
              j.category, j.service_type
       FROM dispatch_requests d
       JOIN warehouses w ON d.warehouse_id = w.id
       JOIN client_profiles cp ON d.client_id = cp.user_id
       JOIN jobs j ON d.job_id = j.id
       WHERE d.id = $1`,
      [dispatchId]
    );
    return result.rows[0];
  }

  static async updateStatus(dispatchId, status, updates = {}) {
    const { riderName, riderPhone, trackingUrl, deliveredAt } = updates;
    
    let query = `
      UPDATE dispatch_requests 
      SET status = $1,
          rider_name = COALESCE($2, rider_name),
          rider_phone = COALESCE($3, rider_phone),
          tracking_url = COALESCE($4, tracking_url),
          delivered_at = COALESCE($5, delivered_at),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;
    
    const result = await pool.query(query, 
      [status, riderName, riderPhone, trackingUrl, deliveredAt, dispatchId]);
    
    return result.rows[0];
  }

  static async assignRider(dispatchId, riderName, riderPhone, trackingUrl = null) {
    const result = await pool.query(
      `UPDATE dispatch_requests 
       SET rider_name = $1, 
           rider_phone = $2,
           tracking_url = COALESCE($3, tracking_url),
           status = 'assigned',
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [riderName, riderPhone, trackingUrl, dispatchId]
    );
    return result.rows[0];
  }

  static async startDelivery(dispatchId) {
    const result = await pool.query(
      `UPDATE dispatch_requests 
       SET status = 'in_transit', 
           started_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [dispatchId]
    );
    return result.rows[0];
  }

  static async confirmDelivery(dispatchId, deliveryPhoto = null, signature = null) {
    const result = await pool.query(
      `UPDATE dispatch_requests 
       SET status = 'delivered', 
           delivered_at = NOW(),
           delivery_photo = COALESCE($1, delivery_photo),
           delivery_signature = COALESCE($2, delivery_signature),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [deliveryPhoto, signature, dispatchId]
    );
    return result.rows[0];
  }

  static async cancelDispatch(dispatchId, reason) {
    const result = await pool.query(
      `UPDATE dispatch_requests 
       SET status = 'cancelled', 
           cancellation_reason = $1,
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reason, dispatchId]
    );
    return result.rows[0];
  }

  static async getPendingDispatches(warehouseId = null) {
    let query = `
      SELECT d.*, w.name as warehouse_name
      FROM dispatch_requests d
      JOIN warehouses w ON d.warehouse_id = w.id
      WHERE d.status IN ('pending', 'assigned')
    `;
    const params = [];
    
    if (warehouseId) {
      query += ` AND d.warehouse_id = $1`;
      params.push(warehouseId);
    }
    
    query += ` ORDER BY d.created_at ASC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getDispatchesByJob(jobId) {
    const result = await pool.query(
      `SELECT d.*, w.name as warehouse_name
       FROM dispatch_requests d
       JOIN warehouses w ON d.warehouse_id = w.id
       WHERE d.job_id = $1
       ORDER BY d.created_at DESC`,
      [jobId]
    );
    return result.rows;
  }

  static async getDispatchesByClient(clientId, filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT d.*, w.name as warehouse_name, j.category
      FROM dispatch_requests d
      JOIN warehouses w ON d.warehouse_id = w.id
      JOIN jobs j ON d.job_id = j.id
      WHERE d.client_id = $1
    `;
    const params = [clientId];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY d.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM dispatch_requests WHERE client_id = $1
      ${status ? 'AND status = $2' : ''}
    `;
    const countParams = status ? [clientId, status] : [clientId];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      dispatches: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async trackDispatch(dispatchId) {
    const result = await pool.query(
      `SELECT status, rider_name, rider_phone, tracking_url, 
              created_at, started_at, delivered_at, cancelled_at
       FROM dispatch_requests
       WHERE id = $1`,
      [dispatchId]
    );
    return result.rows[0];
  }

  static async getDispatchStats(warehouseId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_dispatches,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned,
        COUNT(CASE WHEN status = 'in_transit' THEN 1 END) as in_transit,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 3600) as avg_delivery_hours
      FROM dispatch_requests
      WHERE created_at > NOW() - INTERVAL '30 days'
    `;
    
    if (warehouseId) {
      query += ` AND warehouse_id = $1`;
    }
    
    const params = warehouseId ? [warehouseId] : [];
    const result = await pool.query(query, params);
    return result.rows[0];
  }

  static async updateTracking(dispatchId, location) {
    const result = await pool.query(
      `UPDATE dispatch_requests 
       SET current_location = $1, last_location_update = NOW()
       WHERE id = $2
       RETURNING *`,
      [location, dispatchId]
    );
    return result.rows[0];
  }
}

module.exports = Dispatch;