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
const { profile, log } = require('winston');
const { PRICING } = require('../config/constants');
const SysConfig = require('../config/syst-config');

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
      
      let pswd = email
      if(password){
        pswd = password;
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(pswd, 12); 
      
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, phone, password_hash, user_type, verification_status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING id, email, phone, user_type,is_email_verified, is_phone_verified, is_logged_in, created_at`,
        [email, phone, hashedPassword, 'client']
      );
      
      const user = userResult.rows[0] 
      
      // Create client profile
     const userProfileResult = await client.query(
        `INSERT INTO client_profiles (user_id, full_legal_name, nin, street_address, service_address, verification_documents)
         VALUES ($1, $2, $3, $4, $5, $6)  
         RETURNING user_id, full_legal_name, nin, street_address, service_address, verification_documents, created_at`,
        [user.id, fullLegalName, nin, streetAddress, serviceAddress, uploadedFiles],
      );
      const userProfile = userProfileResult.rows[0];

      //Create the Wallte for the user
      const userWalletResult = await client.query(
        `INSERT INTO wallets (user_id, user_type, balance) VALUES ($1, $2, 0) RETURNING * `,
        [user.id, 'client']
      );
      const userWallet = userWalletResult.rows[0];
      // Generate OTP for email verification
      const mailOtp = await generateAndStoreOTP(`email:${email}`, 1200);

      // Generate OTP for phone verification
      const phoneOtp = await generateAndStoreOTP(`phone:${phone}`, 600);
      
      // Send verification email
      if(process.env.NODE_ENV === 'production') {
        await sendEmail(email, 'Verify Your Email',
        `Your  email verification code is: ${mailOtp}. This code expires in 20 minutes.`, user.id);
        // await sendSMS(phone, `Your  phone verification code is: ${phoneOtp}. This code expires in 10 minutes.`, user.id);
      }else {
          logger.info(`Test environment - Email OTP for ${email}: ${mailOtp}`);
          logger.info(`Test environment - Phone OTP for ${phone}: ${phoneOtp}`);  
       }


      await client.query('COMMIT');
      
      // Log registration
      logger.info(`New client registered: ${email}`);
      logger.info("profile: ",userProfile);
      return {
          id: user.id,
          email: user.email,
          phone: user.phone,
          userType: user.user_type,
          isEmailVerified: user.is_email_verified,
          isPhoneVerified: user.is_phone_verified,
          is_logged_in: user.is_logged_in,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async registerArtisan(userData, uploadedFiles = {}) {
    const { email, phone, password, fullLegalName, nin, residentialAddress, skillCategory } = userData;
    
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

       let pswd = email
      if(password){
        pswd = password;
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(pswd, 12);
      
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, phone, password_hash, user_type, verification_status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id, email, phone, user_type, is_phone_verified, is_email_verified, created_at`,
        [email, phone, hashedPassword, 'artisan']
      );
      
      const user = userResult.rows[0];
      
      // Create artisan profile
      const userProfileResult = await client.query(
        `INSERT INTO artisan_profiles (user_id, full_legal_name, 
        nin, residential_address, skill_category, passport_photo_url, onboarding_fee_paid)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          user.id, fullLegalName, nin, residentialAddress, skillCategory, 
          uploadedFiles.passportPhoto || null, false,
        ],
      );
      
              const sys_config = await SysConfig.getSysConfig();
              const onboardingFee = sys_config.onboarding_fee || process.env.ARTISAN_ONBOARDING_FEE;
    
             if(process.env.NODE_ENV === 'production') {
              await sendEmail(
              email, 'Complete Your Registration - Pay Onboarding Fee',
              `Dear ${fullLegalName},\n\nPlease pay the onboarding fee of ₦${onboardingFee.toLocaleString()} to activate your account and start receiving job offers.\n\nThank you for choosing BeaverWorks!`,
              user.id
             );
            }
          

      const userProfile = userProfileResult.rows[0];

       //Create the Wallte for the user
      const userWalletResult = await client.query(
        `INSERT INTO wallets (user_id, user_type, balance) VALUES ($1, $2, 0) RETURNING * `,
        [user.id, 'artisan']
      );
      const userWallet = userWalletResult.rows[0];
      
      // Generate OTP for email verification
      const mailOtp = await generateAndStoreOTP(`email:${email}`, 1200);
      const phoneOtp = await generateAndStoreOTP(`phone:${phone}`, 600);
      
      
      // Send verification email
        if(process.env.NODE_ENV === 'production') {
      await sendEmail(email, 'Verify Your Email', 
        `Your email verification code is: ${mailOtp}. This code expires in 20 minutes.`, user.id);
    //  await sendSMS(phone, `Your verification code is: ${phoneOtp}. This code expires in 10 minutes.`, user.id);
      }else {
          logger.info(`Test environment - Email OTP for ${email}: ${mailOtp}`);
          logger.info(`Test environment - Phone OTP for ${phone}: ${phoneOtp}`);  
       }
  
      await client.query('COMMIT');
      
      logger.info(`New artisan registered: ${email}`);
      
      return {
          id: user.id,
          email: user.email,
          phone: user.phone,
          userType: user.user_type,
          isPhoneVerified: user.is_phone_verified,
          isEmailVerified: user.is_email_verified,
          isLoggedIn: user.is_logged_in,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  


  /**
   * Login with email OR phone number
   * @param {string} identifier - Email or phone number
   * @param {string} password - User password
   * @param {string} ipAddress - IP address
   * @param {string} userAgent - User agent
   * @returns {Promise<Object>} Login result with tokens
   */
  static async login(identifier, password, ipAddress, userAgent) {
    const client = await pool.connect();
    await client.query('BEGIN');
    
    try {
      // Determine if identifier is email or phone
      const isEmail = identifier.includes('@') && identifier.includes('.');
      
      let query;
      let params;
      
      if (isEmail) {
        query = `
          SELECT u.*, 
                 CASE WHEN u.user_type = 'client' THEN cp.full_legal_name 
                      WHEN u.user_type = 'artisan' THEN ap.full_legal_name 
                 END as full_name
          FROM users u
          LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
          LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
          WHERE u.email = $1
        `;
        params = [identifier];
      } else {
        // Format phone number (remove spaces, ensure consistency)
        const formattedPhone = this.formatPhoneNumber(identifier);
        query = `
          SELECT u.*, 
                 CASE WHEN u.user_type = 'client' THEN cp.full_legal_name 
                      WHEN u.user_type = 'artisan' THEN ap.full_legal_name 
                 END as full_name
          FROM users u
          LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
          LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
          WHERE u.phone = $1 OR u.phone = $2
        `;
        params = [identifier, formattedPhone];
      }
      
      const userResult = await client.query(query, params);
      
      if (userResult.rows.length === 0) {
        throw new AppError(401, 'Invalid credentials');
      }
      
      const user = userResult.rows[0];
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        // Log failed attempt
        await this.logFailedAttempt(identifier, ipAddress);
        throw new AppError(401, 'Invalid credentials');
      }
      
      // Check if account is active
      if (!user.is_active) {
        throw new AppError(403, 'Account is deactivated. Please contact support.');
      }
      
      // Check if email is verified (for first-time login warning only)
      if (!user.is_verified) {
        // Don't block login, but send reminder
        await this.sendVerificationReminder(user.email, user.phone, user.full_name);
      }
      
      // Check artisan monthly fee
      if (user.user_type === 'artisan') {
        const artisanResult = await client.query(
          `SELECT monthly_fee_status FROM artisan_profiles WHERE user_id = $1`,
          [user.id]
        );

        /*
       if (artisanResult.rows[0]?.monthly_fee_status !== 'paid') {
          throw new AppError(403, 'Monthly fee not paid. Please pay to continue.');
        } */

      }
      
      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.user_type);
      
      // Store refresh token in Redis
      await cacheSet(`refresh_token:${user.id}`, refreshToken, 2592000); // 30 days
      
      // Update last login
      await client.query(
        `UPDATE users SET last_login = NOW(), is_logged_in = true, last_login_ip = $1 WHERE id = $2`,
        [ipAddress, user.id]
      );
      
      // Log successful login
      await client.query(
        `INSERT INTO login_history (user_id, ip_address, user_agent, success, login_time)
         VALUES ($1, $2, $3, true, NOW())`,
        [user.id, ipAddress, userAgent]
      );
      
      const userProfileResult = await client.query(
        `SELECT up.*, u.is_logged_in FROM ${user.user_type}_profiles up
        JOIN users u on u.id = up.user_id
         WHERE user_id = $1`,
        [user.id],
      );

      await client.query('COMMIT');

      const userProfile = userProfileResult.rows[0];
      logger.info(`User logged in: ${user.email} / ${user.phone}`);
      
      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          userType: user.user_type,
          fullName: user.full_name,
          isLoggedIn: userProfile.is_logged_in,
          isVerified: user.is_verified,
          verificationStatus: user.verification_status,
          profile: userProfile,
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Login with phone number and OTP (no password)
   * @param {string} phone - Phone number
   * @param {string} otp - One-time password
   * @param {string} ipAddress - IP address
   * @param {string} userAgent - User agent
   * @returns {Promise<Object>} Login result with tokens
   */
  static async loginWithOTP(phone, otp, ipAddress, userAgent) {
    const client = await pool.connect();
    
    try {
      // Format phone number
      const formattedPhone = this.formatPhoneNumber(phone);
      
      // Verify OTP
      const isValidOTP = await verifyOTP(`phone:${formattedPhone}`, otp);
      if (!isValidOTP) {
        throw new AppError(401, 'Invalid or expired OTP');
      }
      
      // Find user by phone
      const userResult = await client.query(
        `SELECT u.*, 
                CASE WHEN u.user_type = 'client' THEN cp.full_legal_name 
                     WHEN u.user_type = 'artisan' THEN ap.full_legal_name 
                END as full_name
         FROM users u
         LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
         LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
         WHERE u.phone = $1 OR u.phone = $2`,
        [phone, formattedPhone]
      );
      
      if (userResult.rows.length === 0) {
        throw new AppError(404, 'No account found with this phone number');
      }
      
      const user = userResult.rows[0];
      
      // Check if account is active
      if (!user.is_active) {
        throw new AppError(403, 'Account is deactivated. Please contact support.');
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
      await cacheSet(`refresh_token:${user.id}`, refreshToken, 2592000);
      
      // Update last login
      await client.query(
        `UPDATE users SET last_login = NOW(), is_logged_in = true,last_login_ip = $1 WHERE id = $2`,
        [ipAddress, user.id]
      );
      
      // Log successful login
      await client.query(
        `INSERT INTO login_history (user_id, ip_address, user_agent, success, login_time)
         VALUES ($1, $2, $3, true, NOW())`,
        [user.id, ipAddress, userAgent]
      );

      const userProfileResult = await client.query(
        `SELECT * FROM ${user.user_type}_profiles WHERE user_id = $1`,
        [user.id]
      );
      const userProfile = userProfileResult.rows[0];

      logger.info(`User logged in with OTP: ${user.email} / ${user.phone}`);
      
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
          isLoggedIn: user.is_logged_in,
          verificationStatus: user.verification_status,
          profile: userProfile,
        }
      };
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Request OTP for phone login
   * @param {string} phone - Phone number
   * @returns {Promise<Object>} Result message
   */
  static async requestOTP(phone) {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      
      // Check if user exists
      const userResult = await pool.query(
        'SELECT user_id, email, full_legal_name FROM users u LEFT JOIN client_profiles cp ON u.id = cp.user_id WHERE u.phone = $1 OR u.phone = $2',
        [phone, formattedPhone]
      );
      
      if (userResult.rows.length === 0) {
        // Don't reveal that user doesn't exist for security
        return { message: 'If an account exists, an OTP will be sent' };
      }
      
      const user = userResult.rows[0];
      
      // Generate and send OTP
      const otp = await generateAndStoreOTP(`phone:${formattedPhone}`, 600);
      if(process.env.NODE_ENV === 'production') {
      await sendSMS(formattedPhone, `Your BeaverWorks  OTP is: ${otp}. This code expires in 10 minutes.`, user.user_id);
      }else{
         logger.info(`Test environment - OTP for ${formattedPhone}: ${otp}`);
      }
      logger.info(`OTP requested for phone: ${formattedPhone}`);
      
      return { message: 'OTP sent successfully' };
    } catch (error) {
      logger.error('OTP request error:', error);
      throw new AppError(500, 'Failed to send OTP');
    }
  }

  /**
   * Format phone number to standard format
   * @param {string} phone - Raw phone number
   * @returns {string} Formatted phone number
   */
  static formatPhoneNumber(phone) {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle Nigerian numbers
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      cleaned = '234' + cleaned.substring(1);
    } else if (cleaned.startsWith('234') && cleaned.length === 13) {
      // Already in international format
    } else if (cleaned.length === 10) {
      cleaned = '234' + cleaned;
    }
    
    // Add + prefix
    return '+' + cleaned;
  }

 // Add this method to the existing AuthService class

static async logout(userId, accessToken) {
  try {
    // Blacklist the access token
    const decoded = jwt.decode(accessToken);
    if (decoded && decoded.exp) {
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
      if (expiresIn > 0) {
        await cacheSet(`blacklist:${accessToken}`, 'true', expiresIn);
        logger.info(`Access token blacklisted for user: ${userId}`);
      }
    }
    
    // Delete refresh token from Redis
    await cacheDel(`refresh_token:${userId}`);
    
    // Update last logout time in database (optional)
    await pool.query(
      `UPDATE users SET last_logout = NOW(), is_logged_in = false WHERE id = $1`,
      [userId]
    );
    
    // Log logout activity
    await pool.query(
      `INSERT INTO user_activity_logs (user_id, action, created_at)
       VALUES ($1, 'logout', NOW())`,
      [userId]
    );
    
    logger.info(`User logged out: ${userId}`);
    
    return { 
      success: true, 
      message: 'Logged out successfully' 
    };
  } catch (error) {
    logger.error('Logout error:', error);
    throw error;
  }
}

// Optional: Add method to logout from all devices
static async logoutAllDevices(userId, currentAccessToken = null) {
  try {
    // Blacklist current token if provided
    if (currentAccessToken) {
      const decoded = jwt.decode(currentAccessToken);
      if (decoded && decoded.exp) {
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        if (expiresIn > 0) {
          await cacheSet(`blacklist:${currentAccessToken}`, 'true', expiresIn);
        }
      }
    }
    
    // Delete all refresh tokens for this user
    await cacheDel(`refresh_token:${userId}`);
    await cacheDel(`refresh_tokens:${userId}`); // If storing multiple tokens
    
    // Update last logout time and logged-in status
    await pool.query(
      `UPDATE users SET last_logout = NOW(), is_logged_in = false WHERE id = $1`,
      [userId]
    );
    
    // Log logout from all devices
    await pool.query(
      `INSERT INTO user_activity_logs (user_id, action, metadata, created_at)
       VALUES ($1, 'logout_all', $2, NOW())`,
      [userId, JSON.stringify({ message: 'Logged out from all devices' })]
    );
    
    logger.info(`User logged out from all devices: ${userId}`);
    
    return { 
      success: true, 
      message: 'Logged out from all devices successfully' 
    };
  } catch (error) {
    logger.error('Logout all devices error:', error);
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
      `UPDATE users SET is_email_verified = true 
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
      `UPDATE users SET is_phone_verified = true  WHERE phone = $1`,
      [phone]
    );
    
    logger.info(`Phone verified: ${phone}`);
    
    return { message: 'Phone verified successfully' };
  }
  


  static async sendVerificationCode(identifier) {
    // Determine if identifier is email or phone
    const isEmail = identifier.includes('@') && identifier.includes('.');
    
    if (isEmail) {
      const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [identifier]);
      if (userResult.rows.length === 0) {
        throw new AppError(404, 'User not found');
      }
      
      const otp = await generateAndStoreOTP(`email:${identifier}`, 600);
      if(process.env.NODE_ENV === 'production'){
      await sendEmail(identifier, 'Your Verification Code', `Your email verification code is: ${otp}`, userResult.rows[0].id);
     }else {
        logger.info(`Test environment - Email OTP for ${identifier}: ${otp}`);
     }
      return { message: 'Verification code sent' };
    } else {
      const formattedPhone = this.formatPhoneNumber(identifier);
      const userResult = await pool.query('SELECT id FROM users WHERE phone = $1 OR phone = $2', [identifier, formattedPhone]);
      
      if (userResult.rows.length === 0) {
        throw new AppError(404, 'User not found');
      }
      
      const otp = await generateAndStoreOTP(`phone:${formattedPhone}`, 600);
      if(process.env.NODE_ENV === 'production'){
      await sendSMS(formattedPhone, `Your BeaverWorks verification code is: ${otp}`, userResult.rows[0].id);
    }else{
      logger.info(`Test environment - Phone OTP for ${formattedPhone}: ${otp}`);
    }
      return { message: 'Verification code sent' };
    }
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
    if(process.env.NODE_ENV === 'production'){
    await sendEmail(email, 'Reset Your Password', 
      `Click here to reset your password: ${resetUrl}. This link expires in 1 hour.`, user.id);
    }else{
      logger.info(`Test environment - Password reset link for ${email}: ${resetUrl}`);
    }
    
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

  static async sendVerificationReminder(email, phone, name) {

    const userResult = await pool.query(
      'SELECT id, is_email_verified, is_phone_verified FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return; // User not found, no reminder needed
    }
    
    const user = userResult.rows[0];

    if(user.is_email_verified && user.is_phone_verified) {
      return; // User already verified, no reminder needed
    }
    
    // Send reminder email
    await sendEmail(
      email,
      'Complete Your Verification',
      `Hi ${name || 'there'},\n\nPlease complete your account verification to access all features on BeaverWorks.\n\nThank you!`,
      user.id
    );
    
    // Send reminder SMS
    if (phone) {
      await sendSMS(
        phone,
        `BeaverWorks: Please complete your account verification to access all features. Thank you!`, user.id
      );
    }
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
  
  static async deleteAccount(userId){
      const user = await pool.query(` UPDATE users SET password_hash = $1,
        is_active = false, is_verified = false, is_logged_in = false, is_email_verified = false, 
        is_phone_verified = false WHERE id = $2`, ['**%3_3uy@dhd9=', userId]);
        return ;
  }

}

module.exports = AuthService;