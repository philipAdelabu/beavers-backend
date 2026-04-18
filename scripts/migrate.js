#!/usr/bin/env node

/**
 * Database migration script
 * Usage: node scripts/migrate.js [up|down|status|reset]
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

const MIGRATIONS_TABLE = 'migrations';
const MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');

/**
 * Execute a query using the pool
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
const executeQuery = async (text, params = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
};

/**
 * Create migrations table if not exists
 */
async function createMigrationsTable() {
  await executeQuery(`
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
  const result = await executeQuery(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`);
  return new Set(result.rows.map(row => row.name));
}

/**
 * Get migration files
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }
  
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.js'))
    .sort();
  return files;
}

/**
 * Execute a single migration
 */
async function executeMigration(migrationFile, direction = 'up') {
  const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
  const migration = require(migrationPath);
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    if (direction === 'up') {
      // Call the up function with the client
      if (typeof migration.up === 'function') {
        await migration.up(client);
      } else if (typeof migration.up === 'object' && migration.up.query) {
        // Handle case where up is exported as an object with query method
        await client.query(migration.up.query);
      }
      
      await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [migrationFile]);
      logger.info(`Executed migration: ${migrationFile}`);
    } else {
      if (migration.down) {
        if (typeof migration.down === 'function') {
          await migration.down(client);
        } else if (typeof migration.down === 'object' && migration.down.query) {
          await client.query(migration.down.query);
        }
        await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE name = $1`, [migrationFile]);
        logger.info(`Rolled back migration: ${migrationFile}`);
      } else {
        logger.warn(`No down migration for: ${migrationFile}`);
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
 * Create a new migration file
 * @param {string} name - Migration name
 */
async function createMigration(name) {
  if (!name) {
    console.error('Please provide a migration name');
    console.log('Usage: node scripts/migrate.js create <migration_name>');
    process.exit(1);
  }
  
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const fileName = `${timestamp}_${name}.js`;
  const filePath = path.join(MIGRATIONS_DIR, fileName);
  
  const template = `exports.up = async (queryInterface) => {
  await queryInterface.query(\`
    -- Write your migration SQL here
  \`);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(\`
    -- Write your rollback SQL here
  \`);
};
`;
  
  fs.writeFileSync(filePath, template);
  console.log(`✅ Migration created: ${filePath}`);
}

/**
 * Main function
 */
async function main() {
  const command = process.argv[2] || 'up';
  const migrationName = process.argv[3];
  
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
      case 'create':
        await createMigration(migrationName);
        break;
      default:
        console.log(`
📋 Migration Script Usage
=========================

Commands:
  up      - Run pending migrations
  down    - Rollback last migration
  reset   - Rollback all migrations
  status  - Show migration status
  create  - Create a new migration file

Examples:
  node scripts/migrate.js up
  node scripts/migrate.js down
  node scripts/migrate.js status
  node scripts/migrate.js create add_users_table
        `);
        break;
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

main();