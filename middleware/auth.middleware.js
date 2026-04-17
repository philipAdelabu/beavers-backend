const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { cacheGet } = require('../config/redis');
const { logger } = require('../config/logger');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Check blacklist
    const isBlacklisted = await cacheGet(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userResult = await pool.query(
      `SELECT id, email, user_type, is_verified, is_active 
       FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired' });
    }
    logger.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.user_type)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

const requireVerification = async (req, res, next) => {
  if (!req.user.is_verified) {
    return res.status(403).json({ error: 'Account not verified. Please complete verification.' });
  }
  next();
};

const requireActiveSubscription = async (req, res, next) => {
  if (req.user.user_type === 'artisan') {
    const result = await pool.query(
      `SELECT monthly_fee_status FROM artisan_profiles WHERE user_id = $1`,
      [req.user.id]
    );
    
    if (result.rows[0]?.monthly_fee_status !== 'paid') {
      return res.status(403).json({ error: 'Active subscription required. Please pay your monthly fee.' });
    }
  }
  next();
};

const requireOnboardingComplete = async (req, res, next) => {
  if (req.user.user_type === 'artisan') {
    const result = await pool.query(
      `SELECT onboarding_fee_paid, is_verified FROM artisan_profiles WHERE user_id = $1`,
      [req.user.id]
    );
    
    if (!result.rows[0]?.onboarding_fee_paid) {
      return res.status(403).json({ error: 'Please complete onboarding by paying the registration fee.' });
    }
    
    if (!result.rows[0]?.is_verified) {
      return res.status(403).json({ error: 'Your profile is pending verification. Please wait for admin approval.' });
    }
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const isBlacklisted = await cacheGet(`blacklist:${token}`);
      if (!isBlacklisted) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userResult = await pool.query(
          `SELECT id, email, user_type, is_verified, is_active FROM users WHERE id = $1`,
          [decoded.userId]
        );
        
        if (userResult.rows.length > 0 && userResult.rows[0].is_active) {
          req.user = userResult.rows[0];
        }
      }
    }
    next();
  } catch (error) {
    next();
  }
};

module.exports = { 
  authenticateToken, 
  requireRole, 
  requireVerification,
  requireActiveSubscription,
  requireOnboardingComplete,
  optionalAuth
};