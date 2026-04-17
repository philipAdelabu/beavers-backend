const { pool } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('./notification.service');

class DispatchService {
  static async createDispatchRequest(dispatchData) {
    const { boqId, warehouseId, items, deliveryAddress, clientId, jobId, priority = 'normal' } = dispatchData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check inventory availability
      const inventoryCheck = await this.checkInventoryAvailability(warehouseId, items);
      
      if (!inventoryCheck.allAvailable) {
        throw new AppError(400, 'Insufficient inventory', { missingItems: inventoryCheck.missingItems });
      }
      
      // Create dispatch request
      const result = await client.query(
        `INSERT INTO dispatch_requests 
         (boq_id, warehouse_id, items, delivery_address, client_id, job_id, status, priority)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
         RETURNING *`,
        [boqId, warehouseId, items, deliveryAddress, clientId, jobId, priority]
      );
      
      const dispatch = result.rows[0];
      
      // Reserve inventory
      await this.reserveInventory(warehouseId, items, dispatch.id, client);
      
      await client.query('COMMIT');
      
      logger.info(`Dispatch request created: ${dispatch.id}`);
      
      return dispatch;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async checkInventoryAvailability(warehouseId, items) {
    const allAvailable = true;
    const missingItems = [];
    
    for (const item of items) {
      const result = await pool.query(
        `SELECT quantity, name FROM inventory_items 
         WHERE warehouse_id = $1 AND id = $2`,
        [warehouseId, item.itemId]
      );
      
      if (result.rows.length === 0 || result.rows[0].quantity < item.quantity) {
        allAvailable = false;
        missingItems.push({
          itemId: item.itemId,
          name: result.rows[0]?.name || 'Unknown',
          requested: item.quantity,
          available: result.rows[0]?.quantity || 0
        });
      }
    }
    
    return { allAvailable, missingItems };
  }
  
  static async reserveInventory(warehouseId, items, dispatchId, client) {
    for (const item of items) {
      await client.query(
        `UPDATE inventory_items 
         SET quantity = quantity - $1,
             reserved_quantity = reserved_quantity + $1
         WHERE warehouse_id = $2 AND id = $3
         RETURNING *`,
        [item.quantity, warehouseId, item.itemId]
      );
      
      await client.query(
        `INSERT INTO inventory_reservations (dispatch_id, item_id, quantity, reserved_at)
         VALUES ($1, $2, $3, NOW())`,
        [dispatchId, item.itemId, item.quantity]
      );
    }
  }
  
  static async assignRider(dispatchId, riderData) {
    const { riderName, riderPhone, riderId, estimatedDeliveryTime } = riderData;
    
    const result = await pool.query(
      `UPDATE dispatch_requests 
       SET rider_name = $1, 
           rider_phone = $2,
           rider_id = $3,
           estimated_delivery_time = $4,
           status = 'assigned',
           assigned_at = NOW()
       WHERE id = $5 AND status = 'pending'
       RETURNING *`,
      [riderName, riderPhone, riderId, estimatedDeliveryTime, dispatchId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Dispatch not found or already assigned');
    }
    
    const dispatch = result.rows[0];
    
    // Notify client
    await NotificationService.sendPushNotification(
      dispatch.client_id,
      'Dispatch Assigned',
      `A rider has been assigned to deliver your materials. ETA: ${estimatedDeliveryTime} minutes`,
      { dispatchId, type: 'dispatch_assigned' }
    );
    
    logger.info(`Rider assigned to dispatch ${dispatchId}`);
    
    return dispatch;
  }
  
  static async startDelivery(dispatchId) {
    const result = await pool.query(
      `UPDATE dispatch_requests 
       SET status = 'in_transit', 
           started_at = NOW()
       WHERE id = $1 AND status = 'assigned'
       RETURNING *`,
      [dispatchId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Dispatch not found or not assigned');
    }
    
    const dispatch = result.rows[0];
    
    // Notify client
    await NotificationService.sendPushNotification(
      dispatch.client_id,
      'Delivery Started',
      'Your materials are on the way!',
      { dispatchId, type: 'delivery_started' }
    );
    
    logger.info(`Delivery started for dispatch ${dispatchId}`);
    
    return dispatch;
  }
  
  static async updateLocation(dispatchId, latitude, longitude) {
    const result = await pool.query(
      `UPDATE dispatch_requests 
       SET current_location = $1,
           last_location_update = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify({ latitude, longitude }), dispatchId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Dispatch not found');
    }
    
    const dispatch = result.rows[0];
    
    // Notify client of location update
    await NotificationService.sendPushNotification(
      dispatch.client_id,
      'Delivery Location Update',
      'Your delivery is on the way. Track it in real-time.',
      { dispatchId, location: { latitude, longitude }, type: 'delivery_location' }
    );
    
    return dispatch;
  }
  
  static async confirmDelivery(dispatchId, deliveryData) {
    const { deliveryPhoto, signature, receivedBy } = deliveryData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE dispatch_requests 
         SET status = 'delivered', 
             delivered_at = NOW(),
             delivery_photo = $1,
             delivery_signature = $2,
             received_by = $3
         WHERE id = $4 AND status = 'in_transit'
         RETURNING *`,
        [deliveryPhoto, signature, receivedBy, dispatchId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Dispatch not found or not in transit');
      }
      
      const dispatch = result.rows[0];
      
      // Release inventory reservation
      await client.query(
        `UPDATE inventory_reservations 
         SET delivered_at = NOW(), status = 'delivered'
         WHERE dispatch_id = $1`,
        [dispatchId]
      );
      
      // Update BoQ status
      await client.query(
        `UPDATE bill_of_quantities 
         SET delivery_status = 'delivered', delivered_at = NOW()
         WHERE id = $1`,
        [dispatch.boq_id]
      );
      
      await client.query('COMMIT');
      
      // Notify client
      await NotificationService.sendPushNotification(
        dispatch.client_id,
        'Delivery Confirmed',
        'Your materials have been delivered!',
        { dispatchId, type: 'delivery_confirmed' }
      );
      
      logger.info(`Delivery confirmed for dispatch ${dispatchId}`);
      
      return dispatch;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async cancelDispatch(dispatchId, reason, cancelledBy) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `UPDATE dispatch_requests 
         SET status = 'cancelled', 
             cancellation_reason = $1,
             cancelled_by = $2,
             cancelled_at = NOW()
         WHERE id = $3 AND status IN ('pending', 'assigned')
         RETURNING *`,
        [reason, cancelledBy, dispatchId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Dispatch not found or cannot be cancelled');
      }
      
      const dispatch = result.rows[0];
      
      // Release inventory reservation
      await client.query(
        `UPDATE inventory_reservations 
         SET status = 'cancelled', cancelled_at = NOW()
         WHERE dispatch_id = $1`,
        [dispatchId]
      );
      
      // Restore inventory quantities
      const reservations = await client.query(
        `SELECT item_id, quantity FROM inventory_reservations WHERE dispatch_id = $1`,
        [dispatchId]
      );
      
      for (const reservation of reservations.rows) {
        await client.query(
          `UPDATE inventory_items 
           SET quantity = quantity + $1,
               reserved_quantity = reserved_quantity - $1
           WHERE id = $2`,
          [reservation.quantity, reservation.item_id]
        );
      }
      
      await client.query('COMMIT');
      
      // Notify client
      await NotificationService.sendPushNotification(
        dispatch.client_id,
        'Delivery Cancelled',
        `Your delivery has been cancelled. Reason: ${reason}`,
        { dispatchId, type: 'delivery_cancelled' }
      );
      
      logger.info(`Dispatch ${dispatchId} cancelled: ${reason}`);
      
      return dispatch;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async getDispatchStatus(dispatchId) {
    const result = await pool.query(
      `SELECT d.*, 
              w.name as warehouse_name,
              w.address as warehouse_address,
              cp.full_legal_name as client_name,
              cp.phone as client_phone
       FROM dispatch_requests d
       LEFT JOIN warehouses w ON d.warehouse_id = w.id
       LEFT JOIN client_profiles cp ON d.client_id = cp.user_id
       WHERE d.id = $1`,
      [dispatchId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Dispatch not found');
    }
    
    return result.rows[0];
  }
  
  static async trackDispatch(dispatchId) {
    const result = await pool.query(
      `SELECT status, current_location, last_location_update,
              rider_name, rider_phone,
              created_at, assigned_at, started_at, delivered_at,
              estimated_delivery_time
       FROM dispatch_requests
       WHERE id = $1`,
      [dispatchId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Dispatch not found');
    }
    
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
    
    query += ` ORDER BY d.priority DESC, d.created_at ASC`;
    
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
  
  static async getDispatchStats(warehouseId = null, days = 30) {
    let query = `
      SELECT 
        COUNT(*) as total_dispatches,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned,
        COUNT(CASE WHEN status = 'in_transit' THEN 1 END) as in_transit,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        AVG(CASE WHEN status = 'delivered' 
            THEN EXTRACT(EPOCH FROM (delivered_at - created_at)) / 3600 
            ELSE NULL END) as avg_delivery_hours
      FROM dispatch_requests
      WHERE created_at > NOW() - INTERVAL '${days} days'
    `;
    
    if (warehouseId) {
      query += ` AND warehouse_id = $1`;
    }
    
    const params = warehouseId ? [warehouseId] : [];
    const result = await pool.query(query, params);
    
    return result.rows[0];
  }
  
  static async getRiderPerformance(riderId, days = 30) {
    const result = await pool.query(
      `SELECT 
         COUNT(*) as total_deliveries,
         COUNT(CASE WHEN status = 'delivered' THEN 1 END) as completed_deliveries,
         COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_deliveries,
         AVG(CASE WHEN status = 'delivered' 
             THEN EXTRACT(EPOCH FROM (delivered_at - assigned_at)) / 60
             ELSE NULL END) as avg_delivery_minutes
       FROM dispatch_requests
       WHERE rider_id = $1 AND created_at > NOW() - INTERVAL '${days} days'`,
      [riderId]
    );
    
    return result.rows[0];
  }
}

module.exports = DispatchService;