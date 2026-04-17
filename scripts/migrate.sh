#!/usr/bin/env node

/**
 * Database migration script
 * Usage: node scripts/migrate.js [up|down|status|reset]
 */

const { pool, query } = require('../config/database');
const fs = require('fs');
const path = require('path');
const { logger } = require('../config/logger');

const MIGRATIONS_TABLE = 'migrations';
const MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');

/**
 * Create migrations table if not exists
 */
async function createMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  logger.info('Migrations table ready');
}

/**
 * Get executed migrations
 */
async function getExecutedMigrations() {
  const result = await query(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`);
  return new Set(result.rows.map(row => row.name));
}

/**
 * Get migration files
 */
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.js'))
    .sort();
  return files;
}

/**
 * Execute a single migration
 */
async function executeMigration(migrationFile, direction = 'up') {
  const migration = require(path.join(MIGRATIONS_DIR, migrationFile));
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    if (direction === 'up') {
      await migration.up(client);
      await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [migrationFile]);
      logger.info(`Executed migration: ${migrationFile}`);
    } else {
      if (migration.down) {
        await migration.down(client);
        await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE name = $1`, [migrationFile]);
        logger.info(`Rolled back migration: ${migrationFile}`);
      }
    }
    
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Failed to execute migration ${migrationFile}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run pending migrations
 */
async function migrateUp() {
  logger.info('Running pending migrations...');
  
  await createMigrationsTable();
  
  const executed = await getExecutedMigrations();
  const migrationFiles = getMigrationFiles();
  const pending = migrationFiles.filter(file => !executed.has(file));
  
  if (pending.length === 0) {
    logger.info('No pending migrations');
    return;
  }
  
  logger.info(`Found ${pending.length} pending migration(s)`);
  
  for (const migrationFile of pending) {
    await executeMigration(migrationFile, 'up');
  }
  
  logger.info('All migrations executed successfully');
}

/**
 * Rollback last migration
 */
async function migrateDown() {
  logger.info('Rolling back last migration...');
  
  await createMigrationsTable();
  
  const executed = await getExecutedMigrations();
  const migrationFiles = getMigrationFiles();
  const lastExecuted = migrationFiles.filter(file => executed.has(file)).pop();
  
  if (!lastExecuted) {
    logger.info('No migrations to rollback');
    return;
  }
  
  await executeMigration(lastExecuted, 'down');
  logger.info(`Rolled back migration: ${lastExecuted}`);
}

/**
 * Rollback all migrations
 */
async function migrateReset() {
  logger.info('Resetting all migrations...');
  
  await createMigrationsTable();
  
  const executed = await getExecutedMigrations();
  const migrationFiles = getMigrationFiles().reverse();
  const toRollback = migrationFiles.filter(file => executed.has(file));
  
  if (toRollback.length === 0) {
    logger.info('No migrations to rollback');
    return;
  }
  
  for (const migrationFile of toRollback) {
    await executeMigration(migrationFile, 'down');
  }
  
  logger.info('All migrations rolled back successfully');
}

/**
 * Get migration status
 */
async function migrationStatus() {
  await createMigrationsTable();
  
  const executed = await getExecutedMigrations();
  const migrationFiles = getMigrationFiles();
  
  console.log('\n📊 Migration Status\n');
  console.log('='.repeat(60));
  
  for (const file of migrationFiles) {
    const status = executed.has(file) ? '✅ Executed' : '⏳ Pending';
    console.log(`${status.padEnd(12)} ${file}`);
  }
  
  console.log('='.repeat(60));
  console.log(`Total: ${migrationFiles.length} | Executed: ${executed.size} | Pending: ${migrationFiles.length - executed.size}\n`);
}

/**
 * Main function
 */
async function main() {
  const command = process.argv[2] || 'up';
  
  try {
    switch (command) {
      case 'up':
        await migrateUp();
        break;
      case 'down':
        await migrateDown();
        break;
      case 'reset':
        await migrateReset();
        break;
      case 'status':
        await migrationStatus();
        break;
      default:
        console.log(`
Usage: node scripts/migrate.js [command]

Commands:
  up      - Run pending migrations
  down    - Rollback last migration
  reset   - Rollback all migrations
  status  - Show migration status
        `);
        break;
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

main();