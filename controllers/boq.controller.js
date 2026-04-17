const BOQService = require('../services/boq.service');
const { sendSuccess, sendError } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class BOQController {
  static async createBOQ(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const boq = await BOQService.createBOQ({
        jobId: req.params.jobId,
        artisanId: req.user.id,
        items: req.body.items,
        workmanshipCost: req.body.workmanshipCost,
        notes: req.body.notes
      });
      sendSuccess(res, boq, 'BOQ created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateBOQ(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const boq = await BOQService.updateBOQ(req.params.boqId, req.user.id, req.body);
      sendSuccess(res, boq, 'BOQ updated successfully');
    } catch (error) {
      next(error);
    }
  }

  static async submitBOQ(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const boq = await BOQService.submitForApproval(req.params.boqId, req.user.id);
      sendSuccess(res, boq, 'BOQ submitted for approval');
    } catch (error) {
      next(error);
    }
  }

  static async clientApprove(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const boq = await BOQService.clientApprove(req.params.boqId, req.user.id);
      sendSuccess(res, boq, 'BOQ approved by client');
    } catch (error) {
      next(error);
    }
  }

  static async clientReject(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const boq = await BOQService.clientReject(req.params.boqId, req.user.id, req.body.reason);
      sendSuccess(res, boq, 'BOQ rejected by client');
    } catch (error) {
      next(error);
    }
  }

  static async adminApprove(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const boq = await BOQService.adminApprove(req.params.boqId, req.user.id);
      sendSuccess(res, boq, 'BOQ approved by admin');
    } catch (error) {
      next(error);
    }
  }

  static async getBOQ(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const boq = await BOQService.getBOQ(req.params.boqId, req.user.id, req.user.user_type);
      sendSuccess(res, boq, 'BOQ retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getBOQByJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const boq = await BOQService.getBOQByJob(req.params.jobId, req.user.id, req.user.user_type);
      sendSuccess(res, boq, 'BOQ retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getBOQHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const history = await BOQService.getBOQHistory(req.params.jobId, req.user.id, req.user.user_type);
      sendSuccess(res, history, 'BOQ history retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async requestSubstitution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId, itemIndex, alternativeItem, reason } = req.body;
      const request = await BOQService.requestSubstitution(boqId, req.user.id, itemIndex, alternativeItem, reason);
      sendSuccess(res, request, 'Substitution request submitted', 201);
    } catch (error) {
      next(error);
    }
  }

  static async approveSubstitution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await BOQService.approveSubstitution(req.params.requestId, req.user.id);
      sendSuccess(res, result, 'Substitution approved');
    } catch (error) {
      next(error);
    }
  }

  static async rejectSubstitution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await BOQService.rejectSubstitution(req.params.requestId, req.user.id, req.body.reason);
      sendSuccess(res, result, 'Substitution rejected');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BOQController;