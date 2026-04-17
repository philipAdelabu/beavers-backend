#!/usr/bin/env node

/**
 * Generate report script
 * Usage: node scripts/generate-report.js [--type=financial] [--start=2024-01-01] [--end=2024-12-31] [--format=json]
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const REPORTS_DIR = path.join(__dirname, '../reports');

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
 * Ensure reports directory exists
 */
function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

/**
 * Generate financial report
 */
async function generateFinancialReport(startDate, endDate, format) {
  console.log(`Generating financial report from ${startDate} to ${endDate}...`);
  
  const summary = await pool.query(`
    SELECT 
      COUNT(*) as total_transactions,
      COALESCE(SUM(amount), 0) as total_revenue,
      COALESCE(AVG(amount), 0) as average_transaction,
      COALESCE(SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END), 0) as platform_fees,
      COALESCE(SUM(CASE WHEN transaction_type = 'workmanship' THEN amount ELSE 0 END), 0) as artisan_payouts,
      COALESCE(SUM(CASE WHEN transaction_type = 'materials' THEN amount ELSE 0 END), 0) as materials_cost
    FROM escrow_transactions
    WHERE status = 'released'
      AND release_date BETWEEN $1 AND $2
  `, [startDate, endDate]);
  
  const daily = await pool.query(`
    SELECT 
      DATE_TRUNC('day', release_date) as date,
      COUNT(*) as transactions,
      COALESCE(SUM(amount), 0) as revenue
    FROM escrow_transactions
    WHERE status = 'released'
      AND release_date BETWEEN $1 AND $2
    GROUP BY DATE_TRUNC('day', release_date)
    ORDER BY date ASC
  `, [startDate, endDate]);
  
  const reportData = {
    type: 'financial',
    period: { startDate, endDate },
    generatedAt: new Date().toISOString(),
    summary: summary.rows[0],
    daily: daily.rows
  };
  
  return await saveReport(reportData, format);
}

/**
 * Generate user report
 */
async function generateUserReport(startDate, endDate, format) {
  console.log(`Generating user report from ${startDate} to ${endDate}...`);
  
  const summary = await pool.query(`
    SELECT 
      COUNT(*) as total_users,
      COUNT(CASE WHEN user_type = 'client' THEN 1 END) as total_clients,
      COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as total_artisans,
      COUNT(CASE WHEN created_at BETWEEN $1 AND $2 THEN 1 END) as new_users
    FROM users
  `, [startDate, endDate]);
  
  const daily = await pool.query(`
    SELECT 
      DATE_TRUNC('day', created_at) as date,
      COUNT(CASE WHEN user_type = 'client' THEN 1 END) as new_clients,
      COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as new_artisans
    FROM users
    WHERE created_at BETWEEN $1 AND $2
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY date ASC
  `, [startDate, endDate]);
  
  const reportData = {
    type: 'user',
    period: { startDate, endDate },
    generatedAt: new Date().toISOString(),
    summary: summary.rows[0],
    daily: daily.rows
  };
  
  return await saveReport(reportData, format);
}

/**
 * Generate job report
 */
async function generateJobReport(startDate, endDate, format) {
  console.log(`Generating job report from ${startDate} to ${endDate}...`);
  
  const summary = await pool.query(`
    SELECT 
      COUNT(*) as total_jobs,
      COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
      COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
      COALESCE(AVG(jb.total_amount), 0) as average_value,
      COALESCE(SUM(jb.total_amount), 0) as total_value
    FROM jobs j
    LEFT JOIN job_billing jb ON j.id = jb.job_id
    WHERE j.created_at BETWEEN $1 AND $2
  `, [startDate, endDate]);
  
  const byCategory = await pool.query(`
    SELECT 
      category,
      COUNT(*) as job_count,
      COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_count
    FROM jobs
    WHERE created_at BETWEEN $1 AND $2
    GROUP BY category
    ORDER BY job_count DESC
  `, [startDate, endDate]);
  
  const reportData = {
    type: 'job',
    period: { startDate, endDate },
    generatedAt: new Date().toISOString(),
    summary: summary.rows[0],
    byCategory: byCategory.rows
  };
  
  return await saveReport(reportData, format);
}

/**
 * Save report to file
 */
async function saveReport(reportData, format) {
  ensureReportsDir();
  
  const timestamp = Date.now();
  const filename = `${reportData.type}_report_${timestamp}`;
  const filepath = path.join(REPORTS_DIR, `${filename}.${format}`);
  
  if (format === 'json') {
    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));
    console.log(`✅ Report saved: ${filepath}`);
    return filepath;
  }
  
  if (format === 'csv') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(reportData.type.toUpperCase());
    
    // Add headers
    worksheet.addRow([`${reportData.type.toUpperCase()} REPORT`]);
    worksheet.addRow([`Generated: ${reportData.generatedAt}`]);
    worksheet.addRow([`Period: ${reportData.period.startDate} to ${reportData.period.endDate}`]);
    worksheet.addRow([]);
    
    // Add summary
    worksheet.addRow(['SUMMARY']);
    for (const [key, value] of Object.entries(reportData.summary)) {
      worksheet.addRow([key.replace(/_/g, ' ').toUpperCase(), value]);
    }
    worksheet.addRow([]);
    
    // Add daily data
    if (reportData.daily && reportData.daily.length > 0) {
      worksheet.addRow(['DAILY BREAKDOWN']);
      const headers = Object.keys(reportData.daily[0]);
      worksheet.addRow(headers);
      for (const row of reportData.daily) {
        worksheet.addRow(Object.values(row));
      }
    }
    
    await workbook.xlsx.writeFile(filepath);
    console.log(`✅ Report saved: ${filepath}`);
    return filepath;
  }
  
  if (format === 'pdf') {
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(filepath);
    doc.pipe(writeStream);
    
    // Header
    doc.fontSize(20).text(`${reportData.type.toUpperCase()} REPORT`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${reportData.generatedAt}`, { align: 'center' });
    doc.text(`Period: ${reportData.period.startDate} to ${reportData.period.endDate}`, { align: 'center' });
    doc.moveDown();
    
    // Summary
    doc.fontSize(14).text('SUMMARY', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    for (const [key, value] of Object.entries(reportData.summary)) {
      doc.text(`${key.replace(/_/g, ' ').toUpperCase()}: ${value}`);
    }
    
    doc.end();
    
    await new Promise((resolve) => {
      writeStream.on('finish', resolve);
    });
    
    console.log(`✅ Report saved: ${filepath}`);
    return filepath;
  }
  
  return null;
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();
  const type = args.type || 'financial';
  const startDate = args.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate = args.end || new Date().toISOString().split('T')[0];
  const format = args.format || 'json';
  
  console.log('\n📊 Report Generator\n');
  console.log('='.repeat(50));
  console.log(`Type: ${type}`);
  console.log(`Period: ${startDate} to ${endDate}`);
  console.log(`Format: ${format}`);
  console.log('='.repeat(50));
  
  try {
    let filepath;
    
    switch (type) {
      case 'financial':
        filepath = await generateFinancialReport(startDate, endDate, format);
        break;
      case 'user':
        filepath = await generateUserReport(startDate, endDate, format);
        break;
      case 'job':
        filepath = await generateJobReport(startDate, endDate, format);
        break;
      default:
        console.log(`Unknown report type: ${type}`);
        console.log('Available types: financial, user, job');
        process.exit(1);
    }
    
    console.log(`\n✅ Report generated successfully: ${filepath}\n`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to generate report:', error.message);
    process.exit(1);
  }
}

main();