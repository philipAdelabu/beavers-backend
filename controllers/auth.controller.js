const AuthService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class AuthController {
  static async registerClient(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await AuthService.registerClient(req.body);
      sendSuccess(res, result.user, result.message, 201);
    } catch (error) {
      next(error);
    }
  }

  static async registerArtisan(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const result = await AuthService.registerArtisan(req.body);
      sendSuccess(res, result.user, result.message, 201);
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { email, password } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');
      
      const result = await AuthService.login(email, password, ipAddress, userAgent);
      sendSuccess(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  static async logout(req, res, next) {
    try {
      const result = await AuthService.logout(req.user.id, req.token);
      sendSuccess(res, null, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async refreshToken(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { refreshToken } = req.body;
      const result = await AuthService.refreshToken(refreshToken);
      sendSuccess(res, result, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  }

  static async verifyEmail(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { email, otp } = req.body;
      const result = await AuthService.verifyEmail(email, otp);
      sendSuccess(res, null, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async verifyPhone(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { phone, otp } = req.body;
      const result = await AuthService.verifyPhone(phone, otp);
      sendSuccess(res, null, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async sendVerificationCode(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { email } = req.body;
      const result = await AuthService.sendVerificationCode(email);
      sendSuccess(res, null, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async forgotPassword(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { email } = req.body;
      const result = await AuthService.forgotPassword(email);
      sendSuccess(res, null, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { token, newPassword } = req.body;
      const result = await AuthService.resetPassword(token, newPassword);
      sendSuccess(res, null, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async changePassword(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { currentPassword, newPassword } = req.body;
      const result = await AuthService.changePassword(req.user.id, currentPassword, newPassword);
      sendSuccess(res, null, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async getMe(req, res, next) {
    try {
      sendSuccess(res, req.user, 'User profile retrieved');
    } catch (error) {
      next(error);
    }
  }

  static async validateSession(req, res, next) {
    try {
      const isValid = await AuthService.validateSession(req.user.id, req.token);
      sendSuccess(res, { valid: isValid }, 'Session validated');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;