const AdminService = require('../services/admin.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');
const AuthService = require('../services/auth.service');
const Payment = require('../services/payment.service');
const EscrowService = require('../services/escrow.service');

class AdminController {


    // ==================== Admin User Management ==================== 
  
  static async getAdminRoles(req, res, next) { 
    try {
      const roles = await AdminService.getAdminRoles();
      sendSuccess(res, roles, 'Admin roles retrieved');
    } catch (error) {
      sendError(res, error.message || 'Fail to get admin roles', error.statusCode || 500);
      next(error);
    }
  }

    static async getAllAdmin(req, res, next) {
    try {
      const roles = await AdminService.getAllAdmin();
      sendSuccess(res, roles, 'Admins retrieved');
    } catch (error) {
      sendError(res, error.message || 'Fail to get admins', error.statusCode || 500);
      next(error);
    }
  }
  
  static async createAdmin(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const admin = await AdminService.createAdmin(req.body);
      sendSuccess(res, admin, 'Admin created', 201);
    } catch (error) {
      sendError(res, error.message || 'Fail to create admin', error.statusCode || 500);
      next(error);
    }
  }

    static async createBasicAdmin(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const admin = await AdminService.createAdmin(req.body);
      sendSuccess(res, admin, 'Admin created', 201);
    } catch (error) {
      sendError(res, error.message || 'Fail to create admin', error.statusCode || 500);
      next(error);
    }
  }
  
  
  static async updateAdminRole(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const result = await AdminService.updateAdminRole(req.params.adminId, req.body.roleId);
      sendSuccess(res, result, 'Admin role updated');
    } catch (error) {
      sendError(res, error.message || 'Fail to update admin role', error.statusCode || 500);
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
         
         const result = await AdminService.login(email, password, ipAddress, userAgent);
         sendSuccess(res, result, 'Login successful');
       } catch (error) {
         sendError(res, error.message || 'Login failed, internal problem.', error.statusCode || 500); 
         next(error);
       }
     }

    static async logout(req, res, next) {
      try {
        const userId = req.user.id;
        const accessToken = req.token || req.headers.authorization?.split(' ')[1];
        const result = await AdminService.logout(userId, accessToken);
        sendSuccess(res, null, result.message);
      } catch (error) {
         sendError(res, error.message || 'Logout failed, internal problem', error.statusCode || 500);
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
      sendError(res, error.message || 'Password reset request failed', error.statusCode || 500);
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
      sendError(res, error.message || 'Password reset failed', error.statusCode || 500);
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
      sendError(res, error.message || 'Password change failed', error.statusCode || 500);
      next(error);
    }
  }
   

  // ==================== Dashboard ====================
  
  static async getDashboardStats(req, res, next) {
    try {
      const stats = await AdminService.getDashboardStats();
      sendSuccess(res, stats, 'Dashboard statistics retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve dashboard statistics', error.statusCode || 500);
      next(error);
    }
  }
  
  static async getDashboardMetrics(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { period = 'month' } = req.query;
      const metrics = await AdminService.getDashboardMetrics(period);
      sendSuccess(res, metrics, 'Dashboard metrics retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve dashboard metrics', error.statusCode || 500);
      next(error);
    }
  }
  
  static async getRealtimeStats(req, res, next) {
    try {
      const stats = await AdminService.getRealtimeStats();
      sendSuccess(res, stats, 'Real-time statistics retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve realtime stats', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== User Management ====================
  
  static async getAllUsers(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { type, status, search, page = 1, limit = 20 } = req.query;
      const result = await AdminService.getAllUsers({ type, status, search, page, limit });
      sendPaginated(res, result.users, page, limit, result.total, 'Users retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve users', error.statusCode || 500);
      next(error);
    }
  }
  
  static async getUserDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const user = await AdminService.getUserDetails(req.params.userId);
      sendSuccess(res, user, 'User details retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve user details', error.statusCode || 500);
      next(error);
    }
  }
  
  static async updateUserStatus(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { isActive } = req.body;
      const user = await AdminService.updateUserStatus(req.params.userId, isActive, req.body.reason);
      sendSuccess(res, user, `User ${isActive ? 'activated' : 'suspended'} successfully`);
    } catch (error) {
      sendError(res, error.message || 'Failed to update user status', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Verification Management ====================
  
  static async getPendingVerifications(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { type, page = 1, limit = 20 } = req.query;
      const result = await AdminService.getPendingVerifications(type, page, limit);
      sendPaginated(res, result.users, page, limit, result.total, 'Pending verifications retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve pending verifications', error.statusCode || 500);
      next(error);
    }
  }
  
  static async verifyUser(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { status, notes, tier } = req.body;
      const result = await AdminService.verifyUser(req.user.id, req.params.userId, status, notes, tier);
      sendSuccess(res, result, `User verification ${status}`);
    } catch (error) {
      sendError(res, error.message || 'Failed to verify user', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Artisan Management ====================
  
  static async updateArtisanTier(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { tier, reason } = req.body;
      const result = await AdminService.updateArtisanTier(req.user.id, req.params.artisanId, tier, reason);
      sendSuccess(res, result, 'Artisan tier updated');
    } catch (error) {
      sendError(res, error.message || 'Failed to update the artisan tier', error.statusCode || 500);
      next(error);
    }
  }
  
  static async getArtisanPerformance(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
     }
    try {
      const performance = await AdminService.getArtisanPerformance(req.params.artisanId);
      sendSuccess(res, performance, 'Artisan performance retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to artisan performance', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Job Management ====================
  
  static async getAllJobs(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { status, category, page = 1, limit = 20, startDate, endDate } = req.query;
      const result = await AdminService.getAllJobs({ status, category, page, limit, startDate, endDate });
      sendPaginated(res, result.jobs, page, limit, result.total, 'Jobs retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to get all jobs', error.statusCode || 500);
      next(error);
    }
  }
  
  static async getJobDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const job = await AdminService.getJobDetails(req.params.jobId);
      sendSuccess(res, job, 'Job details retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve job details', error.statusCode || 500);
      next(error);
    }
  }
  
  static async forceCancelJob(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    try {
      const { reason, refundAmount } = req.body;
      const job = await AdminService.forceCancelJob(req.user.id, req.params.jobId, reason, refundAmount);
      sendSuccess(res, job, 'Job force cancelled');
    } catch (error) {
      sendError(res, error.message || 'Failed to force-cancel job', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Dispute Management ====================
  
  static async getAllDisputes(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const result = await AdminService.getAllDisputes({ status, page, limit });
      sendPaginated(res, result.disputes, page, limit, result.total, 'Disputes retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve disputes', error.statusCode || 500);
      next(error);
    }
  }
   
  static async getDisputeDetails(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const dispute = await AdminService.getDisputeDetails(req.params.disputeId);
      sendSuccess(res, dispute, 'Dispute details retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve dispute details', error.statusCode || 500);
      next(error);
    }
  }
  
  static async resolveDispute(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const resolution = req.body;
      const result = await AdminService.resolveDispute(req.params.disputeId, resolution, req.user.id);
      sendSuccess(res, result, 'Dispute resolved');
    } catch (error) {
      sendError(res, error.message || 'Failed to resolve dispute', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Category Management ====================
  
  static async getCategories(req, res, next) {
    try {
      const categories = await AdminService.getCategories();
      sendSuccess(res, categories, 'Categories retrieved');
    } catch (error) {
      sendError(res, error.message || 'Fail to retrieve all categories', error.statusCode || 500);
      next(error);
    }
  }
  
  static async createCategory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const category = await AdminService.createCategory(req.body, req.user.id);
      sendSuccess(res, category, 'Category created', 201);
    } catch (error) {
      sendError(res, error.message || 'Fail to create new category', error.statusCode || 500);
      next(error);
    }
  }
  
  static async updateCategory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const category = await AdminService.updateCategory(req.params.categoryId, req.body, req.user.id);
      sendSuccess(res, category, 'Category updated');
    } catch (error) {
      sendError(res, error.message || 'Fail to update category', error.statusCode || 500);
      next(error);
    }
  }
  
  static async deleteCategory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const category = await AdminService.deleteCategory(req.params.categoryId, req.user.id);
      sendSuccess(res, category, 'Category deleted');
    } catch (error) {
      sendError(res, error.message || 'Fail to delete category', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Subcategory Management ====================
  
  static async getSubcategories(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { categoryId } = req.query;
      const subcategories = await AdminService.getSubcategories(categoryId);
      sendSuccess(res, subcategories, 'Subcategories retrieved');
    } catch (error) {
     sendError(res, error.message || 'Fail to retreive sub-categories', error.statusCode || 500);
      next(error);
    }
  }
  
  static async createSubcategory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const subcategory = await AdminService.createSubcategory(req.body, req.user.id);
      sendSuccess(res, subcategory, 'Subcategory created', 201);
    } catch (error) {
      sendError(res, error.message || 'Fail to add sub-category', error.statusCode || 500);
      next(error);
    }
  }
  
  static async updateSubcategory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const subcategory = await AdminService.updateSubcategory(req.params.subcategoryId, req.body, req.user.id);
      sendSuccess(res, subcategory, 'Subcategory updated');
    } catch (error) {
    sendError(res, error.message || 'Fail to update sub-category', error.statusCode || 500);
      next(error);
    }
  }
  
  static async deleteSubcategory(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const subcategory = await AdminService.deleteSubcategory(req.params.subcategoryId, req.user.id);
      sendSuccess(res, subcategory, 'Subcategory deleted');
    } catch (error) {
      sendError(res, error.message || 'Fail to delete sub-category', error.statusCode || 500);
      next(error);
    }
  }
  
  
  
  // ==================== System Configuration ====================
  
  static async getSystemConfigurations(req, res, next) {
    try {
      const configs = await AdminService.getSystemConfigurations();
      sendSuccess(res, configs, 'System configurations retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve system configurations', error.statusCode || 500);
      next(error);
    }
  }
  
  static async updateSystemConfiguration(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { key, value } = req.body;
      const config = await AdminService.updateSystemConfiguration(key, value, req.user.id);
      sendSuccess(res, config, 'Configuration updated');
    } catch (error) {
      sendError(res, error.message || 'Failed to update system configuration', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Activity Logs ====================
  
  static async getActivityLogs(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { adminId, action, page = 1, limit = 50, startDate, endDate } = req.query;
      const result = await AdminService.getActivityLogs({ adminId, action, page, limit, startDate, endDate });
      sendPaginated(res, result.logs, page, limit, result.total, 'Activity logs retrieved');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve activity logs', error.statusCode || 500);
      next(error);
    }
  }

    static async getAuditLogs(req, res, next) { 
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'Validation error', 400, errors.array());
      }
  
      try {
        const { entityType, action, userId, startDate, endDate, page = 1, limit = 50 } = req.query;
        const result = await AdminService.getAuditLogs({ entityType, action, userId, startDate, endDate, page, limit });
        sendPaginated(res, result.logs, page, limit, result.total, 'Audit logs retrieved successfully');
      } catch (error) {
        sendError(res, error.message || 'Failed to retrieve audit logs', error.statusCode || 500);
        next(error);
      }
    }
  
  // ==================== Reports ====================
  
  static async generateReport(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const { type, startDate, endDate, format = 'json' } = req.body;
      const report = await AdminService.generateReport(type, { startDate, endDate, format });
      
      if (format === 'json') {
        sendSuccess(res, report.data, 'Report generated');
      } else {
        res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${report.filename}.${format}`);
        res.send(report.data);
      }
    } catch (error) {
      sendError(res, error.message || 'Failed to generate report', error.statusCode || 500);
      next(error);
    }
  }
  
  // ==================== Bulk Notifications ====================
  
  static async sendBulkNotification(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
    
    try {
      const result = await AdminService.sendBulkNotification(req.body);
      sendSuccess(res, result, 'Bulk notification sent');
    } catch (error) {
      sendError(res, error.message || 'Failed to send bulk notification', error.statusCode || 500);
      next(error);
    }
  }


   // ==================== Additional Admin Functions ====================


        static async suspendUser(req, res, next) {
          const errors = validationResult(req);
          if (!errors.isEmpty()) {
            return sendError(res, 'Validation error', 400, errors.array());
          }
          const adminId = req.user.id;
          try {
            const result = await AdminService.suspendUser(adminId, req.params.userId, req.body.reason);
            sendSuccess(res, result, 'User suspended successfully');
          } catch (error) {
            sendError(res, error.message || 'Failed to suspend user', error.statusCode || 500);
            next(error);
          }
        }
      
        static async activateUser(req, res, next) {
          const errors = validationResult(req);
          if (!errors.isEmpty()) {
            return sendError(res, 'Validation error', 400, errors.array());
          }
      
          try {
            const result = await AdminService.activateUser(req.params.userId);
            sendSuccess(res, result, 'User activated successfully');
          } catch (error) {
            sendError(res, error.message || 'Failed to activate user', error.statusCode || 500);
            next(error);
          }
        }


          static async updateFeeConfiguration(req, res, next) {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
              return sendError(res, 'Validation error', 400, errors.array());
            }
        
            try {
              const config = await AdminService.updateFeeConfiguration(req.user.id, req.body);
              sendSuccess(res, config, 'Fee configuration updated successfully');
            } catch (error) {
              sendError(res, error.message || 'Failed to update fee configuration', error.statusCode || 500);
              next(error);
            }
          }
        
      static async getFeeConfiguration(req, res, next) {
            try {
              const config = await AdminService.getSystemConfigurations('platform_fees');
              sendSuccess(res, config, 'Fee configuration retrieved successfully');
            } catch (error) {
              sendError(res, error.message || 'Failed to retrieve fee configuration', error.statusCode || 500);
              next(error);
            }
         } 
      
        static async getSystemHealth(req, res, next) {
          try {
            const health = await AdminService.getSystemHealth();
            sendSuccess(res, health, 'System health check completed');
          } catch (error) {
            sendError(res, error.message || 'Failed to retrieve system health', error.statusCode || 500);
            next(error);
          }
        }


    static async getPaymentAnalytics(req, res, next){
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return sendError(res, 'Validation error', 400, errors.array());
        }

        try {
          const { period = 'month' } = req.query;
          const analytics = await Payment.getAnalytics(period);
          sendSuccess(res, analytics, 'Payment analytics retrieved');
        } catch (error) {
          sendError(res, error.message || 'Failed to retrieve payment analytics', error.statusCode || 500);
          next(error);
        }
      }

      // ==================== Payment Management ====================

static async getAllPayments(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { status, clientId, artisanId, jobId, page = 1, limit = 20, startDate, endDate } = req.query;
    const result = await AdminService.getAllPayments({ 
      status, clientId, artisanId, jobId, page, limit, startDate, endDate 
    });
    sendPaginated(res, result.payments, page, limit, result.total, 'Payments retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve all the client payments', error.statusCode || 500);
    next(error);
  }
}

static async getPaymentDetails(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const payment = await AdminService.getPaymentDetails(req.params.paymentId);
    sendSuccess(res, payment, 'Payment details retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve all the client payment details', error.statusCode || 500);
    next(error);
  }
}

static async processRefund(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { refundId } = req.params;
    const { notes } = req.body;
    const result = await AdminService.processRefund(refundId, req.user.id, notes);
    sendSuccess(res, result, 'Refund processed');
  } catch (error) {
    sendError(res, error.message || 'Failed to process refund', error.statusCode || 500);
    next(error);
  }
}

static async getAllRefunds(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { status, jobId, page = 1, limit = 20, startDate, endDate } = req.query;
    const result = await AdminService.getAllRefunds({ status, jobId, page, limit, startDate, endDate });
    sendPaginated(res, result.refunds, page, limit, result.total, 'Refunds retrieved');
  } catch (error) {
     sendError(res, error.message || 'Failed to retrieve all refunds', error.statusCode || 500);
    next(error);
  }
}

// ==================== BOQ Management ====================

static async getAllBOQs(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { status, jobId, artisanId, page = 1, limit = 20, startDate, endDate } = req.query;
    const result = await AdminService.getAllBOQs({ status, jobId, artisanId, page, limit, startDate, endDate });
    sendPaginated(res, result.boqs, page, limit, result.total, 'BOQs retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve all the BOQ', error.statusCode || 500);
    next(error);
  }
}

static async getBOQDetails(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const boq = await AdminService.getBOQDetails(req.params.boqId);
    sendSuccess(res, boq, 'BOQ details retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve BOQ details', error.statusCode || 500);
    next(error);
  }
}

static async adminApproveBOQ(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { boqId } = req.params;
    const { notes } = req.body;
    const result = await AdminService.adminApproveBOQ(boqId, req.user.id, notes);
    sendSuccess(res, result, 'BOQ approved');
  } catch (error) {
    sendError(res, error.message || 'Failed to approve BOQ', error.statusCode || 500);
    next(error);
  }
}

static async adminRejectBOQ(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { boqId } = req.params;
    const { reason } = req.body;
    const result = await AdminService.adminRejectBOQ(boqId, req.user.id, reason);
    sendSuccess(res, result, 'BOQ rejected');
  } catch (error) {
   sendError(res, error.message || 'Failed to reject BOQ', error.statusCode || 500);
    next(error);
  }
}

// ==================== Settlement Management ====================

static async getAllSettlements(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { status, artisanId, page = 1, limit = 20, startDate, endDate } = req.query;
    const result = await AdminService.getAllSettlements({ status, artisanId, page, limit, startDate, endDate });
    sendPaginated(res, result.settlements, page, limit, result.total, 'Settlements retrieved');
  } catch (error) {
    sendError(res, error.message || 'Fail to get all settlement', error.statusCode || 500);
    next(error);
  }
}

static async settlementDetail(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { payoutId } = req.params;
    const result = await AdminService.settlementDetail(payoutId);
    sendSuccess(res, result, 'Settlement processed');
  } catch (error) {
    sendError(res, error.message || 'Fail to get settlement detail', error.statusCode || 500);
    next(error);
  }
}



static async processSettlementByJobId(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { jobId } = req.params;
    const { transferReference } = req.body;
    const result = await AdminService.processSettlement(jobId, 'jobId', req.user.id, transferReference);
    sendSuccess(res, result, 'Settlement processed');
  } catch (error) {
    sendError(res, error.message || 'Failed to process settlement', error.statusCode || 500);
    next(error);
  }
}

static async processSettlementByArtisanId(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { artisanId } = req.params;
    const { transactionId } = req.body;
    const result = await AdminService.processSettlement(artisanId, 'artisanId', req.user.id, transactionId);
    sendSuccess(res, result, 'Settlement processed');
  } catch (error) {
    sendError(res, error.message || 'Fail to complete settlement', error.statusCode || 500);
    next(error);
  }
}

static async processSettlementByPayoutId(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const {  payoutId } = req.params;
    const { transactionId } = req.body;
    const result = await AdminService.processSettlement(payoutId, 'payoutId', req.user.id, transactionId);
    sendSuccess(res, result, 'Settlement processed');
  } catch (error) {
    sendError(res, error.message || 'Fail to complete settlement', error.statusCode || 500);
    next(error);
  }
}

static async failSettlement(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { payoutId } = req.params;
    const { reason } = req.body;
    const result = await AdminService.failSettlement(payoutId, req.user.id, reason);
    sendSuccess(res, result, 'Settlement failed');
  } catch (error) {
    sendError(res, error.message || 'Failed to process settlement', error.statusCode || 500);
    next(error);
  }
}

// ==================== Withdrawal Management ====================

static async getAllWithdrawals(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { status, artisanId, page = 1, limit = 20, startDate, endDate } = req.query;
    const result = await AdminService.getAllWithdrawals({ status, artisanId, page, limit, startDate, endDate });
    sendPaginated(res, result.withdrawals, page, limit, result.total, 'Withdrawals retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve all withdrawals', error.statusCode || 500);
    next(error);
  }
}

static async processWithdrawal(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { withdrawalId } = req.params;
    const { action, notes } = req.body;
    const result = await AdminService.processWithdrawal(withdrawalId, req.user.id, action, notes);
    sendSuccess(res, result, `Withdrawal ${action}d`);
  } catch (error) {
    sendError(res, error.message || 'Failed to process withdrawal', error.statusCode || 500);
    next(error);
  }
}

// ==================== Escrow Management ==================== 

static async getAllEscrowTransactions(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { status, jobId, page = 1, limit = 20, startDate, endDate } = req.query;
    const result = await AdminService.getAllEscrowTransactions({ status, jobId, page, limit, startDate, endDate });
    sendPaginated(res, result.transactions, page, limit, result.total, 'Escrow transactions retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to get all escrow transactions', error.statusCode || 500);
    next(error);
  }
}

static async releaseFundEscrow(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;
    const result = await EscrowService.releaseEscrowHoldFund(transactionId, reason, req.user.id);
    sendSuccess(res, result, 'Fund Escrow released');
  } catch (error) {
    sendError(res, error.message || 'Failed to release escrow funds', error.statusCode || 500);
    next(error);
  }
}

 static async releaseFrozenEscrow(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;
    const result = await AdminService.releaseFrozenEscrow(transactionId, reason, req.user.id);
    sendSuccess(res, result, 'Frozen escrow released');
  } catch (error) {
    sendError(res, error.message || 'Failed to release frozen escrow transactions', error.statusCode || 500);
    next(error);
  }
}


static async freezeFunds(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;
    const result = await EscrowService.freezeFunds(transactionId, reason, req.user.id);
    sendSuccess(res, result, 'Freeze  Funds');
  } catch (error) {
    sendError(res, error.message || 'Failed to freeze escrow funds', error.statusCode || 500);
    next(error);
  }
}

static async freezeJobFunds(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {

    const { jobId } = req.params;
    const { reason } = req.body;

    const result = await EscrowService.freezeJobFunds(jobId, reason, req.user.id);
    sendSuccess(res, result, 'Freeze Job Funds');
  } catch (error) {
    sendError(res, error.message || 'Failed to freeze job funds', error.statusCode || 500);
    next(error);
  }
}



 static async releaseJobFunds(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
    const { jobId } = req.params;
    const { reason } = req.body;

    const result = await EscrowService.releaseJobFunds(jobId, reason, req.user.id);
    sendSuccess(res, result, 'Freeze Escrow Funds');
  } catch (error) {
    sendError(res, error.message || 'Failed to release job funds', error.statusCode || 500);
    next(error);
  }
}

static async getEscrowSummary(req, res, next) {
  try {
    const summary = await AdminService.getEscrowSummary();
    sendSuccess(res, summary, 'Escrow summary retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to get the escrow summary', error.statusCode || 500);
    next(error);
  }
} 

static async getJobEscrowBalance(req, res, next) {
    const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }
  
  try {
     const { jobId } = req.params;
    const summary = await EscrowService.getBalance(jobId)
    sendSuccess(res, summary, 'Escrow summary retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to get the escrow balance', error.statusCode || 500);
    next(error);
  }
}  

static async getPendingDisbursements(req, res, next) {
  try {
    const summary = await EscrowService.getPendingEscrowDisbursements();
    sendSuccess(res, summary, 'Escrow summary retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to get the pending disbursement', error.statusCode || 500);
    next(error);
  }
} 

static async getPendingArtisanDisbursements(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
   }
  
  try {
    const {artisanId} = req.params
    const summary = await EscrowService.getPendingDEscrowisbursementByArtisanId(artisanId);
    sendSuccess(res, summary, 'Artisan Escrow summary retrieved');
  } catch (error) {
    sendError(res, error.message || 'Failed to get the pending disbursement', error.statusCode || 500);
    next(error);
  }
} 


static async processJobPendingDisbursement(req, res, next){
     const errors = validationResult(req);
    if(!errors.isEmpty()){
       return sendError(res, 'Validation error', 400, errors.array());
    }
    try{
     const  jobId  = req.params.jobId;
     const result = await EscrowService.processJobPendingDisbursement(jobId, req.user.id);
     return sendSuccess(res, result, 'Job Ecrow Disbursement Released');
    }catch(error){
      sendError(res, error.message || 'Failed to process job pending disbursement', error.statusCode || 500);
      next(error);
    }
}

static async processJobPendingDisbursementByArtisanId(req, res, next){
     const errors = validationResult(req);
    if(!errors.isEmpty()){
       return sendError(res, 'Validation error', 400, errors.array());
    }
    try{
     const { artisanId } = req.params;
     const result = await EscrowService.processJobPendingDisbursementByArtisanId(artisanId, req.user.id);
     return sendSuccess(res, result, 'Job Ecrow Disbursement Released');
    }catch(error){
       sendError(res, error.message || 'Failed to disburse Job Pending Fund', error.statusCode || 500);
       next(error);
    }
}

static async processJobPendingDisbursementByEscrowId(req, res, next){
     const errors = validationResult(req);
    if(!errors.isEmpty()){
       return sendError(res, 'Validation error', 400, errors.array());
    }
    try{
     const { escrowId } = req.params;
     const result = await EscrowService.processJobPendingDisbursementByEscrowId(escrowId, req.user.id);
     return sendSuccess(res, result, 'Job Ecrow Disbursement Released');
    }catch(error){
       sendError(res, error.message || 'Failed to disburse Job Pending Fund', error.statusCode || 500);
       next(error);
    }
}

static async processAllJobPendingDisbursement(req, res, next){
     const errors = validationResult(req);
    if(!errors.isEmpty()){
       return sendError(res, 'Validation error', 400, errors.array());
    }
    try{
     const result = await EscrowService.processAllJobPendingDisbursement(req.user.id);
     return sendSuccess(res, result, 'Job Ecrow Disbursement Released');
    }catch(error){
       sendError(res, error.message || 'Failed to disburse Job Pending Fund', error.statusCode || 500);
       next(error);
    }
}


 static async getTransactionHistory(req, res, next) {
        const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
   }
  try {
    const summary = await EscrowService.getTransactionHistory(req.params);
    sendSuccess(res, summary, 'Escrow summary retrieved');
   } catch (error) {
    sendError(res, error.message || 'Failed to get the escrow transactoins history', error.statusCode || 500);
    next(error);
   }
 } 

 static async initiateFunds(req, res, next){
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
   }  
   try{
    const { escrowTransactionId } = req.params;
    const { reason } = req.body;
    const result = await EscrowService.initiateFunds(escrowTransactionId, reason, req.user.id);
    sendSuccess(res, result, 'Refund inititated');
   }catch(error){
    sendError(res, error.message || 'Failed to initiate refund escrow funds', error.statusCode || 500);
    next(error);
   }
 }

}

module.exports = AdminController;