#!/usr/bin/env node

/**
 * Clean logs script
 * Usage: node scripts/clean-logs.js [--days=30]
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../config/logger');

const LOGS_DIR = path.join(__dirname, '../logs');
const DEFAULT_DAYS = 30;

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
 * Get file age in days
 */
function getFileAgeDays(filepath) {
  const stats = fs.statSync(filepath);
  const ageMs = Date.now() - stats.mtimeMs;
  return ageMs / (1000 * 60 * 60 * 24);
}

/**
 * Clean old log files
 */
async function cleanLogs(daysToKeep) {
  console.log(`\n🧹 Cleaning log files older than ${daysToKeep} days...\n`);
  console.log('='.repeat(50));
  
  if (!fs.existsSync(LOGS_DIR)) {
    console.log('Logs directory does not exist.');
    return;
  }
  
  const files = fs.readdirSync(LOGS_DIR);
  let deletedCount = 0;
  let totalSize = 0;
  
  for (const file of files) {
    const filepath = path.join(LOGS_DIR, file);
    const stats = fs.statSync(filepath);
    
    if (stats.isFile()) {
      const ageDays = getFileAgeDays(filepath);
      
      if (ageDays > daysToKeep) {
        const fileSizeMB = stats.size / (1024 * 1024);
        fs.unlinkSync(filepath);
        deletedCount++;
        totalSize += fileSizeMB;
        console.log(`🗑️  Deleted: ${file} (${fileSizeMB.toFixed(2)} MB, ${ageDays.toFixed(1)} days old)`);
      }
    }
  }
  
  console.log('='.repeat(50));
  console.log(`\n✅ Cleanup completed:`);
  console.log(`   Files deleted: ${deletedCount}`);
  console.log(`   Space freed: ${totalSize.toFixed(2)} MB\n`);
}

/**
 * Show log statistics
 */
async function showStats() {
  console.log('\n📊 Log Statistics\n');
  console.log('='.repeat(50));
  
  if (!fs.existsSync(LOGS_DIR)) {
    console.log('Logs directory does not exist.');
    return;
  }
  
  const files = fs.readdirSync(LOGS_DIR);
  let totalSize = 0;
  let fileCount = 0;
  
  for (const file of files) {
    const filepath = path.join(LOGS_DIR, file);
    const stats = fs.statSync(filepath);
    
    if (stats.isFile()) {
      const sizeMB = stats.size / (1024 * 1024);
      totalSize += sizeMB;
      fileCount++;
      console.log(`${file}: ${sizeMB.toFixed(2)} MB`);
    }
  }
  
  console.log('='.repeat(50));
  console.log(`Total files: ${fileCount}`);
  console.log(`Total size: ${totalSize.toFixed(2)} MB\n`);
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();
  const daysToKeep = parseInt(args.days) || DEFAULT_DAYS;
  const showStatsOnly = args.stats === 'true' || args.stats === true;
  
  if (showStatsOnly) {
    await showStats();
  } else {
    await cleanLogs(daysToKeep);
    await showStats();
  }
  
  process.exit(0);
}

main();