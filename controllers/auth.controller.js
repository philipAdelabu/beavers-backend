const AuthService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../utils/response');
const { getFileUrl, deleteFile } = require('../config/multer');
const { validationResult } = require('express-validator');
const fs = require('fs');

class AuthController {
  static async registerClient(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Clean up uploaded files if validation fails
        if(req.files){
          for(const field of Object.values(req.files)){
            for(const file of field){
               if(fs.existsSync(file.path)){
                fs.unlinkSync(file.path);
               }
            }
          }
        }
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {

       // Process uploaded files and get their URLs
       const uploadedFiles = {};
       if(req.files){
         if(req.files.ninPhoto){
           uploadedFiles.ninPhoto =  getFileUrl(req.files.ninPhoto[0].path);
         }
         if(req.files.passportPhoto){
           uploadedFiles.passportPhoto =  getFileUrl(req.files.passportPhoto[0].path);
         }
       }

      const result = await AuthService.registerClient(req.body, uploadedFiles);
      sendSuccess(res, result.user, result.message, 201);
    } catch (error) {
      // Clean up uploaded files on error
      if (req.files) {
        for (const field of Object.values(req.files)) {
          for (const file of field) {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          }
        }
      }
      sendError(res, error.message || 'Registration failed', error.statusCode || 500);  
      next(error);
    }

  }

  static async registerArtisan(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
       // Clean up uploaded files if validation fails
      if (req.files) {
        for (const field of Object.values(req.files)) {
          for (const file of field) {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          }
        }
      }
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
            // Process uploaded files
      const uploadedFiles = {};
      
      if (req.files) {
        if (req.files.passportPhoto) {
          uploadedFiles.passportPhoto = getFileUrl(req.files.passportPhoto[0].path);
        }
        if (req.files.ninPhoto) {
          uploadedFiles.ninPhoto = getFileUrl(req.files.ninPhoto[0].path);
        }
        if (req.files.certificates) {
          uploadedFiles.certificates = req.files.certificates.map(f => getFileUrl(f.path));
        }
        if (req.files.tradeTestimony) {
          uploadedFiles.tradeTestimony = req.files.tradeTestimony.map(f => getFileUrl(f.path));
        }
      }
      const result = await AuthService.registerArtisan(req.body, uploadedFiles);
      sendSuccess(res, result.user, result.message, 201);
    } catch (error) {
            // Clean up uploaded files on error
      if (req.files) {
        for (const field of Object.values(req.files)) {
          for (const file of field) {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          }
        }
      }
      sendError(res, error.message || 'Registration failed', error.statusCode || 500); 
      next(error);
    }
  }

  
  static async login(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { identifier, password } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');
      
      const result = await AuthService.login(identifier, password, ipAddress, userAgent);
      sendSuccess(res, result, 'Login successful');
    } catch (error) {
      sendError(res, error.message || 'Login failed, internal problem.', error.statusCode || 500); 
      next(error);
    }
  }

  static async requestOTP(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { phone } = req.body;
      const result = await AuthService.requestOTP(phone);
      sendSuccess(res, null, result.message);
    } catch (error) {
       sendError(res, error.message || 'OTP request failed', error.statusCode || 500); 
      next(error);
    }
  }

  static async loginWithOTP(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { phone, otp } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');
      
      const result = await AuthService.loginWithOTP(phone, otp, ipAddress, userAgent);
      sendSuccess(res, result, 'Login successful');
    } catch (error) {
      sendError(res, error.message || 'Login failed', error.statusCode || 500);
      next(error);
    }
  }

  
  /**
   * Logout from current device
   * @route POST /api/v1/auth/logout
   */
  static async logout(req, res, next) {
    try {
      const userId = req.user.id;
      const accessToken = req.token || req.headers.authorization?.split(' ')[1];
      const result = await AuthService.logout(userId, accessToken);
      sendSuccess(res, null, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout from all devices
   * @route POST /api/v1/auth/logout-all
   */
  static async logoutAll(req, res, next) {
    try {
      const userId = req.user.id;
      const accessToken = req.token || req.headers.authorization?.split(' ')[1];
      const result = await AuthService.logoutAllDevices(userId, accessToken);
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
      sendError(res, error.message || 'Token refresh failed', error.statusCode || 500);
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
       sendError(res, error.message || 'Verification failled', error.statusCode || 500); 
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
      sendError(res, error.message || 'Verification failled', error.statusCode || 500); 
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
