const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class ReportService {
  static async generateFinancialReport(startDate, endDate, format = 'json') {
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
        COALESCE(SUM(amount), 0) as revenue,
        COALESCE(AVG(amount), 0) as average_amount
      FROM escrow_transactions
      WHERE status = 'released'
        AND release_date BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('day', release_date)
      ORDER BY date ASC
    `, [startDate, endDate]);
    
    const byCategory = await pool.query(`
      SELECT 
        j.category,
        COUNT(*) as transactions,
        COALESCE(SUM(et.amount), 0) as revenue
      FROM escrow_transactions et
      JOIN jobs j ON et.job_id = j.id
      WHERE et.status = 'released'
        AND et.release_date BETWEEN $1 AND $2
      GROUP BY j.category
      ORDER BY revenue DESC
    `, [startDate, endDate]);
    
    const reportData = {
      summary: summary.rows[0],
      daily: daily.rows,
      byCategory: byCategory.rows,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString()
    };
    
    if (format === 'excel') {
      return await this.exportToExcel(reportData, 'financial');
    } else if (format === 'pdf') {
      return await this.exportToPDF(reportData, 'financial');
    }
    
    return reportData;
  }
  
  static async generateUserReport(startDate, endDate, format = 'json') {
    const summary = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN user_type = 'client' THEN 1 END) as total_clients,
        COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as total_artisans,
        COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN created_at BETWEEN $1 AND $2 THEN 1 END) as new_users
      FROM users
    `, [startDate, endDate]);
    
    const daily = await pool.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(CASE WHEN user_type = 'client' THEN 1 END) as new_clients,
        COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as new_artisans,
        COUNT(*) as total_new
      FROM users
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `, [startDate, endDate]);
    
    const byLocation = await pool.query(`
      SELECT 
        COALESCE(cp.service_address->>'zone', ap.residential_address->>'zone', 'Unknown') as zone,
        COUNT(CASE WHEN u.user_type = 'client' THEN 1 END) as clients,
        COUNT(CASE WHEN u.user_type = 'artisan' THEN 1 END) as artisans
      FROM users u
      LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
      LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
      WHERE u.created_at BETWEEN $1 AND $2
      GROUP BY zone
      ORDER BY total DESC
    `, [startDate, endDate]);
    
    const reportData = {
      summary: summary.rows[0],
      daily: daily.rows,
      byLocation: byLocation.rows,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString()
    };
    
    if (format === 'excel') {
      return await this.exportToExcel(reportData, 'users');
    } else if (format === 'pdf') {
      return await this.exportToPDF(reportData, 'users');
    }
    
    return reportData;
  }
  
  static async generateJobReport(startDate, endDate, format = 'json') {
    const summary = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
        COUNT(CASE WHEN job_status IN ('pending', 'accepted', 'arrived', 'diagnostics', 'execution') THEN 1 END) as active_jobs,
        COALESCE(AVG(jb.total_amount), 0) as average_job_value,
        COALESCE(SUM(jb.total_amount), 0) as total_revenue
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.created_at BETWEEN $1 AND $2
    `, [startDate, endDate]);
    
    const daily = await pool.query(`
      SELECT 
        DATE_TRUNC('day', j.created_at) as date,
        COUNT(*) as jobs_created,
        COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as jobs_completed,
        COALESCE(AVG(jb.total_amount), 0) as average_value
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.created_at BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('day', j.created_at)
      ORDER BY date ASC
    `, [startDate, endDate]);
    
    const byCategory = await pool.query(`
      SELECT 
        category,
        COUNT(*) as job_count,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_count,
        COALESCE(AVG(jb.total_amount), 0) as average_value,
        COALESCE(SUM(jb.total_amount), 0) as total_value
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.created_at BETWEEN $1 AND $2
      GROUP BY category
      ORDER BY job_count DESC
    `, [startDate, endDate]);
    
    const byTier = await pool.query(`
      SELECT 
        ap.tier_level,
        COUNT(*) as job_count,
        COALESCE(AVG(jb.workmanship_cost), 0) as average_earning
      FROM jobs j
      JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.job_status = 'completed'
        AND j.completed_at BETWEEN $1 AND $2
      GROUP BY ap.tier_level
      ORDER BY ap.tier_level ASC
    `, [startDate, endDate]);
    
    const reportData = {
      summary: summary.rows[0],
      daily: daily.rows,
      byCategory: byCategory.rows,
      byTier: byTier.rows,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString()
    };
    
    if (format === 'excel') {
      return await this.exportToExcel(reportData, 'jobs');
    } else if (format === 'pdf') {
      return await this.exportToPDF(reportData, 'jobs');
    }
    
    return reportData;
  }
  
  static async generateArtisanPerformanceReport(startDate, endDate, format = 'json') {
    const topArtisans = await pool.query(`
      SELECT 
        ap.user_id,
        ap.full_legal_name,
        ap.skill_category,
        ap.tier_level,
        ap.star_rating,
        COUNT(j.id) as total_jobs,
        COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as completed_jobs,
        COALESCE(SUM(jb.workmanship_cost), 0) as total_earnings,
        COALESCE(AVG(jb.workmanship_cost), 0) as average_earning,
        COALESCE(AVG(r.rating), 0) as avg_rating
      FROM artisan_profiles ap
      LEFT JOIN jobs j ON ap.user_id = j.artisan_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      LEFT JOIN ratings r ON j.id = r.job_id AND r.reviewee_id = ap.user_id
      WHERE j.completed_at BETWEEN $1 AND $2
      GROUP BY ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, ap.star_rating
      ORDER BY completed_jobs DESC
      LIMIT 50
    `, [startDate, endDate]);
    
    const tierDistribution = await pool.query(`
      SELECT 
        ap.tier_level,
        COUNT(DISTINCT ap.user_id) as artisan_count,
        AVG(ap.star_rating) as avg_rating,
        AVG(ap.completion_rate) as avg_completion_rate
      FROM artisan_profiles ap
      WHERE ap.user_id IN (
        SELECT DISTINCT artisan_id FROM jobs WHERE completed_at BETWEEN $1 AND $2
      )
      GROUP BY ap.tier_level
      ORDER BY ap.tier_level ASC
    `, [startDate, endDate]);
    
    const reportData = {
      topArtisans: topArtisans.rows,
      tierDistribution: tierDistribution.rows,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString()
    };
    
    if (format === 'excel') {
      return await this.exportToExcel(reportData, 'artisan_performance');
    } else if (format === 'pdf') {
      return await this.exportToPDF(reportData, 'artisan_performance');
    }
    
    return reportData;
  }
  
  static async generateDisputeReport(startDate, endDate, format = 'json') {
    const summary = await pool.query(`
      SELECT 
        COUNT(*) as total_disputes,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_resolution_hours
      FROM disputes
      WHERE created_at BETWEEN $1 AND $2
    `, [startDate, endDate]);
    
    const byReason = await pool.query(`
      SELECT 
        reason,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count
      FROM disputes
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY reason
      ORDER BY count DESC
    `, [startDate, endDate]);
    
    const reportData = {
      summary: summary.rows[0],
      byReason: byReason.rows,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString()
    };
    
    if (format === 'excel') {
      return await this.exportToExcel(reportData, 'disputes');
    } else if (format === 'pdf') {
      return await this.exportToPDF(reportData, 'disputes');
    }
    
    return reportData;
  }
  
  static async exportToExcel(data, reportType) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(reportType.toUpperCase());
    
    // Add header
    worksheet.addRow([`${reportType.toUpperCase()} REPORT`]);
    worksheet.addRow([`Generated: ${data.generatedAt}`]);
    worksheet.addRow([`Period: ${data.period.startDate} to ${data.period.endDate}`]);
    worksheet.addRow([]);
    
    // Add summary
    worksheet.addRow(['SUMMARY']);
    if (data.summary) {
      for (const [key, value] of Object.entries(data.summary)) {
        worksheet.addRow([key.replace(/_/g, ' ').toUpperCase(), value]);
      }
    }
    worksheet.addRow([]);
    
    // Add detailed data based on report type
    if (reportType === 'financial' && data.daily) {
      worksheet.addRow(['DAILY BREAKDOWN']);
      worksheet.addRow(['Date', 'Transactions', 'Revenue', 'Average Amount']);
      for (const row of data.daily) {
        worksheet.addRow([row.date, row.transactions, row.revenue, row.average_amount]);
      }
    }
    
    if (reportType === 'users' && data.daily) {
      worksheet.addRow(['DAILY BREAKDOWN']);
      worksheet.addRow(['Date', 'New Clients', 'New Artisans', 'Total New']);
      for (const row of data.daily) {
        worksheet.addRow([row.date, row.new_clients, row.new_artisans, row.total_new]);
      }
    }
    
    if (reportType === 'jobs' && data.daily) {
      worksheet.addRow(['DAILY BREAKDOWN']);
      worksheet.addRow(['Date', 'Jobs Created', 'Jobs Completed', 'Average Value']);
      for (const row of data.daily) {
        worksheet.addRow([row.date, row.jobs_created, row.jobs_completed, row.average_value]);
      }
    }
    
    // Style the worksheet
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.getRow(5).font = { bold: true };
    worksheet.getColumn(1).width = 30;
    worksheet.getColumn(2).width = 20;
    worksheet.getColumn(3).width = 20;
    worksheet.getColumn(4).width = 20;
    
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }
  
  static async exportToPDF(data, reportType) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Header
      doc.fontSize(20).text(`${reportType.toUpperCase()} REPORT`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${data.generatedAt}`, { align: 'center' });
      doc.text(`Period: ${data.period.startDate} to ${data.period.endDate}`, { align: 'center' });
      doc.moveDown();
      
      // Summary
      doc.fontSize(14).text('SUMMARY', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      
      if (data.summary) {
        for (const [key, value] of Object.entries(data.summary)) {
          doc.text(`${key.replace(/_/g, ' ').toUpperCase()}: ${value}`);
        }
      }
      doc.moveDown();
      
      // Detailed data
      if (reportType === 'financial' && data.daily) {
        doc.fontSize(12).text('DAILY BREAKDOWN', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(9);
        
        doc.text('Date'.padEnd(15) + 'Transactions'.padEnd(15) + 'Revenue'.padEnd(15) + 'Average Amount');
        doc.text('-'.repeat(60));
        
        for (const row of data.daily) {
          doc.text(
            row.date.toISOString().split('T')[0].padEnd(15) +
            row.transactions.toString().padEnd(15) +
            `₦${row.revenue.toLocaleString()}`.padEnd(15) +
            `₦${row.average_amount.toLocaleString()}`
          );
        }
      }
      
      if (reportType === 'users' && data.daily) {
        doc.fontSize(12).text('DAILY BREAKDOWN', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(9);
        
        doc.text('Date'.padEnd(15) + 'New Clients'.padEnd(15) + 'New Artisans'.padEnd(15) + 'Total New');
        doc.text('-'.repeat(60));
        
        for (const row of data.daily) {
          doc.text(
            row.date.toISOString().split('T')[0].padEnd(15) +
            row.new_clients.toString().padEnd(15) +
            row.new_artisans.toString().padEnd(15) +
            row.total_new.toString()
          );
        }
      }
      
      doc.end();
    });
  }
  
  static async saveReport(reportData, reportType, userId) {
    const result = await pool.query(
      `INSERT INTO saved_reports (user_id, report_type, data, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id`,
      [userId, reportType, reportData]
    );
    
    logger.info(`Report saved: ${reportType} by user ${userId}`);
    
    return result.rows[0].id;
  }
  
  static async getSavedReports(userId, reportType = null) {
    let query = `
      SELECT id, report_type, created_at
      FROM saved_reports
      WHERE user_id = $1
    `;
    const params = [userId];
    
    if (reportType) {
      query += ` AND report_type = $2`;
      params.push(reportType);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }
  
  static async getSavedReport(reportId, userId) {
    const result = await pool.query(
      `SELECT * FROM saved_reports WHERE id = $1 AND user_id = $2`,
      [reportId, userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Report not found');
    }
    
    return result.rows[0];
  }
  
  static async deleteSavedReport(reportId, userId) {
    const result = await pool.query(
      `DELETE FROM saved_reports WHERE id = $1 AND user_id = $2 RETURNING id`,
      [reportId, userId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Report not found');
    }
    
    return true;
  }
}

module.exports = ReportService;