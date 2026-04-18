#!/usr/bin/env node

/**
 * Database seeder script
 * Usage: node scripts/seed.js [--all] [--test]
 */

const { pool, query } = require('../config/database');
const fs = require('fs');
const path = require('path');
const { logger } = require('../config/logger');

const SEEDERS_TABLE = 'seeders';
const SEEDERS_DIR = path.join(__dirname, '../database/seeders');

/**
 * Create seeders table if not exists
 */
async function createSeedersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${SEEDERS_TABLE} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('Seeders table ready');
}

/**
 * Get executed seeders
 */
async function getExecutedSeeders() {
  const result = await query(`SELECT name FROM ${SEEDERS_TABLE} ORDER BY id`);
  return new Set(result.rows.map(row => row.name));
}

/**
 * Get seeder files
 */
function getSeederFiles(includeTest = false) {
  let files = fs.readdirSync(SEEDERS_DIR)
    .filter(file => file.endsWith('.js'))
    .sort();
  
  if (!includeTest) {
    files = files.filter(file => !file.includes('test') && !file.includes('011_test_data'));
  }
  
  return files;
}

/**
 * Execute a single seeder
 */
async function executeSeeder(seederFile) {
  const seeder = require(path.join(SEEDERS_DIR, seederFile));
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    await seeder.up(client);
    await client.query(`INSERT INTO ${SEEDERS_TABLE} (name) VALUES ($1)`, [seederFile]);
    
    await client.query('COMMIT');
    logger.info(`Executed seeder: ${seederFile}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Failed to execute seeder ${seederFile}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run pending seeders
 */
async function seedAll(includeTest = false) {
  logger.info('Running seeders...');
  
  await createSeedersTable();
  
  const executed = await getExecutedSeeders();
  const seederFiles = getSeederFiles(includeTest);
  const pending = seederFiles.filter(file => !executed.has(file));
  
  if (pending.length === 0) {
    logger.info('No pending seeders');
    return;
  }
  
  logger.info(`Found ${pending.length} pending seeder(s)`);
  
  for (const seederFile of pending) {
    await executeSeeder(seederFile);
  }
  
  logger.info('All seeders executed successfully');
}

/**
 * Reset all seeders
 */
async function seedReset() {
  logger.info('Resetting all seeders...');
  
  await createSeedersTable();
  
  const executed = await getExecutedSeeders();
  const seederFiles = getSeederFiles(true).reverse();
  const toReset = seederFiles.filter(file => executed.has(file));
  
  if (toReset.length === 0) {
    logger.info('No seeders to reset');
    return;
  }
  
  for (const seederFile of toReset) {
    const seeder = require(path.join(SEEDERS_DIR, seederFile));
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (seeder.down) {
        await seeder.down(client);
      }
      await client.query(`DELETE FROM ${SEEDERS_TABLE} WHERE name = $1`, [seederFile]);
      
      await client.query('COMMIT');
      logger.info(`Reset seeder: ${seederFile}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to reset seeder ${seederFile}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  logger.info('All seeders reset successfully');
}

/**
 * Get seeder status
 */
async function seederStatus() {
  await createSeedersTable();
  
  const executed = await getExecutedSeeders();
  const seederFiles = getSeederFiles(true);
  
  console.log('\n🌱 Seeder Status\n');
  console.log('='.repeat(60));
  
  for (const file of seederFiles) {
    const status = executed.has(file) ? '✅ Executed' : '⏳ Pending';
    const isTest = file.includes('test') ? ' (test)' : '';
    console.log(`${status.padEnd(12)} ${file}${isTest}`);
  }
  
  console.log('='.repeat(60));
  console.log(`Total: ${seederFiles.length} | Executed: ${executed.size} | Pending: ${seederFiles.length - executed.size}\n`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const includeTest = args.includes('--test') || args.includes('-t');
  const reset = args.includes('--reset') || args.includes('-r');
  const status = args.includes('--status') || args.includes('-s');
  
  try {
    if (reset) {
      await seedReset();
    } else if (status) {
      await seederStatus();
    } else {
      await seedAll(includeTest);
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  }
}

main();