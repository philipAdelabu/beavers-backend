// routes/auth.routes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { cacheSet, cacheGet, cacheDel } = require('../config/redis');
const { sendEmail, sendSMS } = require('../services/notification.service');
const { authenticateToken } = require('../middleware/auth.middleware');
const { logger } = require('../config/logger');
const AuthController = require('../controllers/auth.controller');
const { authLimiter } = require('../middleware/rateLimit.middleware');
const { uploadFields } = require('../config/multer');

const router = express.Router();

router.get('/test', (req, res) => {
  res.status(200).json({ message: 'hello world' });
});

// Client registration
router.post('/register/client', authLimiter, uploadFields([
{ name: 'ninPhoto', maxCount: 1 },
{ name: 'passportPhoto', maxCount: 1 },]), 
[body('email').isEmail().normalizeEmail(),
  body('phone').isMobilePhone(),
  body('password').isLength({ min: 6 }),
  body('fullLegalName').notEmpty(),
  body('nin').notEmpty(),
  body('streetAddress').notEmpty(),
  body('serviceAddress').notEmpty(),
], AuthController.registerClient);

/*
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { email, phone, password, fullLegalName, nin, streetAddress, serviceAddress } = req.body;
    
    // Check if user exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone],
    );
    
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, phone, password_hash, user_type, verification_status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [email, phone, hashedPassword, 'client', 'pending'],
    );

    const userId = userResult.rows[0].id;

    // Create client profile
    await client.query(
      `INSERT INTO client_profiles (user_id, full_legal_name, nin, street_address, service_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, fullLegalName, nin, streetAddress, serviceAddress]
    );

    // Log audit
    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id)
       VALUES ($1, $2, $3, $4)`,
      ['user', userId, 'register', userId]
    );

    await client.query('COMMIT');

    // Send verification notification
    await sendEmail(email, 'Account Registered', 'Your account is pending verification');
    await sendSMS(phone, 'Your BeaverWorks account has been registered and is pending verification');

    res.status(201).json({
      message: 'Client registered successfully. Account pending verification.',
      userId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
}  ); */


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
  body('phone').matches(/^\+?[0-9]{10,15}$/).withMessage('Valid phone number is required')
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


/// * The artisan section begins here */////
// Artisan registration
router.post('/register/artisan', authLimiter, uploadFields([
    { name: 'passportPhoto', maxCount: 1 },
    { name: 'ninPhoto', maxCount: 1 },
    { name: 'certificates', maxCount: 10 },
    { name: 'tradeTestimony', maxCount: 5 },
  ]),[
  body('email').isEmail(),
  body('phone').isMobilePhone(),
  body('password').isLength({ min: 6 }),
  body('fullLegalName').notEmpty(),
  body('nin').notEmpty(),
  body('residentialAddress').notEmpty(),
  body('skillCategory').notEmpty(),
  body('onboardingFee').isNumeric()
], AuthController.registerArtisan);
/*
  async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { email, phone, password, fullLegalName, nin, residentialAddress, skillCategory, onboardingFee } = req.body;

    // Check if user exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, phone, password_hash, user_type, verification_status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [email, phone, hashedPassword, 'artisan', 'pending']
    );

    const userId = userResult.rows[0].id;

    // Create artisan profile
    await client.query(
      `INSERT INTO artisan_profiles (user_id, full_legal_name, nin, 
       residential_address, skill_category, onboarding_fee_paid)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, fullLegalName, nin, residentialAddress, skillCategory, onboardingFee === 0],
    );

    await client.query('COMMIT');

    // Send verification notification
    await sendEmail(email, 'Artisan Registration', 'Your artisan account is pending verification');

    res.status(201).json({
      message: 'Artisan registered successfully. Account pending verification and onboarding fee payment.',
      userId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Artisan registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});  */

// Login

// Refresh token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const storedToken = await cacheGet(`refresh_token:${decoded.userId}`);

    if (storedToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const userResult = await pool.query(
      'SELECT id, email, user_type FROM users WHERE id = $1',
      [decoded.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const newAccessToken = jwt.sign(
      { userId: user.id, email: user.email, userType: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN },
    );

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    return res.status(403).json({ error: 'Invalid refresh token' });
  }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
  await cacheDel(`refresh_token:${req.user.id}`);
  res.json({ message: 'Logged out successfully' });
});

// Verify OTP
router.post('/verify-otp', [
  body('phone').isMobilePhone(),
  body('otp').isLength({ min: 6, max: 6 }),
], async (req, res) => {
  const { phone, otp } = req.body;
  const storedOtp = await cacheGet(`otp:${phone}`);
  if (!storedOtp || storedOtp !== otp) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }
  await cacheDel(`otp:${phone}`);
  res.json({ message: 'OTP verified successfully' });
});

router.post('/send-verification-code', [
  body('email').optional().isEmail(),
  body('phone').optional().isMobilePhone(),
], async (req, res) => {
  const { email, phone } = req.body;

  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone number is required' });
  }

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    if (email) {
      await cacheSet(`otp:${email}`, otp, 300);
      await sendEmail(email, 'Your Verification Code', `Your OTP is: ${otp}`);
    }
    if (phone) {
      await cacheSet(`otp:${phone}`, otp, 300);
      await sendSMS(phone, `Your OTP is: ${otp}`);
    }
    res.json({ message: 'Verification code sent successfully' });
  } catch (error) {
    logger.error('Error sending verification code:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});



module.exports = router;
