// routes/auth.routes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { cacheSet, cacheGet } = require('../config/redis');
const { sendEmail, sendSMS } = require('../services/notification.service');

const router = express.Router();

// Client registration
router.post('/register/client', [
  body('email').isEmail().normalizeEmail(),
  body('phone').isMobilePhone(),
  body('password').isLength({ min: 6 }),
  body('fullLegalName').notEmpty(),
  body('nin').notEmpty(),
  body('streetAddress').notEmpty(),
  body('serviceAddress').notEmpty()
], async (req, res) => {
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
      [email, phone, hashedPassword, 'client', 'pending']
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
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

// Artisan registration
router.post('/register/artisan', [
  body('email').isEmail(),
  body('phone').isMobilePhone(),
  body('password').isLength({ min: 6 }),
  body('fullLegalName').notEmpty(),
  body('nin').notEmpty(),
  body('residentialAddress').notEmpty(),
  body('skillCategory').notEmpty(),
  body('onboardingFee').isNumeric()
], async (req, res) => {
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
      `INSERT INTO artisan_profiles (user_id, full_legal_name, nin, residential_address, skill_category, onboarding_fee_paid)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, fullLegalName, nin, residentialAddress, skillCategory, onboardingFee === 0]
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
});

// Login
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, password } = req.body;

    const userResult = await pool.query(
      `SELECT u.*, 
              CASE WHEN u.user_type = 'client' THEN cp.full_legal_name 
                   WHEN u.user_type = 'artisan' THEN ap.full_legal_name 
              END as full_name
       FROM users u
       LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
       LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
       WHERE u.email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, userType: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    // Store refresh token in Redis
    await cacheSet(`refresh_token:${user.id}`, refreshToken, 2592000);

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        userType: user.user_type,
        fullName: user.full_name,
        isVerified: user.is_verified,
        verificationStatus: user.verification_status 
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

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
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const newAccessToken = jwt.sign(
      { userId: user.id, email: user.email, userType: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
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
  body('otp').isLength({ min: 6, max: 6 })
], async (req, res) => {
  const { phone, otp } = req.body;

  const storedOtp = await cacheGet(`otp:${phone}`);
  
  if (!storedOtp || storedOtp !== otp) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  await cacheDel(`otp:${phone}`);

  res.json({ message: 'OTP verified successfully' });
});

module.exports = router;