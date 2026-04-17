const { v4: uuidv4 } = require('uuid');

/**
 * Seed fee configuration
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  // Get admin user ID
  const admin = await queryInterface.query(`
    SELECT id FROM users WHERE email = 'admin@beaverworks.com'
  `);
  
  const adminId = admin.rows[0]?.id || null;
  
  const feeConfig = {
    id: uuidv4(),
    base_fee: 2500,
    diagnostics_rate_per_minute: 500,
    execution_rate_per_minute: 1000,
    platform_commission_percent: 10,
    monthly_technology_fee: 5000,
    onboarding_fee: 5000,
    cancellation_fee: 0,
    dispute_fee: 0,
    updated_by: adminId
  };
  
  const existing = await queryInterface.query(`
    SELECT id FROM fee_configuration LIMIT 1
  `);
  
  if (existing.rows.length === 0) {
    await queryInterface.query(`
      INSERT INTO fee_configuration (id, base_fee, diagnostics_rate_per_minute, execution_rate_per_minute, platform_commission_percent, monthly_technology_fee, onboarding_fee, cancellation_fee, dispute_fee, updated_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
    `, [
      feeConfig.id, feeConfig.base_fee, feeConfig.diagnostics_rate_per_minute,
      feeConfig.execution_rate_per_minute, feeConfig.platform_commission_percent,
      feeConfig.monthly_technology_fee, feeConfig.onboarding_fee,
      feeConfig.cancellation_fee, feeConfig.dispute_fee, feeConfig.updated_by
    ]);
    console.log('Fee configuration created');
  } else {
    console.log('Fee configuration already exists');
  }
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`DELETE FROM fee_configuration`);
  console.log('Fee configuration removed');
};