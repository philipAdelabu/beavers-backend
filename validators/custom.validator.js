const { pool } = require('../config/database');

/**
 * Custom validator: Check if email already exists
 */
const isEmailUnique = async (email) => {
  const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (result.rows.length > 0) {
    throw new Error('Email already exists');
  }
  return true;
};

/**
 * Custom validator: Check if phone already exists
 */
const isPhoneUnique = async (phone) => {
  const result = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (result.rows.length > 0) {
    throw new Error('Phone number already exists');
  }
  return true;
};

/**
 * Custom validator: Check if NIN already exists for clients
 */
const isNINUniqueForClient = async (nin) => {
  const result = await pool.query('SELECT id FROM client_profiles WHERE nin = $1', [nin]);
  if (result.rows.length > 0) {
    throw new Error('NIN already registered');
  }
  return true;
};

/**
 * Custom validator: Check if NIN already exists for artisans
 */
const isNINUniqueForArtisan = async (nin) => {
  const result = await pool.query('SELECT id FROM artisan_profiles WHERE nin = $1', [nin]);
  if (result.rows.length > 0) {
    throw new Error('NIN already registered');
  }
  return true;
};

/**
 * Custom validator: Check if job exists and is accessible
 */
const isJobAccessible = async (jobId, userId, userType) => {
  const result = await pool.query(
    `SELECT client_id, artisan_id FROM jobs WHERE id = $1`,
    [jobId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Job not found');
  }
  
  const job = result.rows[0];
  
  if (userType === 'client' && job.client_id !== userId) {
    throw new Error('You do not have access to this job');
  }
  
  if (userType === 'artisan' && job.artisan_id !== userId) {
    throw new Error('You do not have access to this job');
  }
  
  return true;
};

/**
 * Custom validator: Check if job status allows the operation
 */
const isJobStatusValid = async (jobId, allowedStatuses) => {
  const result = await pool.query('SELECT job_status FROM jobs WHERE id = $1', [jobId]);
  
  if (result.rows.length === 0) {
    throw new Error('Job not found');
  }
  
  const currentStatus = result.rows[0].job_status;
  
  if (!allowedStatuses.includes(currentStatus)) {
    throw new Error(`Job status '${currentStatus}' does not allow this operation`);
  }
  
  return true;
};

/**
 * Custom validator: Check if artisan is assigned to job
 */
const isArtisanAssignedToJob = async (jobId, artisanId) => {
  const result = await pool.query(
    'SELECT id FROM jobs WHERE id = $1 AND artisan_id = $2',
    [jobId, artisanId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('You are not assigned to this job');
  }
  
  return true;
};

/**
 * Custom validator: Check if user has sufficient funds
 */
const hasSufficientFunds = async (userId, amount) => {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as balance 
     FROM escrow_transactions 
     WHERE client_id = $1 AND status = 'released'`,
    [userId]
  );
  
  const balance = parseFloat(result.rows[0].balance);
  
  if (balance < amount) {
    throw new Error('Insufficient funds');
  }
  
  return true;
};

/**
 * Custom validator: Check if artisan has sufficient earnings for withdrawal
 */
const hasSufficientEarnings = async (artisanId, amount) => {
  const result = await pool.query(
    `SELECT COALESCE(SUM(workmanship_cost), 0) as earnings 
     FROM job_billing jb
     JOIN jobs j ON jb.job_id = j.id
     WHERE j.artisan_id = $1 AND jb.billing_status = 'paid'`,
    [artisanId]
  );
  
  const earnings = parseFloat(result.rows[0].earnings);
  
  if (earnings < amount) {
    throw new Error('Insufficient earnings for withdrawal');
  }
  
  return true;
};

/**
 * Custom validator: Check if PIN is valid for job
 */
const isValidArrivalPIN = async (jobId, pin) => {
  const result = await pool.query(
    `SELECT id FROM arrival_pins 
     WHERE job_id = $1 AND pin = $2 AND is_used = false AND expires_at > NOW()`,
    [jobId, pin]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Invalid or expired PIN');
  }
  
  return true;
};

/**
 * Custom validator: Check if promotion code is valid
 */
const isValidPromotionCode = async (code, clientId) => {
  const result = await pool.query(
    `SELECT * FROM promotions 
     WHERE code = $1 AND is_active = true 
       AND start_date <= NOW() AND end_date >= NOW()
       AND (max_uses IS NULL OR used_count < max_uses)`,
    [code]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Invalid or expired promotion code');
  }
  
  const promotion = result.rows[0];
  
  if (promotion.is_new_users_only) {
    const userJobs = await pool.query(
      'SELECT id FROM jobs WHERE client_id = $1',
      [clientId]
    );
    
    if (userJobs.rows.length > 0) {
      throw new Error('This promotion is for new users only');
    }
  }
  
  const usageCheck = await pool.query(
    'SELECT id FROM promotion_usage WHERE promotion_id = $1 AND user_id = $2',
    [promotion.id, clientId]
  );
  
  if (usageCheck.rows.length > 0) {
    throw new Error('You have already used this promotion');
  }
  
  return true;
};

/**
 * Custom validator: Check if date range is valid
 */
const isValidDateRange = (startDate, endDate) => {
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    throw new Error('Start date must be before end date');
  }
  return true;
};

/**
 * Custom validator: Check if coordinates are within Nigeria
 */
const isWithinNigeria = (latitude, longitude) => {
  // Approximate bounding box for Nigeria
  const nigeriaBounds = {
    north: 13.9,
    south: 4.2,
    east: 14.7,
    west: 2.7
  };
  
  if (latitude < nigeriaBounds.south || latitude > nigeriaBounds.north ||
      longitude < nigeriaBounds.west || longitude > nigeriaBounds.east) {
    throw new Error('Coordinates must be within Nigeria');
  }
  
  return true;
};

/**
 * Custom validator: Check if file is allowed type
 */
const isAllowedFileType = (file, allowedTypes) => {
  if (!file) return true;
  
  const allowedMimeTypes = {
    image: ['image/jpeg', 'image/png', 'image/gif', 'image/heic'],
    document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    video: ['video/mp4', 'video/mov', 'video/avi']
  };
  
  let allAllowed = [];
  for (const type of allowedTypes) {
    allAllowed = [...allAllowed, ...allowedMimeTypes[type]];
  }
  
  if (!allAllowed.includes(file.mimetype)) {
    throw new Error(`File type ${file.mimetype} is not allowed`);
  }
  
  return true;
};

module.exports = {
  isEmailUnique,
  isPhoneUnique,
  isNINUniqueForClient,
  isNINUniqueForArtisan,
  isJobAccessible,
  isJobStatusValid,
  isArtisanAssignedToJob,
  hasSufficientFunds,
  hasSufficientEarnings,
  isValidArrivalPIN,
  isValidPromotionCode,
  isValidDateRange,
  isWithinNigeria,
  isAllowedFileType
};