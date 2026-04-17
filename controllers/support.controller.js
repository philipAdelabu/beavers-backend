const SupportService = require('../services/support.service');
const DisputeService = require('../services/dispute.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class SupportController {
  static async createTicket(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const ticket = await SupportService.createTicket({
        userId: req.user.id,
        ...req.body
      });
      sendSuccess(res, ticket, 'Support ticket created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async getUserTickets(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, page = 1, limit = 20 } = req.query;
      const result = await SupportService.getUserTickets(req.user.id, { status, page, limit });
      sendPaginated(res, result.tickets, page, limit, result.total, 'Tickets retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getTicketDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const ticket = await SupportService.getTicketDetails(req.params.ticketId, req.user.id, req.user.user_type);
      sendSuccess(res, ticket, 'Ticket details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async replyToTicket(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const reply = await SupportService.addReply(req.params.ticketId, req.user.id, req.body.message, req.body.attachments);
      sendSuccess(res, reply, 'Reply added successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async closeTicket(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const ticket = await SupportService.closeTicket(req.params.ticketId, req.user.id, req.user.user_type);
      sendSuccess(res, ticket, 'Ticket closed successfully');
    } catch (error) {
      next(error);
    }
  }

  static async createDispute(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispute = await DisputeService.createDispute({
        jobId: req.body.jobId,
        clientId: req.user.id,
        reason: req.body.reason,
        description: req.body.description,
        evidence: req.body.evidence
      });
      sendSuccess(res, dispute, 'Dispute created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async getUserDisputes(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { status, page = 1, limit = 20 } = req.query;
      let result;
      
      if (req.user.user_type === 'client') {
        result = await DisputeService.getDisputesByClient(req.user.id, { status, page, limit });
      } else if (req.user.user_type === 'artisan') {
        result = await DisputeService.getDisputesByArtisan(req.user.id, { status, page, limit });
      } else {
        result = await DisputeService.getAllDisputes({ status, page, limit });
      }
      
      sendPaginated(res, result.disputes, page, limit, result.total, 'Disputes retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getDisputeDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispute = await DisputeService.getDisputeDetails(req.params.disputeId, req.user.id, req.user.user_type);
      sendSuccess(res, dispute, 'Dispute details retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async addDisputeMessage(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const message = await DisputeService.addMessage(req.params.disputeId, req.user.id, req.body.message, req.body.attachments);
      sendSuccess(res, message, 'Message added successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  static async getDisputeMessages(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const messages = await DisputeService.getMessages(req.params.disputeId, req.user.id, req.user.user_type);
      sendSuccess(res, messages, 'Messages retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async cancelDispute(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const dispute = await DisputeService.cancelDispute(req.params.disputeId, req.user.id);
      sendSuccess(res, dispute, 'Dispute cancelled successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getFAQs(req, res, next) {
    try {
      const faqs = await SupportService.getFAQs();
      sendSuccess(res, faqs, 'FAQs retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getContactInfo(req, res, next) {
    try {
      const contact = await SupportService.getContactInfo();
      sendSuccess(res, contact, 'Contact information retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SupportController;