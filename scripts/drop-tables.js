#!/usr/bin/env node


const { pool } = require('../config/database');
const { logger } = require('../config/logger');

async function dropTrainingTables() {
  console.log('⚠️  WARNING: This will drop all training-related tables and data!');
  console.log('Press Ctrl+C to cancel or Enter to continue...');
  
  // Wait for user confirmation
  await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Drop tables in correct order (due to foreign key constraints)
    await client.query(`DROP TABLE IF EXISTS tier_requirements CASCADE`);
    await client.query(`DROP TABLE IF EXISTS artisan_tier_history CASCADE`);
    await client.query(`DROP TABLE IF EXISTS course_reviews CASCADE`);
    await client.query(`DROP TABLE IF EXISTS certificates CASCADE`);
    await client.query(`DROP TABLE IF EXISTS module_completions CASCADE`);
    await client.query(`DROP TABLE IF EXISTS course_enrollments CASCADE`);
    await client.query(`DROP TABLE IF EXISTS training_courses CASCADE`);
    
    // Remove from migrations table
    await client.query(
      `DELETE FROM migrations WHERE name LIKE '%training%'`
    );
    
    await client.query('COMMIT');
    
    console.log('✅ Training tables dropped successfully');
    console.log('You can now run the new migration: node scripts/migrate.js up');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to drop training tables:', error.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

dropTrainingTables();