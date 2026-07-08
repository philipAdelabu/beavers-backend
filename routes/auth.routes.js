// routes/auth.routes.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth.middleware');
const { logger } = require('../config/logger');
const AuthController = require('../controllers/auth.controller');
const { authLimiter } = require('../middleware/rateLimit.middleware');
const { uploadFields } = require('../config/multer');

const router = express.Router();

// Client registration
router.post('/register/client', authLimiter, uploadFields([
{ name: 'ninPhoto', maxCount: 1 },
{ name: 'passportPhoto', maxCount: 1 },]), 
 [body('email').isEmail().normalizeEmail(),
  body('phone').isMobilePhone(),
  body('password').optional().isLength({ min: 6 }),
  body('fullLegalName').notEmpty(),
  body('nin').notEmpty(),
  body('streetAddress').notEmpty(),
  body('serviceAddress').notEmpty(),
], AuthController.registerClient);

/// * The artisan section begins here */////
// Artisan registration
router.post('/register/artisan', authLimiter, uploadFields([
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'ninPhoto', maxCount: 1 },
  { name: 'certificates', maxCount: 10 },
  { name: 'tradeTestimony', maxCount: 5 },
]), [
  body('email').isEmail(),
  body('phone').isMobilePhone(),
  body('password').isLength({ min: 6 }),
  body('fullLegalName').notEmpty(),
  body('nin').notEmpty(),
  body('residentialAddress').notEmpty(),
  body('skillCategory').notEmpty(),
], AuthController.registerArtisan);


router.post('/verify/email', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('otp').isLength({ min: 6, max: 6 }),
], AuthController.verifyEmail);


router.post('/verify/phone', authLimiter, [
  body('phone').isMobilePhone(),
  body('otp').isLength({ min: 6, max: 6 }),
], AuthController.verifyPhone);


// Login with email/phone and password
router.post('/login', authLimiter, [
  body('identifier').notEmpty().withMessage('Email or phone number is required'),
  body('password').notEmpty().withMessage('Password is required'),
], AuthController.login);

// Request OTP for phone login
router.post('/request-otp', authLimiter, [
  body('phone').optional().matches(/^\+?[0-9]{10,15}$/).withMessage('Valid phone number is required'),
  body('email').optional().isEmail().withMessage('Valid email is required')
], AuthController.requestOTP);

// Login with phone and OTP
router.post('/login-otp', authLimiter, [
  body('phone').matches(/^\+?[0-9]{10,15}$/).withMessage('Valid phone number is required'),
  body('otp').isLength({ min: 6, max: 6 }).matches(/^[0-9]+$/).withMessage('OTP must be 6 digits')
], AuthController.loginWithOTP);

// Logout from current device (protected route)
router.post('/logout', authenticateToken, AuthController.logout);

// Logout from all devices (protected route)
router.post('/logout-all', authenticateToken, AuthController.logoutAll);

// Refresh token
router.post('/refresh', AuthController.refreshToken);

// send verification code to email
router.post('/send-verification', [
  body('email').optional().isEmail(),
  body('phone').optional().isMobilePhone(),
], AuthController.sendVerificationCode);

// Forgot password - send reset link or OTP
router.post('/forgot-password', [
  body('email').isEmail(),
], AuthController.forgotPassword);

// Reset Password 
router.post('/reset-password', [
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], AuthController.resetPassword);

// Change Password (protected route)
router.post('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], AuthController.changePassword);

// Get current user profile (protected route)
router.get('/me', authenticateToken, AuthController.getMe);


module.exports = router;
