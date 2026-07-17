const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const Notification = require('../models/Notification');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const NotificationController = require('../controllers/notification.controller');
const NotificationService = require('../services/notification.service');


// Register FCM token
router.post('/devices/register', authenticateToken, [
  body('fcmToken').notEmpty().withMessage('FCM token is required'),
  body('platform').isIn(['ios', 'android', 'web']).withMessage('Platform must be ios, android, or web'),
  body('deviceId').optional().isString(),
  body('deviceName').optional().isString(),
  body('deviceModel').optional().isString(),
  body('osVersion').optional().isString(),
  body('appVersion').optional().isString()
], NotificationController.registerFCMToken);


// Unregister FCM token (logout)
router.post('/devices/unregister', authenticateToken, [
  body('fcmToken').notEmpty().withMessage('FCM token is required')
], NotificationController.unregisterFCMToken);


// Get user devices
router.get('/devices', authenticateToken, NotificationController.getUserDevices);

// Get notification preferences
router.get('/preferences', authenticateToken, NotificationController.getPreferences);

// Update notification preferences
router.put('/preferences', authenticateToken, [
  body('email').optional().isBoolean(),
  body('sms').optional().isBoolean(),
  body('push').optional().isBoolean()
], NotificationController.updatePreferences);


// Get user notifications
router.get('/history', authenticateToken, [
  query('isRead').optional().isBoolean(),
  query('type').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], NotificationController.getUserNotifications);

// Get unread count
router.get('/unread/count', authenticateToken, NotificationController.getUnreadCount);

// Mark notification as read
router.put('/:notificationId/read', authenticateToken, [
  param('notificationId').isUUID()
], NotificationController.markAsRead);

// Delete notification
router.delete('/:notificationId', authenticateToken, [
  param('notificationId').isUUID().withMessage('Invalid notification ID')
], NotificationController.deleteNotification);

// Mark all as read
router.put('/read-all', authenticateToken, NotificationController.markAllAsRead);


// Delete all read notifications
router.delete('/read/all', authenticateToken, NotificationController.deleteAllRead);

// Delete all read notifications
router.delete('/delete/all', authenticateToken, NotificationController.deleteAll);



// Get notifications by type
router.get('/types/:type', authenticateToken, [
  param('type').isString(),
  query('limit').optional().isInt({ min: 1, max: 50 })
], NotificationController.getByType);

// ==================== Send Notifications ====================

/**
 * Send a notification (for testing or manual triggers)
 * @route POST /api/v1/notifications/send
 */
router.post('/send', authenticateToken, [
  body('title').notEmpty().withMessage('Title is required'),
  body('body').notEmpty().withMessage('Body is required'),
  body('data').optional().isObject(),
  body('options').optional().isObject()
], NotificationController.sendNotification);

// ==================== Notification Templates ====================

/**
 * Send job offer notification (artisan only)
 * @route POST /api/v1/notifications/templates/job-offer
 */
router.post('/templates/job-offer', authenticateToken, [
  body('jobId').isUUID().withMessage('Invalid job ID'),
  body('category').notEmpty(),
  body('description').optional().isString(),
  body('distance').optional().isFloat()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { jobId, category, description, distance } = req.body;
    const result = await NotificationService.sendJobOffer(req.user.id, {
      jobId,
      category,
      description: description || '',
      distance: distance || 0
    });
    sendSuccess(res, result, 'Job offer notification sent');
  } catch (error) {
    next(error);
  }
});

/**
 * Send job accepted notification (client only)
 * @route POST /api/v1/notifications/templates/job-accepted
 */
router.post('/templates/job-accepted', authenticateToken, [
  body('jobId').isUUID().withMessage('Invalid job ID'),
  body('category').notEmpty(),
  body('artisanId').isUUID().withMessage('Invalid artisan ID')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { jobId, category, artisanId } = req.body;
    const result = await NotificationService.sendJobAccepted(req.user.id, {
      jobId,
      category,
      artisanId
    });
    sendSuccess(res, result, 'Job accepted notification sent');
  } catch (error) {
    next(error);
  }
});

/**
 * Send arrival notification
 * @route POST /api/v1/notifications/templates/arrival
 */
router.post('/templates/arrival', authenticateToken, [
  body('jobId').isUUID().withMessage('Invalid job ID'),
  body('pin').isLength({ min: 6, max: 6 }).withMessage('PIN must be 6 digits')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { jobId, pin } = req.body;
    const result = await NotificationService.sendArrivalNotification(req.user.id, jobId, pin);
    sendSuccess(res, result, 'Arrival notification sent');
  } catch (error) {
    next(error);
  }
});

/**
 * Send payment confirmed notification
 * @route POST /api/v1/notifications/templates/payment-confirmed
 */
router.post('/templates/payment-confirmed', authenticateToken, [
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('jobId').isUUID().withMessage('Invalid job ID')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { amount, jobId } = req.body;
    const result = await NotificationService.sendPaymentConfirmed(req.user.id, amount, jobId);
    sendSuccess(res, result, 'Payment confirmed notification sent');
  } catch (error) {
    next(error);
  }
});

/**
 * Send job completed notification
 * @route POST /api/v1/notifications/templates/job-completed
 */
router.post('/templates/job-completed', authenticateToken, [
  body('jobId').isUUID().withMessage('Invalid job ID')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { jobId } = req.body;
    const result = await NotificationService.sendJobCompleted(req.user.id, jobId);
    sendSuccess(res, result, 'Job completed notification sent');
  } catch (error) {
    next(error);
  }
});

/**
 * Send withdrawal status notification
 * @route POST /api/v1/notifications/templates/withdrawal-status
 */
router.post('/templates/withdrawal-status', authenticateToken, [
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('status').isIn(['pending', 'processing', 'completed', 'failed']).withMessage('Invalid status'),
  body('reference').notEmpty().withMessage('Reference is required')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { amount, status, reference } = req.body;
    const result = await NotificationService.sendWithdrawalStatus(
      req.user.id,
      amount,
      status,
      reference
    );
    sendSuccess(res, result, 'Withdrawal status notification sent');
  } catch (error) {
    next(error);
  }
});


module.exports = router;