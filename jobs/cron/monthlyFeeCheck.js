const cron = require('node-cron');
const { pool } = require('../../config/database');
const { logger } = require('../../config/logger');
const { sendEmail, sendSMS } = require('../../services/notification.service');

const checkMonthlyFees = async () => {
  logger.info('Running monthly fee check cron job');
  
  try {
    // Find artisans with overdue fees
    const result = await pool.query(`
      SELECT ap.*, u.email, u.phone, u.full_legal_name
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE ap.monthly_fee_status = 'pending'
      AND ap.last_fee_payment < NOW() - INTERVAL '30 days'
    `);
    
    for (const artisan of result.rows) {
      // Send reminder notifications
      await sendEmail(artisan.email, 'Monthly Fee Reminder', 
        `Your monthly technology fee of ₦5,000 is due. Pay now to avoid suspension.`);
      
      await sendSMS(artisan.phone, 
        `BeaverWorks: Your monthly fee is due. Pay ₦5,000 to keep your account active.`);
      
      // Check if grace period has passed
      const daysOverdue = Math.floor((Date.now() - artisan.last_fee_payment) / (1000 * 60 * 60 * 24));
      
      if (daysOverdue > 7) {
        // Suspend artisan
        await pool.query(`
          UPDATE artisan_profiles 
          SET monthly_fee_status = 'suspended', is_available = false
          WHERE user_id = $1
        `, [artisan.user_id]);
        
        await sendEmail(artisan.email, 'Account Suspended', 
          'Your account has been suspended due to non-payment of monthly fees.');
      }
    }
    
    logger.info(`Processed ${result.rows.length} artisans with overdue fees`);
  } catch (error) {
    logger.error('Monthly fee check error:', error);
  }
};

// Run every day at midnight
cron.schedule('0 0 * * *', checkMonthlyFees);

module.exports = { checkMonthlyFees };