const NotificationService = require('../services/notification.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');



class NotificationController {

   static getInitLog(req){
        return {
           ipAddress: req.ip,
           userAgent: req.get('user-agent'),
        }
   }
  
    static async registerFCMToken(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
     const { fcmToken, platform, deviceId, deviceName, deviceModel, osVersion, appVersion } = req.body;
       
    const device = await NotificationService.registerFCMToken(
      req.user.id,
      fcmToken,
      { deviceId, deviceName, deviceModel, osVersion, appVersion, platform }
    );
    
      sendSuccess(res, device, 'FCM token registered successfully');
    } catch (error) {
      sendError(res, error.message || 'Device fail to register for notification', error.statusCode || 500);
      next(error);
    }
  }

  static async unregisterFCMToken(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { fcmToken } = req.body;
      const result = await NotificationService.unregisterFCMToken(req.user.id, fcmToken);
      sendSuccess(res, result, 'FCM token unregistered successfully');
    } catch (error) {
      sendError(res, error.message || 'fail to  unregister user notification FCM', error.statusCode || 500);
      next(error);
    }
  }

   static async getUserDevices(req, res, next) {
    try {
    const devices = await NotificationService.getUserDevices(req.user.id);
    sendSuccess(res, devices, 'Devices retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to retrieve user devices', error.statusCode || 500);
      next(error);
    }
  }

  static async getUserNotifications(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { isRead, type, page = 1, limit = 20 } = req.query;
      const result = await NotificationService.getNotificationHistory(req.user.id, { isRead, type, page, limit });
      sendPaginated(res, result.notifications, page, limit, result.total, 'Notifications retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to retrieve user notifications', error.statusCode || 500);
      next(error);
    }
  }

   static async sendNotification(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }
  
    try{
      const { title, body, data = {}, options = {} } = req.body;
    const results = await NotificationService.sendNotification(
      req.user.id,
      title,
      body,
      data,
      options
    );
      sendSuccess(res, results, 'Notification sent successfully');
    } catch (error) {
     sendError(res, error.message || 'Fail to send notification', error.statusCode || 500);
      next(error);
    }
  }


  static async getUnreadCount(req, res, next) {
    try {
      const count = await NotificationService.getUnreadCount(req.user.id);
      sendSuccess(res, { count }, 'Unread count retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to retrieve unread notification counts', error.statusCode || 500);
      next(error);
    }
  }

  static async markAsRead(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const notification = await NotificationService.markAsRead(req.params.notificationId, req.user.id);
      if (!notification) {
        throw new AppError(404, 'Notification not found');
      }
      sendSuccess(res, notification, 'Notification marked as read');
    } catch (error) {
      sendError(res, error.message || 'Fail to mark as read', error.statusCode || 500);
      next(error);
    }
  }

  static async markAllAsRead(req, res, next) {
    try {
      const notifications = await NotificationService.markAllAsRead(req.user.id);
      sendSuccess(res, { count: notifications.length }, 'All notifications marked as read');
    } catch (error) {
      sendError(res, error.message || 'Fail to mark as read', error.statusCode || 500);
      next(error);
    }
  }

  static async deleteNotification(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const deleted = await NotificationService.deleteNotification(req.params.notificationId, req.user.id);
      if (!deleted) {
        throw new AppError(404, 'Notification not found');
      }
      sendSuccess(res, null, 'Notification deleted successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to delete notification', error.statusCode || 500);
      next(error);
    }
  }

  static async deleteAllRead(req, res, next) {
    try {
      const deleted = await NotificationService.deleteAllRead(req.user.id);
      sendSuccess(res, { count: deleted.length }, 'Read notifications deleted successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to delete notifications', error.statusCode || 500);
      next(error);
    }
  }

    static async deleteAll(req, res, next) {
    try {
      const deleted = await NotificationService.deleteAll(req.user.id);
      sendSuccess(res, { count: deleted.length }, 'All notifications deleted successfully');
    } catch (error) {
      sendError(res, error.message || 'Fail to delete notifications', error.statusCode || 500);
      next(error);
    }
  }

  static async getPreferences(req, res, next) {
    try {
      const preferences = await NotificationService.getPreferences(req.user.id);
      sendSuccess(res, preferences, 'Preferences retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  static async updatePreferences(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const preferences = await NotificationService.updatePreferences(req.user.id, req.body);
      sendSuccess(res, preferences, 'Preferences updated successfully');
    } catch (error) {
      next(error);
    }
  }

   static async getByType(req, res, next) {
    try {
      const preferences = await NotificationService.getByType(req.user.id);
      sendSuccess(res, preferences, 'Preferences retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
  

}

module.exports = NotificationController;