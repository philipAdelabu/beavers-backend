const ClientService = require('../services/client.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class ClientController {
  static async getProfile(req, res, next) {
    try {
      const profile = await ClientService.getProfile(req.user.id);
      sendSuccess(res, profile, 'Profile retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve profile', error.statusCode || 500);
      next(error);
    }
  }

  static async updateProfile(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const profile = await ClientService.updateProfile(req.user.id, req.body);
      sendSuccess(res, profile, 'Profile updated successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to update profile', error.statusCode || 500);
      next(error);
    }
  }

  static async uploadDocuments(req, res, next) {
    try {
      const documents = {};
      if (req.files?.ninPhoto) documents.ninPhoto = req.files.ninPhoto[0].path;
      if (req.files?.utilityBill) documents.utilityBill = req.files.utilityBill[0].path;
      if (req.files?.passportPhoto) documents.passportPhoto = req.files.passportPhoto[0].path;
      
      const profile = await ClientService.updateProfile(req.user.id, { verification_documents: documents });
      sendSuccess(res, profile, 'Documents uploaded successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to upload documents', error.statusCode || 500);
      next(error);
    }
  }

  static async getAddresses(req, res, next) {
    try {
      const addresses = await ClientService.getAddresses(req.user.id);
      sendSuccess(res, addresses, 'Addresses retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve addresses', error.statusCode || 500);
      next(error);
    }
  }

  static async addAddress(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const address = await ClientService.addAddress(req.user.id, req.body);
      sendSuccess(res, address, 'Address added successfully', 201);
    } catch (error) {
      sendError(res, error.message || 'Failed to add address', error.statusCode || 500);
      next(error);
    }
  }

  static async updateAddress(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const address = await ClientService.updateAddress(req.params.addressId, req.user.id, req.body);
      sendSuccess(res, address, 'Address updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async deleteAddress(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      await ClientService.deleteAddress(req.params.addressId, req.user.id);
      sendSuccess(res, null, 'Address deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getSavedArtisans(req, res, next) {
    try {
      const artisans = await ClientService.getSavedArtisans(req.user.id);
      sendSuccess(res, artisans, 'Saved artisans retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async saveArtisan(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await ClientService.saveArtisan(req.user.id, req.params.artisanId);
      sendSuccess(res, result, 'Artisan saved successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async removeSavedArtisan(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      await ClientService.removeSavedArtisan(req.user.id, req.params.artisanId);
      sendSuccess(res, null, 'Artisan removed from saved list');
    } catch (error) {
      next(error);
    }
  }

  static async getJobHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, page = 1, limit = 10 } = req.query;
      const result = await ClientService.getJobHistory(req.user.id, { status, page, limit });
      sendPaginated(res, result.jobs, page, limit, result.total, 'Job history retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getStatistics(req, res, next) {
    try {
      const stats = await ClientService.getStatistics(req.user.id);
      sendSuccess(res, stats, 'Statistics retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getPaymentMethods(req, res, next) {
    try {
      const methods = await PaymentService.getPaymentMethods(req.user.id);
      sendSuccess(res, methods, 'Payment methods retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async addPaymentMethod(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const method = await PaymentService.addPaymentMethod(req.user.id, req.body.paymentMethodId, req.body.setAsDefault);
      sendSuccess(res, method, 'Payment method added successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async deletePaymentMethod(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      await PaymentService.deletePaymentMethod(req.params.methodId, req.user.id);
      sendSuccess(res, null, 'Payment method deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  static async setDefaultPaymentMethod(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const method = await PaymentService.setDefaultPaymentMethod(req.params.methodId, req.user.id);
      sendSuccess(res, method, 'Default payment method updated');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ClientController;