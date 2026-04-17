#!/usr/bin/env node

/**
 * PM2 Helper Script
 * Usage: node scripts/pm2-helper.js [start|stop|restart|reload|status|logs|monit]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../ecosystem.config.js');
const env = process.argv[3] || process.env.NODE_ENV || 'production';

const commands = {
  start: `pm2 start ${configPath} --env ${env}`,
  stop: `pm2 stop beaverworks-api beaverworks-worker beaverworks-cron`,
  restart: `pm2 restart beaverworks-api beaverworks-worker beaverworks-cron`,
  reload: `pm2 reload beaverworks-api`,
  delete: `pm2 delete beaverworks-api beaverworks-worker beaverworks-cron`,
  status: `pm2 status`,
  logs: `pm2 logs beaverworks-api --lines 100`,
  monit: `pm2 monit`,
  save: `pm2 save`,
  resurrect: `pm2 resurrect`,
  list: `pm2 list`,
  describe: `pm2 describe beaverworks-api`,
  flush: `pm2 flush`,
  reset: `pm2 reset beaverworks-api`
};

function runCommand(command) {
  console.log(`\n🚀 Running: ${command}\n`);
  try {
    const output = execSync(command, { stdio: 'inherit', encoding: 'utf8' });
    return output;
  } catch (error) {
    console.error(`❌ Command failed: ${error.message}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
PM2 Helper Script
=================

Usage: node scripts/pm2-helper.js <command> [environment]

Commands:
  start     - Start all applications
  stop      - Stop all applications
  restart   - Restart all applications
  reload    - Reload API (zero-downtime)
  delete    - Delete all applications from PM2
  status    - Show PM2 status
  logs      - Show recent logs
  monit     - Open PM2 monitoring
  save      - Save PM2 configuration
  list      - List all processes
  describe  - Show detailed info about API
  flush     - Flush all logs
  reset     - Reset all counters

Environments:
  development (default)
  staging
  production

Examples:
  node scripts/pm2-helper.js start development
  node scripts/pm2-helper.js reload production
  node scripts/pm2-helper.js status
  `);
}

function main() {
  const command = process.argv[2];
  
  if (!command || command === 'help' || command === '--help') {
    showHelp();
    process.exit(0);
  }
  
  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
  }
  
  // Check if PM2 is installed
  try {
    execSync('pm2 --version', { stdio: 'ignore' });
  } catch (error) {
    console.log('📦 PM2 is not installed. Installing...');
    execSync('npm install -g pm2', { stdio: 'inherit' });
  }
  
  // Check if ecosystem config exists
  if (!fs.existsSync(configPath)) {
    console.error(`❌ Ecosystem config not found: ${configPath}`);
    process.exit(1);
  }
  
  console.log(`\n📋 Environment: ${env}`);
  runCommand(commands[command]);
}

main();