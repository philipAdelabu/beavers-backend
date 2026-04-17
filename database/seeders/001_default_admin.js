const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * Create default admin user
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  const adminId = uuidv4();
  const hashedPassword = await bcrypt.hash('Admin@123456', 10);
  
  // Check if admin already exists
  const existingAdmin = await queryInterface.query(
    `SELECT id FROM users WHERE email = 'admin@beaverworks.com'`
  );
  
  if (existingAdmin.rows.length > 0) {
    console.log('Admin user already exists. Skipping...');
    return;
  }
  
  // Create admin user
  await queryInterface.query(`
    INSERT INTO users (id, email, phone, password_hash, user_type, is_verified, verification_status, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
  `, [adminId, 'admin@beaverworks.com', '+2348012345678', hashedPassword, 'admin', true, 'verified', true]);
  
  console.log(`Default admin created with ID: ${adminId}`);
  console.log('Admin credentials:');
  console.log('Email: admin@beaverworks.com');
  console.log('Password: Admin@123456');
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DELETE FROM users WHERE email = 'admin@beaverworks.com'
  `);
  console.log('Default admin removed');
};