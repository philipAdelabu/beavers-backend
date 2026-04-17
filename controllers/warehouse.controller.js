const WarehouseService = require('../services/warehouse.service');
const DispatchService = require('../services/dispatch.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class WarehouseController {
  static async getWarehouses(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { zone, isActive, page = 1, limit = 20 } = req.query;
      const result = await WarehouseService.getAllWarehouses({ zone, isActive, page, limit });
      sendPaginated(res, result.warehouses, page, limit, result.total, 'Warehouses retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getWarehouse(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const warehouse = await WarehouseService.getWarehouse(req.params.warehouseId);
      sendSuccess(res, warehouse, 'Warehouse details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getNearestWarehouse(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { latitude, longitude } = req.query;
      const result = await WarehouseService.getNearestWarehouse({ latitude, longitude });
      sendSuccess(res, result, 'Nearest warehouse retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getInventory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { category, lowStockOnly, page = 1, limit = 50 } = req.query;
      const result = await WarehouseService.getInventory(req.params.warehouseId, { category, lowStockOnly, page, limit });
      sendPaginated(res, result.items, page, limit, result.total, 'Inventory retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async checkAvailability(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { items, warehouseId } = req.body;
      const result = await DispatchService.checkInventoryAvailability(warehouseId, items);
      sendSuccess(res, result, 'Availability checked successfully');
    } catch (error) {
      next(error);
    }
  }

  static async createDispatch(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispatch = await DispatchService.createDispatchRequest(req.body);
      sendSuccess(res, dispatch, 'Dispatch request created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async getDispatchStatus(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispatch = await DispatchService.getDispatchStatus(req.params.dispatchId);
      sendSuccess(res, dispatch, 'Dispatch status retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async trackDispatch(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const tracking = await DispatchService.trackDispatch(req.params.dispatchId);
      sendSuccess(res, tracking, 'Dispatch tracking retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async assignRider(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispatch = await DispatchService.assignRider(req.params.dispatchId, req.body);
      sendSuccess(res, dispatch, 'Rider assigned successfully');
    } catch (error) {
      next(error);
    }
  }

  static async startDelivery(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispatch = await DispatchService.startDelivery(req.params.dispatchId);
      sendSuccess(res, dispatch, 'Delivery started');
    } catch (error) {
      next(error);
    }
  }

  static async updateDeliveryLocation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { latitude, longitude } = req.body;
      const dispatch = await DispatchService.updateLocation(req.params.dispatchId, latitude, longitude);
      sendSuccess(res, dispatch, 'Location updated');
    } catch (error) {
      next(error);
    }
  }

  static async confirmDelivery(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispatch = await DispatchService.confirmDelivery(req.params.dispatchId, req.body);
      sendSuccess(res, dispatch, 'Delivery confirmed successfully');
    } catch (error) {
      next(error);
    }
  }

  static async cancelDispatch(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispatch = await DispatchService.cancelDispatch(req.params.dispatchId, req.body.reason, req.user.id);
      sendSuccess(res, dispatch, 'Dispatch cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getDispatchesByJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispatches = await DispatchService.getDispatchesByJob(req.params.jobId);
      sendSuccess(res, dispatches, 'Dispatches retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getDispatchStats(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { warehouseId, days = 30 } = req.query;
      const stats = await DispatchService.getDispatchStats(warehouseId, days);
      sendSuccess(res, stats, 'Dispatch statistics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getLowStockItems(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const items = await WarehouseService.getLowStockItems(req.params.warehouseId);
      sendSuccess(res, items, 'Low stock items retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getInventoryStats(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const stats = await WarehouseService.getInventoryStats(req.params.warehouseId);
      sendSuccess(res, stats, 'Inventory statistics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = WarehouseController;