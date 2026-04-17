const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const Warehouse = require('../models/Warehouse');
const Inventory = require('../models/Inventory');
const Dispatch = require('../models/Dispatch');
const BillOfQuantities = require('../models/BillOfQuantities');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');

// Get warehouses list
router.get('/list', authenticateToken, [
  query('zone').optional().isString(),
  query('isActive').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { zone, isActive, page = 1, limit = 20 } = req.query;
    const result = await Warehouse.findAll({ zone, isActive, page, limit });
    sendPaginated(res, result.warehouses, page, limit, result.total, 'Warehouses retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get warehouse details
router.get('/:warehouseId', authenticateToken, [
  param('warehouseId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const warehouse = await Warehouse.findById(req.params.warehouseId);
    if (!warehouse) {
      throw new AppError(404, 'Warehouse not found');
    }
    sendSuccess(res, warehouse, 'Warehouse details retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Check material availability
router.post('/check-availability', authenticateToken, [
  body('items').isArray().notEmpty(),
  body('items.*.name').notEmpty(),
  body('items.*.quantity').isFloat({ min: 0.01 }),
  body('warehouseId').optional().isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { items, warehouseId } = req.body;
    let warehouse = null;
    
    if (warehouseId) {
      warehouse = await Warehouse.findById(warehouseId);
    } else {
      // Find nearest warehouse (simplified - would need location)
      const warehouses = await Warehouse.findAll({ isActive: true });
      warehouse = warehouses.warehouses[0];
    }
    
    if (!warehouse) {
      throw new AppError(404, 'No active warehouse found');
    }
    
    const availabilityResults = [];
    for (const item of items) {
      // Search inventory for matching item
      const inventory = await Inventory.getInventory(warehouse.id, { category: item.category });
      const matchedItem = inventory.items.find(i => 
        i.name.toLowerCase().includes(item.name.toLowerCase()) ||
        item.name.toLowerCase().includes(i.name.toLowerCase())
      );
      
      if (matchedItem) {
        const check = await Inventory.checkAvailability(matchedItem.id, item.quantity);
        availabilityResults.push({
          requestedItem: item,
          matchedItem: matchedItem.name,
          available: check.available,
          availableQuantity: check.availableQuantity,
          unitPrice: matchedItem.unit_price
        });
      } else {
        availabilityResults.push({
          requestedItem: item,
          available: false,
          availableQuantity: 0,
          message: 'Item not found in inventory'
        });
      }
    }
    
    sendSuccess(res, {
      warehouse,
      items: availabilityResults
    }, 'Availability checked successfully');
  } catch (error) {
    next(error);
  }
});

// Create dispatch request (Admin)
router.post('/dispatch/create', authenticateToken, requireRole(['admin']), [
  body('boqId').isUUID(),
  body('warehouseId').isUUID(),
  body('items').isArray().notEmpty(),
  body('deliveryAddress').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const boq = await BillOfQuantities.findById(req.body.boqId);
    if (!boq) {
      throw new AppError(404, 'BoQ not found');
    }
    
    const job = await Job.findById(boq.job_id);
    if (!job) {
      throw new AppError(404, 'Job not found');
    }
    
    const dispatch = await Dispatch.create({
      boqId: req.body.boqId,
      warehouseId: req.body.warehouseId,
      items: req.body.items,
      deliveryAddress: req.body.deliveryAddress,
      clientId: job.client_id,
      jobId: boq.job_id
    });
    
    sendSuccess(res, dispatch, 'Dispatch request created successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Get dispatch status
router.get('/dispatch/:dispatchId', authenticateToken, [
  param('dispatchId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const dispatch = await Dispatch.findById(req.params.dispatchId);
    if (!dispatch) {
      throw new AppError(404, 'Dispatch not found');
    }
    
    // Check authorization
    if (dispatch.client_id !== req.user.id && req.user.user_type !== 'admin') {
      throw new AppError(403, 'Not authorized to view this dispatch');
    }
    
    sendSuccess(res, dispatch, 'Dispatch status retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Cancel dispatch (Admin)
router.post('/dispatch/:dispatchId/cancel', authenticateToken, requireRole(['admin']), [
  param('dispatchId').isUUID(),
  body('reason').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const cancelled = await Dispatch.cancelDispatch(req.params.dispatchId, req.body.reason);
    if (!cancelled) {
      throw new AppError(404, 'Dispatch not found');
    }
    sendSuccess(res, cancelled, 'Dispatch cancelled successfully');
  } catch (error) {
    next(error);
  }
});

// Track dispatch
router.get('/dispatch/:dispatchId/track', authenticateToken, [
  param('dispatchId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const tracking = await Dispatch.trackDispatch(req.params.dispatchId);
    if (!tracking) {
      throw new AppError(404, 'Dispatch not found');
    }
    sendSuccess(res, tracking, 'Tracking information retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Confirm delivery (Client)
router.post('/dispatch/:dispatchId/confirm-delivery', authenticateToken, requireRole(['client']), [
  param('dispatchId').isUUID(),
  body('deliveryPhoto').optional().isString(),
  body('signature').optional().isString()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const dispatch = await Dispatch.findById(req.params.dispatchId);
    if (!dispatch) {
      throw new AppError(404, 'Dispatch not found');
    }
    
    if (dispatch.client_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to confirm this delivery');
    }
    
    const confirmed = await Dispatch.confirmDelivery(
      req.params.dispatchId,
      req.body.deliveryPhoto,
      req.body.signature
    );
    
    sendSuccess(res, confirmed, 'Delivery confirmed successfully');
  } catch (error) {
    next(error);
  }
});

// Get inventory levels (Admin)
router.get('/:warehouseId/inventory', authenticateToken, requireRole(['admin']), [
  param('warehouseId').isUUID(),
  query('category').optional().isString(),
  query('lowStockOnly').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { category, lowStockOnly, page = 1, limit = 50 } = req.query;
    const result = await Inventory.getInventory(req.params.warehouseId, { 
      category, 
      lowStockOnly: lowStockOnly === 'true',
      page, 
      limit 
    });
    sendPaginated(res, result.items, page, limit, result.total, 'Inventory retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get procurement history
router.get('/procurement/history', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { page = 1, limit = 20 } = req.query;
    // This would need a procurement history model
    sendSuccess(res, { page, limit }, 'Procurement history retrieved');
  } catch (error) {
    next(error);
  }
});

// Request material return (Client)
router.post('/return-request', authenticateToken, requireRole(['client']), [
  body('dispatchId').isUUID(),
  body('items').isArray().notEmpty(),
  body('items.*.itemId').notEmpty(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('reason').notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const dispatch = await Dispatch.findById(req.body.dispatchId);
    if (!dispatch) {
      throw new AppError(404, 'Dispatch not found');
    }
    
    if (dispatch.client_id !== req.user.id) {
      throw new AppError(403, 'Not authorized to request return');
    }
    
    // Create return request
    const returnRequest = {
      dispatchId: req.body.dispatchId,
      items: req.body.items,
      reason: req.body.reason,
      status: 'pending'
    };
    
    sendSuccess(res, returnRequest, 'Return request submitted', 201);
  } catch (error) {
    next(error);
  }
});

// Get return status
router.get('/return-request/:returnId', authenticateToken, [
  param('returnId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    // This would fetch from a returns table
    sendSuccess(res, { returnId: req.params.returnId, status: 'pending' }, 'Return status retrieved');
  } catch (error) {
    next(error);
  }
});

module.exports = router;