#!/usr/bin/env node

/**
 * Health check script
 * Usage: node scripts/health-check.js
 */

const axios = require('axios');
const { pool } = require('../config/database');
const { redis } = require('../config/redis');
const { logger } = require('../config/logger');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Check API health
 */
async function checkAPI() {
  try {
    const start = Date.now();
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    const duration = Date.now() - start;
    
    if (response.status === 200) {
      console.log(`✅ API Health: OK (${duration}ms)`);
      return true;
    } else {
      console.log(`❌ API Health: Failed (Status: ${response.status})`);
      return false;
    }
  } catch (error) {
    console.log(`❌ API Health: ${error.message}`);
    return false;
  }
}

/**
 * Check database health
 */
async function checkDatabase() {
  try {
    const start = Date.now();
    const result = await pool.query('SELECT 1 as health');
    const duration = Date.now() - start;
    
    if (result.rows[0]?.health === 1) {
      console.log(`✅ Database Health: OK (${duration}ms)`);
      return true;
    } else {
      console.log('❌ Database Health: Failed');
      return false;
    }
  } catch (error) {
    console.log(`❌ Database Health: ${error.message}`);
    return false;
  }
}

/**
 * Check Redis health
 */
async function checkRedis() {
  try {
    const start = Date.now();
    await redis.ping();
    const duration = Date.now() - start;
    
    console.log(`✅ Redis Health: OK (${duration}ms)`);
    return true;
  } catch (error) {
    console.log(`❌ Redis Health: ${error.message}`);
    return false;
  }
}

/**
 * Check disk space
 */
async function checkDiskSpace() {
  const fs = require('fs');
  
  try {
    const stats = fs.statfsSync('/');
    const freeGB = (stats.bfree * stats.bsize) / (1024 * 1024 * 1024);
    const totalGB = (stats.blocks * stats.bsize) / (1024 * 1024 * 1024);
    const usedPercent = ((totalGB - freeGB) / totalGB) * 100;
    
    if (usedPercent < 90) {
      console.log(`✅ Disk Space: ${freeGB.toFixed(2)}GB free / ${totalGB.toFixed(2)}GB total (${usedPercent.toFixed(1)}% used)`);
      return true;
    } else {
      console.log(`⚠️  Disk Space: Low space! ${freeGB.toFixed(2)}GB free (${usedPercent.toFixed(1)}% used)`);
      return false;
    }
  } catch (error) {
    console.log(`⚠️  Disk Space: Could not check (${error.message})`);
    return true;
  }
}

/**
 * Check memory usage
 */
async function checkMemory() {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
  const rssMB = memoryUsage.rss / 1024 / 1024;
  
  const heapPercent = (heapUsedMB / heapTotalMB) * 100;
  
  if (heapPercent < 90) {
    console.log(`✅ Memory: Heap: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB (${heapPercent.toFixed(1)}%), RSS: ${rssMB.toFixed(2)}MB`);
    return true;
  } else {
    console.log(`⚠️  Memory: High heap usage! ${heapPercent.toFixed(1)}%`);
    return false;
  }
}

/**
 * Check uptime
 */
async function checkUptime() {
  const uptimeSeconds = process.uptime();
  const uptimeHours = uptimeSeconds / 3600;
  const uptimeDays = uptimeHours / 24;
  
  if (uptimeDays >= 1) {
    console.log(`✅ Uptime: ${uptimeDays.toFixed(1)} days`);
  } else if (uptimeHours >= 1) {
    console.log(`✅ Uptime: ${uptimeHours.toFixed(1)} hours`);
  } else {
    console.log(`✅ Uptime: ${Math.floor(uptimeSeconds / 60)} minutes`);
  }
  
  return true;
}

/**
 * Main function
 */
async function main() {
  console.log('\n🏥 BeaverWorks Health Check\n');
  console.log('='.repeat(50));
  
  const results = await Promise.all([
    checkAPI(),
    checkDatabase(),
    checkRedis(),
    checkDiskSpace(),
    checkMemory(),
    checkUptime()
  ]);
  
  console.log('='.repeat(50));
  
  const allHealthy = results.every(result => result === true);
  
  if (allHealthy) {
    console.log('\n✅ All systems are healthy!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some systems are unhealthy. Please check the logs.\n');
    process.exit(1);
  }
}

main();