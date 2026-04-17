const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const { authenticateToken, requireRole, requireVerification } = require('../middleware/auth.middleware');
const { uploadFields, uploadSingle } = require('../config/multer');
const Client = require('../models/Client');
const Job = require('../models/Job');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const Rating = require('../models/Rating');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');

// Get client profile
router.get('/profile', authenticateToken, requireRole(['client']), async (req, res, next) => {
  try {
    const profile = await Client.findByUserId(req.user.id);
    if (!profile) {
      throw new AppError(404, 'Client profile not found');
    }
    sendSuccess(res, profile, 'Profile retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Update client profile
router.put('/profile', authenticateToken, requireRole(['client']), [
  body('fullLegalName').optional().notEmpty().trim(),
  body('streetAddress').optional().notEmpty(),
  body('serviceAddress').optional().notEmpty()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const updated = await Client.update(req.user.id, req.body);
    sendSuccess(res, updated, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
});

// Upload verification documents
router.post('/upload-documents', authenticateToken, requireRole(['client']), uploadFields([
  { name: 'ninPhoto', maxCount: 1 },
  { name: 'utilityBill', maxCount: 1 },
  { name: 'passportPhoto', maxCount: 1 }
]), async (req, res, next) => {
  try {
    const documents = {};
    if (req.files.ninPhoto) documents.ninPhoto = req.files.ninPhoto[0].path;
    if (req.files.utilityBill) documents.utilityBill = req.files.utilityBill[0].path;
    if (req.files.passportPhoto) documents.passportPhoto = req.files.passportPhoto[0].path;
    
    const profile = await Client.findByUserId(req.user.id);
    const updated = await Client.update(req.user.id, {
      verification_documents: { ...profile.verification_documents, ...documents }
    });
    
    sendSuccess(res, updated, 'Documents uploaded successfully');
  } catch (error) {
    next(error);
  }
});

// Get client job history
router.get('/jobs', authenticateToken, requireRole(['client']), [
  query('status').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { status, page = 1, limit = 10 } = req.query;
    const result = await Job.getClientJobs(req.user.id, { status, page, limit });
    sendPaginated(res, result.jobs, page, limit, result.total, 'Jobs retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Get payment methods
router.get('/payment-methods', authenticateToken, requireRole(['client']), async (req, res, next) => {
  try {
    const methods = await Payment.getPaymentMethods(req.user.id);
    sendSuccess(res, methods, 'Payment methods retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Add payment method
router.post('/payment-methods', authenticateToken, requireRole(['client']), [
  body('paymentMethodId').notEmpty(),
  body('type').isIn(['card', 'bank']),
  body('last4').optional().isLength({ min: 4, max: 4 }),
  body('expiryMonth').optional().isInt({ min: 1, max: 12 }),
  body('expiryYear').optional().isInt({ min: 2024, max: 2035 }),
  body('isDefault').optional().isBoolean()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const method = await Payment.addPaymentMethod(req.user.id, req.body);
    sendSuccess(res, method, 'Payment method added successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Delete payment method
router.delete('/payment-methods/:methodId', authenticateToken, requireRole(['client']), [
  param('methodId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const deleted = await Payment.deletePaymentMethod(req.params.methodId, req.user.id);
    if (!deleted) {
      throw new AppError(404, 'Payment method not found');
    }
    sendSuccess(res, null, 'Payment method deleted successfully');
  } catch (error) {
    next(error);
  }
});

// Get client notifications
router.get('/notifications', authenticateToken, requireRole(['client']), [
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
    sendPaginated(res, result.notifications, page, limit, result.total, 'Notifications retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Mark notification as read
router.put('/notifications/:notificationId/read', authenticateToken, requireRole(['client']), [
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

// Mark all notifications as read
router.put('/notifications/read-all', authenticateToken, requireRole(['client']), async (req, res, next) => {
  try {
    const notifications = await Notification.markAllAsRead(req.user.id);
    sendSuccess(res, { count: notifications.length }, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
});

// Get saved artisans
router.get('/saved-artisans', authenticateToken, requireRole(['client']), async (req, res, next) => {
  try {
    const artisans = await Client.getSavedArtisans(req.user.id);
    sendSuccess(res, artisans, 'Saved artisans retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Save artisan
router.post('/saved-artisans/:artisanId', authenticateToken, requireRole(['client']), [
  param('artisanId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const saved = await Client.saveArtisan(req.user.id, req.params.artisanId);
    sendSuccess(res, saved, 'Artisan saved successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Remove saved artisan
router.delete('/saved-artisans/:artisanId', authenticateToken, requireRole(['client']), [
  param('artisanId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const removed = await Client.removeSavedArtisan(req.user.id, req.params.artisanId);
    if (!removed) {
      throw new AppError(404, 'Saved artisan not found');
    }
    sendSuccess(res, null, 'Artisan removed from saved list');
  } catch (error) {
    next(error);
  }
});

// Get service addresses
router.get('/addresses', authenticateToken, requireRole(['client']), async (req, res, next) => {
  try {
    const addresses = await Client.getAddresses(req.user.id);
    sendSuccess(res, addresses, 'Addresses retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Add service address
router.post('/addresses', authenticateToken, requireRole(['client']), [
  body('address').notEmpty(),
  body('label').optional().isString(),
  body('isDefault').optional().isBoolean(),
  body('latitude').optional().isFloat(),
  body('longitude').optional().isFloat()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const address = await Client.addAddress(req.user.id, req.body);
    sendSuccess(res, address, 'Address added successfully', 201);
  } catch (error) {
    next(error);
  }
});

// Update service address
router.put('/addresses/:addressId', authenticateToken, requireRole(['client']), [
  param('addressId').isUUID(),
  body('address').optional().notEmpty(),
  body('label').optional().isString(),
  body('isDefault').optional().isBoolean(),
  body('latitude').optional().isFloat(),
  body('longitude').optional().isFloat()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const address = await Client.updateAddress(req.params.addressId, req.body);
    if (!address) {
      throw new AppError(404, 'Address not found');
    }
    sendSuccess(res, address, 'Address updated successfully');
  } catch (error) {
    next(error);
  }
});

// Delete service address
router.delete('/addresses/:addressId', authenticateToken, requireRole(['client']), [
  param('addressId').isUUID()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const deleted = await Client.deleteAddress(req.params.addressId);
    if (!deleted) {
      throw new AppError(404, 'Address not found');
    }
    sendSuccess(res, null, 'Address deleted successfully');
  } catch (error) {
    next(error);
  }
});

// Get unread notifications count
router.get('/notifications/unread/count', authenticateToken, requireRole(['client']), async (req, res, next) => {
  try {
    const count = await Notification.getUnreadCount(req.user.id);
    sendSuccess(res, { count }, 'Unread count retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Delete notification
router.delete('/notifications/:notificationId', authenticateToken, requireRole(['client']), [
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
    sendSuccess(res, null, 'Notification deleted successfully');
  } catch (error) {
    next(error);
  }
});

// Get notification preferences
router.get('/notification-preferences', authenticateToken, requireRole(['client']), async (req, res, next) => {
  try {
    const preferences = await Notification.getNotificationPreferences(req.user.id);
    sendSuccess(res, preferences, 'Preferences retrieved successfully');
  } catch (error) {
    next(error);
  }
});

// Update notification preferences
router.put('/notification-preferences', authenticateToken, requireRole(['client']), [
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
    sendSuccess(res, preferences, 'Preferences updated successfully');
  } catch (error) {
    next(error);
  }
});

module.exports = router;