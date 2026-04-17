#!/usr/bin/env node

/**
 * Create admin user script
 * Usage: node scripts/create-admin.js [--email=admin@example.com] [--password=password]
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    const [key, value] = arg.replace('--', '').split('=');
    args[key] = value;
  });
  return args;
}

/**
 * Create admin user
 */
async function createAdmin(email, password, fullName = 'System Administrator') {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if user already exists
    const existingUser = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      console.log(`User with email ${email} already exists.`);
      
      // Update to admin if not already
      await client.query(
        `UPDATE users SET user_type = 'admin', is_verified = true, verification_status = 'verified' WHERE email = $1`,
        [email]
      );
      
      console.log(`User ${email} has been promoted to admin.`);
      await client.query('COMMIT');
      return;
    }
    
    // Create new admin
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    const phone = `+234${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    
    await client.query(`
      INSERT INTO users (id, email, phone, password_hash, user_type, is_verified, verification_status, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'admin', true, 'verified', true, NOW(), NOW())
    `, [userId, email, phone, hashedPassword]);
    
    await client.query(`
      INSERT INTO admin_profiles (user_id, full_name, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
    `, [userId, fullName]);
    
    await client.query('COMMIT');
    
    console.log('\n✅ Admin user created successfully!\n');
    console.log('📋 Admin Credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   User ID: ${userId}\n`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create admin:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();
  const email = args.email || 'admin@beaverworks.com';
  const password = args.password || 'Admin@123456';
  const fullName = args.name || 'System Administrator';
  
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters long');
    process.exit(1);
  }
  
  try {
    await createAdmin(email, password, fullName);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create admin:', error.message);
    process.exit(1);
  }
}

main();