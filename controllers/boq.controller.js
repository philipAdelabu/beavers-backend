const BOQService = require('../services/boq.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class BOQController {
  /**
   * Create a new Bill of Quantities (Artisan only)
   * @route POST /api/v1/boq/create/:jobId
   */
  static async createBOQ(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { jobId } = req.params;
      const artisanId = req.user.id;
      
      const boq = await BOQService.createBOQ({
        jobId,
        artisanId,
        items: req.body.items,
        workmanshipCost: req.body.workmanshipCost,
        notes: req.body.notes
      });
      
      sendSuccess(res, boq, 'BOQ created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update BOQ (Artisan only - draft status)
   * @route PUT /api/v1/boq/:boqId
   */
  static async updateBOQ(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId } = req.params;
      const artisanId = req.user.id;
      
      const boq = await BOQService.updateBOQ(boqId, artisanId, req.body);
      sendSuccess(res, boq, 'BOQ updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Submit BOQ for approval (Artisan only)
   * @route POST /api/v1/boq/:boqId/submit
   */
  static async submitBOQ(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId } = req.params;
      const artisanId = req.user.id;
      
      const boq = await BOQService.submitForApproval(boqId, artisanId);
      sendSuccess(res, boq, 'BOQ submitted for approval');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Client approve BOQ
   * @route POST /api/v1/boq/:boqId/client-approve
   */
  static async clientApprove(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId } = req.params;
      const clientId = req.user.id;
      
      const boq = await BOQService.clientApprove(boqId, clientId);
      sendSuccess(res, boq, 'BOQ approved by client');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Client reject BOQ
   * @route POST /api/v1/boq/:boqId/client-reject
   */
  static async clientReject(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId } = req.params;
      const clientId = req.user.id;
      const { reason } = req.body;
      
      const boq = await BOQService.clientReject(boqId, clientId, reason);
      sendSuccess(res, boq, 'BOQ rejected by client');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin approve BOQ
   * @route POST /api/v1/boq/:boqId/admin-approve
   */
  static async adminApprove(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId } = req.params;
      const adminId = req.user.id;
      
      const boq = await BOQService.adminApprove(boqId, adminId);
      sendSuccess(res, boq, 'BOQ approved by admin');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin reject BOQ
   * @route POST /api/v1/boq/:boqId/admin-reject
   */
  static async adminReject(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId } = req.params;
      const adminId = req.user.id;
      const { reason } = req.body;
      
      const boq = await BOQService.adminReject(boqId, adminId, reason);
      sendSuccess(res, boq, 'BOQ rejected by admin');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get BOQ by ID
   * @route GET /api/v1/boq/:boqId
   */
  static async getBOQ(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId } = req.params;
      const userId = req.user.id;
      const userType = req.user.user_type;
      
      const boq = await BOQService.getBOQ(boqId, userId, userType);
      sendSuccess(res, boq, 'BOQ retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get BOQ by Job ID
   * @route GET /api/v1/boq/job/:jobId
   */
  static async getBOQByJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { jobId } = req.params;
      const userId = req.user.id;
      const userType = req.user.user_type;
      
      const boq = await BOQService.getBOQByJob(jobId, userId, userType);
      sendSuccess(res, boq, 'BOQ retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get BOQ history for a job
   * @route GET /api/v1/boq/job/:jobId/history
   */
  static async getBOQHistory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { jobId } = req.params;
      const userId = req.user.id;
      const userType = req.user.user_type;
      
      const history = await BOQService.getBOQHistory(jobId, userId, userType);
      sendSuccess(res, history, 'BOQ history retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Request material substitution (Artisan only)
   * @route POST /api/v1/boq/substitution-request
   */
  static async requestSubstitution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId, itemIndex, alternativeItem, reason } = req.body;
      const artisanId = req.user.id;
      
      const request = await BOQService.requestSubstitution(boqId, artisanId, itemIndex, alternativeItem, reason);
      sendSuccess(res, request, 'Substitution request submitted', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Approve substitution request (Admin only)
   * @route POST /api/v1/boq/substitution/:requestId/approve
   */
  static async approveSubstitution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { requestId } = req.params;
      const adminId = req.user.id;
      
      const result = await BOQService.approveSubstitution(requestId, adminId);
      sendSuccess(res, result, 'Substitution approved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reject substitution request (Admin only)
   * @route POST /api/v1/boq/substitution/:requestId/reject
   */
  static async rejectSubstitution(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { requestId } = req.params;
      const adminId = req.user.id;
      const { reason } = req.body;
      
      const result = await BOQService.rejectSubstitution(requestId, adminId, reason);
      sendSuccess(res, result, 'Substitution rejected');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get substitution requests for admin
   * @route GET /api/v1/boq/substitution-requests
   */
  static async getSubstitutionRequests(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, page = 1, limit = 20 } = req.query;
      const requests = await BOQService.getSubstitutionRequests({ status, page, limit });
      sendPaginated(res, requests.requests, page, limit, requests.total, 'Substitution requests retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get BOQ statistics for admin
   * @route GET /api/v1/boq/statistics
   */
  static async getBOQStatistics(req, res, next) {
    try {
      const stats = await BOQService.getBOQStatistics();
      sendSuccess(res, stats, 'BOQ statistics retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download BOQ as PDF
   * @route GET /api/v1/boq/:boqId/download
   */
  static async downloadBOQ(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { boqId } = req.params;
      const userId = req.user.id;
      const userType = req.user.user_type;
      
      const pdfBuffer = await BOQService.downloadBOQ(boqId, userId, userType);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=boq_${boqId}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BOQController;