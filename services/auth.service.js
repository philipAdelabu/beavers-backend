const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { cacheSet, cacheGet, cacheDel } = require('../config/redis');
const { generateTokens, verifyRefreshToken } = require('../utils/jwt.utils');
const { generateAndStoreOTP, verifyOTP } = require('../utils/otp.utils');
const { sendEmail, sendSMS } = require('./notification.service');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const { upload } = require('../config/multer');

class AuthService {
  static async registerClient(userData, uploadedFiles = {}) {
    const { email, phone, password, fullLegalName, nin, streetAddress, serviceAddress } = userData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if user exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 OR phone = $2',
        [email, phone]
      );
      
      if (existingUser.rows.length > 0) {
        throw new AppError(409, 'User already exists with this email or phone');
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, phone, password_hash, user_type, verification_status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, email, phone, user_type, created_at`,
        [email, phone, hashedPassword, 'client']
      );
      
      const user = userResult.rows[0];
      
      // Create client profile
      await client.query(
        `INSERT INTO client_profiles (user_id, full_legal_name, nin, street_address, service_address, verification_documents)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, fullLegalName, nin, streetAddress, serviceAddress, uploadedFiles],
      );
      
      // Generate OTP for email verification
      const otp = await generateAndStoreOTP(`email:${email}`, 600);
      
      // Send verification email
      await sendEmail(email, 'Verify Your Email', 
        `Your verification code is: ${otp}. This code expires in 10 minutes.`);
      
      await client.query('COMMIT');
      
      // Log registration
      logger.info(`New client registered: ${email}`);
      
      return {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          userType: user.user_type
        },
        message: 'Registration successful. Please verify your email.'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async registerArtisan(userData, uploadedFiles = {}) {
    const { email, phone, password, fullLegalName, nin, residentialAddress, skillCategory, onboardingFee } = userData;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if user exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 OR phone = $2',
        [email, phone]
      );
      
      if (existingUser.rows.length > 0) {
        throw new AppError(409, 'User already exists with this email or phone');
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);
      
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, phone, password_hash, user_type, verification_status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, email, phone, user_type, created_at`,
        [email, phone, hashedPassword, 'artisan']
      );
      
      const user = userResult.rows[0];
      
      // Create artisan profile
      await client.query(
        `INSERT INTO artisan_profiles (user_id, full_legal_name, 
        nin, residential_address, skill_category,passport_photo_url, onboarding_fee_paid)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.id, fullLegalName, nin, residentialAddress, skillCategory, 
          uploadedFiles.passportPhoto || null, onboardingFee === 0,
        ],
      );
      
      // Generate OTP for email verification
      const otp = await generateAndStoreOTP(`email:${email}`, 600);
      
      // Send verification email
      await sendEmail(email,
        'Verify Your Email',
        `Your verification code is: ${otp}. This code expires in 10 minutes.`);
      
      await client.query('COMMIT');
      
      logger.info(`New artisan registered: ${email}`);
      
      return {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          userType: user.user_type
        },
        message: 'Registration successful. Please verify your email and pay onboarding fee.'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async login(email, password, ipAddress, userAgent) {
    const client = await pool.connect();
    
    try {
      // Get user with profile
      const userResult = await client.query(
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
        throw new AppError(401, 'Invalid credentials');
      }
      
      const user = userResult.rows[0];
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        // Log failed attempt
        await this.logFailedAttempt(email, ipAddress);
        throw new AppError(401, 'Invalid credentials');
      }
      
      // Check if account is active
      if (!user.is_active) {
        throw new AppError(403, 'Account is deactivated. Please contact support.');
      }
      
      // Check if email is verified
      if (!user.is_verified) {
        throw new AppError(403, 'Email not verified. Please check your email for verification code.');
      }
      
      // Check artisan monthly fee
      if (user.user_type === 'artisan') {
        const artisanResult = await client.query(
          `SELECT monthly_fee_status FROM artisan_profiles WHERE user_id = $1`,
          [user.id]
        );
        
        if (artisanResult.rows[0]?.monthly_fee_status !== 'paid') {
          throw new AppError(403, 'Monthly fee not paid. Please pay to continue.');
        }
      }
      
      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.user_type);
      
      // Store refresh token in Redis
      await cacheSet(`refresh_token:${user.id}`, refreshToken, 2592000); // 30 days
      
      // Update last login
      await client.query(
        `UPDATE users SET last_login = NOW(), last_login_ip = $1 WHERE id = $2`,
        [ipAddress, user.id]
      );
      
      // Log successful login
      await client.query(
        `INSERT INTO login_history (user_id, ip_address, user_agent, success)
         VALUES ($1, $2, $3, true)`,
        [user.id, ipAddress, userAgent]
      );
      
      logger.info(`User logged in: ${email}`);
      
      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          userType: user.user_type,
          fullName: user.full_name,
          isVerified: user.is_verified,
          verificationStatus: user.verification_status
        }
      };
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async logout(userId, accessToken) {
    try {
      // Blacklist the access token
      const decoded = jwt.decode(accessToken);
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
      
      if (expiresIn > 0) {
        await cacheSet(`blacklist:${accessToken}`, 'true', expiresIn);
      }
      
      // Delete refresh token
      await cacheDel(`refresh_token:${userId}`);
      
      logger.info(`User logged out: ${userId}`);
      
      return { message: 'Logged out successfully' };
    } catch (error) {
      throw error;
    }
  }
  
  static async refreshToken(refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const storedToken = await cacheGet(`refresh_token:${decoded.userId}`);
      
      if (storedToken !== refreshToken) {
        throw new AppError(401, 'Invalid refresh token');
      }
      
      const userResult = await pool.query(
        'SELECT id, email, user_type FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new AppError(401, 'User not found or inactive');
      }
      
      const user = userResult.rows[0];
      const { accessToken } = generateTokens(user.id, user.email, user.user_type);
      
      return { accessToken };
    } catch (error) {
      throw error;
    }
  }
  
  static async verifyEmail(email, otp) {
    const isValid = await verifyOTP(`email:${email}`, otp);
    
    if (!isValid) {
      throw new AppError(400, 'Invalid or expired OTP');
    }
    
    await pool.query(
      `UPDATE users SET is_verified = true, verification_status = 'verified', verified_at = NOW()
       WHERE email = $1`,
      [email]
    );
    
    logger.info(`Email verified: ${email}`);
    
    return { message: 'Email verified successfully' };
  }
  
  static async verifyPhone(phone, otp) {
    const isValid = await verifyOTP(`phone:${phone}`, otp);
    
    if (!isValid) {
      throw new AppError(400, 'Invalid or expired OTP');
    }
    
    await pool.query(
      `UPDATE users SET phone_verified = true, phone_verified_at = NOW()
       WHERE phone = $1`,
      [phone]
    );
    
    logger.info(`Phone verified: ${phone}`);
    
    return { message: 'Phone verified successfully' };
  }
  
  static async sendVerificationCode(email) {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    
    const otp = await generateAndStoreOTP(`email:${email}`, 600);
    await sendEmail(email, 'Your Verification Code', `Your verification code is: ${otp}`);
    
    return { message: 'Verification code sent' };
  }
  
  static async forgotPassword(email) {
    const userResult = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      // Don't reveal that user doesn't exist for security
      return { message: 'If an account exists, a reset link will be sent' };
    }
    
    const user = userResult.rows[0];
    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // Store reset token
    await cacheSet(`password_reset:${user.id}`, resetToken, 3600);
    
    // Send reset email
    const resetUrl = `${process.env.APP_FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendEmail(email, 'Reset Your Password', 
      `Click here to reset your password: ${resetUrl}. This link expires in 1 hour.`);
    
    logger.info(`Password reset requested for: ${email}`);
    
    return { message: 'If an account exists, a reset link will be sent' };
  }
  
  static async resetPassword(token, newPassword) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.purpose !== 'password_reset') {
        throw new AppError(400, 'Invalid reset token');
      }
      
      const storedToken = await cacheGet(`password_reset:${decoded.userId}`);
      
      if (storedToken !== token) {
        throw new AppError(400, 'Invalid or expired reset token');
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      
      await pool.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [hashedPassword, decoded.userId]
      );
      
      await cacheDel(`password_reset:${decoded.userId}`);
      
      logger.info(`Password reset for user: ${decoded.userId}`);
      
      return { message: 'Password reset successfully' };
    } catch (error) {
      throw new AppError(400, 'Invalid or expired reset token');
    }
  }
  
  static async changePassword(userId, currentPassword, newPassword) {
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new AppError(404, 'User not found');
    }
    
    const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    
    if (!isValid) {
      throw new AppError(401, 'Current password is incorrect');
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [hashedPassword, userId]
    );
    
    logger.info(`Password changed for user: ${userId}`);
    
    return { message: 'Password changed successfully' };
  }
  
  static async logFailedAttempt(email, ipAddress) {
    await pool.query(
      `INSERT INTO failed_logins (email, ip_address, attempted_at)
       VALUES ($1, $2, NOW())`,
      [email, ipAddress]
    );
    
    // Check for brute force attempts
    const recentAttempts = await pool.query(
      `SELECT COUNT(*) FROM failed_logins 
       WHERE email = $1 AND attempted_at > NOW() - INTERVAL '15 minutes'`,
      [email]
    );
    
    if (parseInt(recentAttempts.rows[0].count) >= 5) {
      // Temporarily block login attempts
      await cacheSet(`login_block:${email}`, 'true', 900); // 15 minutes
      logger.warn(`Multiple failed login attempts for: ${email}`);
    }
  }
  
  static async isLoginBlocked(email) {
    const blocked = await cacheGet(`login_block:${email}`);
    return !!blocked;
  }
  
  static async validateSession(userId, token) {
    const isBlacklisted = await cacheGet(`blacklist:${token}`);
    if (isBlacklisted) {
      return false;
    }
    
    const userResult = await pool.query(
      'SELECT is_active FROM users WHERE id = $1',
      [userId]
    );
    
    return userResult.rows.length > 0 && userResult.rows[0].is_active;
  }
}

module.exports = AuthService;