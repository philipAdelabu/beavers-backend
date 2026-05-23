const NotificationService = require('../services/notification.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { validationResult } = require('express-validator');

class NotificationController {
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
      next(error);
    }
  }

  static async getUnreadCount(req, res, next) {
    try {
      const count = await NotificationService.getUnreadCount(req.user.id);
      sendSuccess(res, { count }, 'Unread count retrieved successfully');
    } catch (error) {
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
      next(error);
    }
  }

  static async markAllAsRead(req, res, next) {
    try {
      const notifications = await NotificationService.markAllAsRead(req.user.id);
      sendSuccess(res, { count: notifications.length }, 'All notifications marked as read');
    } catch (error) {
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
      next(error);
    }
  }

  static async deleteAllRead(req, res, next) {
    try {
      const deleted = await NotificationService.deleteAllRead(req.user.id);
      sendSuccess(res, { count: deleted.length }, 'Read notifications deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  static async getPreferences(req, res, next) {
    try {
      const preferences = await NotificationService.getNotificationPreferences(req.user.id);
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

  
  static async registerFCMToken(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { fcmToken, deviceInfo } = req.body;
      const result = await NotificationService.registerFCMToken(req.user.id, fcmToken, deviceInfo);
      sendSuccess(res, result, 'FCM token registered successfully');
    } catch (error) {
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
      next(error);
    }
  }
}

module.exports = NotificationController;