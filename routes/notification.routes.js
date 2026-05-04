const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth.middleware');
const Notification = require('../models/Notification');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const NotificationService = require('../services/notification.service');




// Register FCM token
router.post('/register-device', authenticateToken, [
  body('fcmToken').notEmpty().withMessage('FCM token is required'),
  body('platform').isIn(['ios', 'android', 'web']).withMessage('Platform must be ios, android, or web'),
  body('deviceId').optional().isString(),
  body('deviceName').optional().isString(),
  body('deviceModel').optional().isString(),
  body('osVersion').optional().isString(),
  body('appVersion').optional().isString()
], async (req, res, next) => {
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
    
    sendSuccess(res, device, 'Device registered successfully');
  } catch (error) {
    next(error);
  }
});

// Unregister FCM token (logout)
router.post('/unregister-device', authenticateToken, [
  body('fcmToken').notEmpty().withMessage('FCM token is required')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    await NotificationService.unregisterFCMToken(req.user.id, req.body.fcmToken);
    sendSuccess(res, null, 'Device unregistered successfully');
  } catch (error) {
    next(error);
  }
});

// Get user devices
router.get('/devices', authenticateToken, async (req, res, next) => {
  try {
    const devices = await NotificationService.getUserDevices(req.user.id);
    sendSuccess(res, devices, 'Devices retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// ... rest of notification routes


// Get user notifications
router.get('/', authenticateToken, [
  query('isRead').optional().isBoolean(),
  query('type').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { isRead, type, page = 1, limit = 20 } = req.query;
    const result = await Notification.findByUserId(req.user.id, { isRead, type, page, limit });
    sendPaginated(res, result.notifications, page, limit, result.total, 'Notifications retrieved');
  } catch (error) {
    next(error);
  }
});

// Get unread count
router.get('/unread/count', authenticateToken, async (req, res, next) => {
  try {
    const count = await Notification.getUnreadCount(req.user.id);
    sendSuccess(res, { count }, 'Unread count retrieved');
  } catch (error) {
    next(error);
  }
});

// Mark notification as read
router.put('/:notificationId/read', authenticateToken, [
  param('notificationId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const notification = await Notification.markAsRead(req.params.notificationId, req.user.id);
    if (!notification) {
      throw new AppError(404, 'Notification not found');
    }
    sendSuccess(res, notification, 'Notification marked as read');
  } catch (error) {
    next(error);
  }
});

// Mark all as read
router.put('/read-all', authenticateToken, async (req, res, next) => {
  try {
    const notifications = await Notification.markAllAsRead(req.user.id);
    sendSuccess(res, { count: notifications.length }, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
});

// Delete notification
router.delete('/:notificationId', authenticateToken, [
  param('notificationId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const deleted = await Notification.deleteNotification(req.params.notificationId, req.user.id);
    if (!deleted) {
      throw new AppError(404, 'Notification not found');
    }
    sendSuccess(res, null, 'Notification deleted');
  } catch (error) {
    next(error);
  }
});

// Delete all read notifications
router.delete('/read/all', authenticateToken, async (req, res, next) => {
  try {
    const deleted = await Notification.deleteAllRead(req.user.id);
    sendSuccess(res, { count: deleted.length }, 'Read notifications deleted');
  } catch (error) {
    next(error);
  }
});

// Get notification preferences
router.get('/preferences', authenticateToken, async (req, res, next) => {
  try {
    const preferences = await Notification.getNotificationPreferences(req.user.id);
    sendSuccess(res, preferences, 'Preferences retrieved');
  } catch (error) {
    next(error);
  }
});

// Update notification preferences
router.put('/preferences', authenticateToken, [
  body('email').optional().isBoolean(),
  body('sms').optional().isBoolean(),
  body('push').optional().isBoolean()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const preferences = await Notification.updatePreferences(req.user.id, req.body);
    sendSuccess(res, preferences, 'Preferences updated');
  } catch (error) {
    next(error);
  }
});

// Get notifications by type
router.get('/types/:type', authenticateToken, [
  param('type').isString(),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { limit = 20 } = req.query;
    const notifications = await Notification.getByType(req.user.id, req.params.type, limit);
    sendSuccess(res, notifications, 'Notifications by type retrieved');
  } catch (error) {
    next(error);
  }
});

module.exports = router;