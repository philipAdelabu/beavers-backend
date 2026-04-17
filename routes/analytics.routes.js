const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const { pool } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const { sendSuccess, sendError } = require('../utils/response');
const { AppError } = require('../middleware/error.middleware');
const { logger } = require('../config/logger');

// Get platform analytics (admin only)
router.get('/platform', authenticateToken, requireRole(['admin']), [
  query('period').optional().isIn(['day', 'week', 'month', 'year', 'all']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { period = 'month', startDate, endDate } = req.query;
    const cacheKey = `analytics:platform:${period}:${startDate || ''}:${endDate || ''}`;
    
    // Try to get from cache
    let analytics = await cacheGet(cacheKey);
    
    if (!analytics) {
      let dateCondition = '';
      const queryParams = [];
      
      if (startDate && endDate) {
        dateCondition = 'AND created_at BETWEEN $1 AND $2';
        queryParams.push(startDate, endDate);
      } else if (period !== 'all') {
        const interval = period === 'day' ? '1 day' : period === 'week' ? '7 days' : period === 'month' ? '30 days' : '365 days';
        dateCondition = `AND created_at > NOW() - INTERVAL '${interval}'`;
      }
      
      // Get user statistics
      const userStats = await pool.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN user_type = 'client' THEN 1 END) as total_clients,
          COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as total_artisans,
          COUNT(CASE WHEN user_type = 'admin' THEN 1 END) as total_admins,
          COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_users
        FROM users
        WHERE 1=1 ${dateCondition ? 'AND ' + dateCondition.replace('created_at', 'created_at') : ''}
      `, queryParams);
      
      // Get job statistics
      const jobStats = await pool.query(`
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
          COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
          COUNT(CASE WHEN job_status = 'pending' THEN 1 END) as pending_jobs,
          COUNT(CASE WHEN job_status IN ('accepted', 'arrived', 'diagnostics', 'execution') THEN 1 END) as active_jobs,
          COALESCE(AVG(jb.total_amount), 0) as average_job_value,
          COALESCE(SUM(jb.total_amount), 0) as total_job_value
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE 1=1 ${dateCondition ? 'AND ' + dateCondition.replace('created_at', 'j.created_at') : ''}
      `, queryParams);
      
      // Get revenue statistics
      const revenueStats = await pool.query(`
        SELECT 
          COALESCE(SUM(amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END), 0) as platform_fees,
          COALESCE(SUM(CASE WHEN transaction_type = 'artisan_payout' THEN amount ELSE 0 END), 0) as artisan_payouts,
          COUNT(*) as total_transactions
        FROM escrow_transactions
        WHERE status = 'released'
        ${dateCondition ? 'AND ' + dateCondition.replace('created_at', 'release_date') : ''}
      `, queryParams);
      
      // Get dispute statistics
      const disputeStats = await pool.query(`
        SELECT 
          COUNT(*) as total_disputes,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_disputes,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_disputes,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_disputes,
          COUNT(CASE WHEN escalated = true THEN 1 END) as escalated_disputes
        FROM disputes
        WHERE 1=1 ${dateCondition ? 'AND ' + dateCondition.replace('created_at', 'created_at') : ''}
      `, queryParams);
      
      // Get category distribution
      const categoryStats = await pool.query(`
        SELECT 
          category,
          COUNT(*) as job_count,
          COALESCE(AVG(jb.total_amount), 0) as avg_value
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        GROUP BY category
        ORDER BY job_count DESC
        LIMIT 10
      `);
      
      // Get daily trends for the last 30 days
      const dailyTrends = await pool.query(`
        SELECT 
          DATE(j.created_at) as date,
          COUNT(*) as jobs_created,
          COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as jobs_completed,
          COALESCE(SUM(jb.total_amount), 0) as revenue
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE j.created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(j.created_at)
        ORDER BY date DESC
      `);
      
      analytics = {
        period,
        users: {
          total: parseInt(userStats.rows[0]?.total_users || 0),
          clients: parseInt(userStats.rows[0]?.total_clients || 0),
          artisans: parseInt(userStats.rows[0]?.total_artisans || 0),
          admins: parseInt(userStats.rows[0]?.total_admins || 0),
          verified: parseInt(userStats.rows[0]?.verified_users || 0),
          active: parseInt(userStats.rows[0]?.active_users || 0)
        },
        jobs: {
          total: parseInt(jobStats.rows[0]?.total_jobs || 0),
          completed: parseInt(jobStats.rows[0]?.completed_jobs || 0),
          cancelled: parseInt(jobStats.rows[0]?.cancelled_jobs || 0),
          pending: parseInt(jobStats.rows[0]?.pending_jobs || 0),
          active: parseInt(jobStats.rows[0]?.active_jobs || 0),
          completionRate: jobStats.rows[0]?.total_jobs > 0 
            ? ((jobStats.rows[0]?.completed_jobs / jobStats.rows[0]?.total_jobs) * 100).toFixed(2) 
            : 0,
          averageValue: parseFloat(jobStats.rows[0]?.average_job_value || 0),
          totalValue: parseFloat(jobStats.rows[0]?.total_job_value || 0)
        },
        revenue: {
          total: parseFloat(revenueStats.rows[0]?.total_revenue || 0),
          platformFees: parseFloat(revenueStats.rows[0]?.platform_fees || 0),
          artisanPayouts: parseFloat(revenueStats.rows[0]?.artisan_payouts || 0),
          totalTransactions: parseInt(revenueStats.rows[0]?.total_transactions || 0)
        },
        disputes: {
          total: parseInt(disputeStats.rows[0]?.total_disputes || 0),
          pending: parseInt(disputeStats.rows[0]?.pending_disputes || 0),
          resolved: parseInt(disputeStats.rows[0]?.resolved_disputes || 0),
          rejected: parseInt(disputeStats.rows[0]?.rejected_disputes || 0),
          escalated: parseInt(disputeStats.rows[0]?.escalated_disputes || 0),
          resolutionRate: disputeStats.rows[0]?.total_disputes > 0
            ? ((disputeStats.rows[0]?.resolved_disputes / disputeStats.rows[0]?.total_disputes) * 100).toFixed(2)
            : 0
        },
        categoryBreakdown: categoryStats.rows,
        dailyTrends: dailyTrends.rows,
        timestamp: new Date().toISOString()
      };
      
      // Cache for 5 minutes
      await cacheSet(cacheKey, analytics, 300);
    }
    
    sendSuccess(res, analytics, 'Platform analytics retrieved successfully');
  } catch (error) {
    logger.error('Platform analytics error:', error);
    next(error);
  }
});

// Get artisan analytics
router.get('/artisan', authenticateToken, requireRole(['artisan']), [
  query('period').optional().isIn(['week', 'month', 'year', 'all']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { period = 'month', startDate, endDate } = req.query;
    const artisanId = req.user.id;
    const cacheKey = `analytics:artisan:${artisanId}:${period}:${startDate || ''}:${endDate || ''}`;
    
    let analytics = await cacheGet(cacheKey);
    
    if (!analytics) {
      let dateCondition = '';
      const queryParams = [artisanId];
      let paramIndex = 2;
      
      if (startDate && endDate) {
        dateCondition = `AND j.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(startDate, endDate);
        paramIndex += 2;
      } else if (period !== 'all') {
        const interval = period === 'week' ? '7 days' : period === 'month' ? '30 days' : '365 days';
        dateCondition = `AND j.created_at > NOW() - INTERVAL '${interval}'`;
      }
      
      // Get artisan profile
      const profile = await pool.query(`
        SELECT star_rating, total_ratings, completion_rate, tier_level, trust_score
        FROM artisan_profiles
        WHERE user_id = $1
      `, [artisanId]);
      
      // Get job performance
      const jobPerformance = await pool.query(`
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
          COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
          COUNT(CASE WHEN job_status IN ('accepted', 'arrived', 'diagnostics', 'execution') THEN 1 END) as in_progress_jobs,
          COALESCE(AVG(jb.workmanship_cost), 0) as avg_earning_per_job,
          COALESCE(SUM(jb.workmanship_cost), 0) as total_earnings
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE j.artisan_id = $1 ${dateCondition}
      `, queryParams);
      
      // Get weekly job trend
      const weeklyTrend = await pool.query(`
        SELECT 
          DATE_TRUNC('week', j.created_at) as week,
          COUNT(*) as jobs_completed
        FROM jobs j
        WHERE j.artisan_id = $1 AND j.job_status = 'completed'
          AND j.created_at > NOW() - INTERVAL '12 weeks'
        GROUP BY DATE_TRUNC('week', j.created_at)
        ORDER BY week DESC
      `, [artisanId]);
      
      // Get rating breakdown
      const ratingBreakdown = await pool.query(`
        SELECT 
          rating,
          COUNT(*) as count
        FROM ratings
        WHERE reviewee_id = $1
        GROUP BY rating
        ORDER BY rating DESC
      `, [artisanId]);
      
      // Get monthly earnings
      const monthlyEarnings = await pool.query(`
        SELECT 
          DATE_TRUNC('month', j.created_at) as month,
          COALESCE(SUM(jb.workmanship_cost), 0) as earnings,
          COUNT(*) as jobs_completed
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE j.artisan_id = $1 AND j.job_status = 'completed'
          AND j.created_at > NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', j.created_at)
        ORDER BY month DESC
      `, [artisanId]);
      
      // Get response time analytics
      const responseTime = await pool.query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))) as avg_response_seconds
        FROM jobs
        WHERE artisan_id = $1 AND accepted_at IS NOT NULL
          AND created_at > NOW() - INTERVAL '30 days'
      `, [artisanId]);
      
      const ratingMap = {};
      ratingBreakdown.rows.forEach(r => {
        ratingMap[r.rating] = parseInt(r.count);
      });
      
      analytics = {
        period,
        performance: {
          rating: parseFloat(profile.rows[0]?.star_rating || 0),
          totalRatings: parseInt(profile.rows[0]?.total_ratings || 0),
          completionRate: parseFloat(profile.rows[0]?.completion_rate || 0),
          tierLevel: profile.rows[0]?.tier_level || 1,
          trustScore: profile.rows[0]?.trust_score || 0,
          averageResponseTime: responseTime.rows[0]?.avg_response_seconds 
            ? Math.round(responseTime.rows[0].avg_response_seconds) 
            : 0
        },
        jobs: {
          total: parseInt(jobPerformance.rows[0]?.total_jobs || 0),
          completed: parseInt(jobPerformance.rows[0]?.completed_jobs || 0),
          cancelled: parseInt(jobPerformance.rows[0]?.cancelled_jobs || 0),
          inProgress: parseInt(jobPerformance.rows[0]?.in_progress_jobs || 0),
          completionRate: jobPerformance.rows[0]?.total_jobs > 0
            ? ((jobPerformance.rows[0]?.completed_jobs / jobPerformance.rows[0]?.total_jobs) * 100).toFixed(2)
            : 0
        },
        earnings: {
          total: parseFloat(jobPerformance.rows[0]?.total_earnings || 0),
          averagePerJob: parseFloat(jobPerformance.rows[0]?.avg_earning_per_job || 0),
          monthlyBreakdown: monthlyEarnings.rows
        },
        ratings: {
          average: parseFloat(profile.rows[0]?.star_rating || 0),
          total: parseInt(profile.rows[0]?.total_ratings || 0),
          breakdown: {
            5: ratingMap[5] || 0,
            4: ratingMap[4] || 0,
            3: ratingMap[3] || 0,
            2: ratingMap[2] || 0,
            1: ratingMap[1] || 0
          }
        },
        trends: {
          weeklyJobs: weeklyTrend.rows,
          monthlyEarnings: monthlyEarnings.rows
        },
        timestamp: new Date().toISOString()
      };
      
      await cacheSet(cacheKey, analytics, 300);
    }
    
    sendSuccess(res, analytics, 'Artisan analytics retrieved successfully');
  } catch (error) {
    logger.error('Artisan analytics error:', error);
    next(error);
  }
});

// Get client analytics
router.get('/client', authenticateToken, requireRole(['client']), [
  query('period').optional().isIn(['month', 'year', 'all'])
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { period = 'month' } = req.query;
    const clientId = req.user.id;
    const cacheKey = `analytics:client:${clientId}:${period}`;
    
    let analytics = await cacheGet(cacheKey);
    
    if (!analytics) {
      let dateCondition = '';
      if (period !== 'all') {
        const interval = period === 'month' ? '30 days' : '365 days';
        dateCondition = `AND j.created_at > NOW() - INTERVAL '${interval}'`;
      }
      
      // Get spending statistics
      const spendingStats = await pool.query(`
        SELECT 
          COALESCE(SUM(jb.total_amount), 0) as total_spent,
          COALESCE(AVG(jb.total_amount), 0) as average_per_job,
          COUNT(*) as total_jobs,
          COALESCE(SUM(pu.discount_amount), 0) as total_savings
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        LEFT JOIN promotion_usage pu ON j.id = pu.job_id
        WHERE j.client_id = $1 AND j.job_status = 'completed' ${dateCondition}
      `, [clientId]);
      
      // Get category breakdown
      const categoryBreakdown = await pool.query(`
        SELECT 
          j.category,
          COUNT(*) as job_count,
          COALESCE(AVG(jb.total_amount), 0) as avg_cost,
          COALESCE(SUM(jb.total_amount), 0) as total_cost
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE j.client_id = $1 AND j.job_status = 'completed'
        GROUP BY j.category
        ORDER BY job_count DESC
      `, [clientId]);
      
      // Get favorite artisans
      const favoriteArtisans = await pool.query(`
        SELECT 
          ap.user_id,
          ap.full_legal_name,
          ap.skill_category,
          ap.star_rating,
          COUNT(j.id) as jobs_completed
        FROM jobs j
        JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
        WHERE j.client_id = $1 AND j.job_status = 'completed'
        GROUP BY ap.user_id, ap.full_legal_name, ap.skill_category, ap.star_rating
        ORDER BY jobs_completed DESC
        LIMIT 5
      `, [clientId]);
      
      // Get monthly spending trend
      const monthlyTrend = await pool.query(`
        SELECT 
          DATE_TRUNC('month', j.created_at) as month,
          COALESCE(SUM(jb.total_amount), 0) as spent,
          COUNT(*) as jobs_completed
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE j.client_id = $1 AND j.job_status = 'completed'
          AND j.created_at > NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', j.created_at)
        ORDER BY month DESC
      `, [clientId]);
      
      // Get average rating given
      const avgRatingGiven = await pool.query(`
        SELECT 
          AVG(rating) as average_rating,
          COUNT(*) as total_ratings
        FROM ratings
        WHERE reviewer_id = $1
      `, [clientId]);
      
      analytics = {
        period,
        spending: {
          total: parseFloat(spendingStats.rows[0]?.total_spent || 0),
          averagePerJob: parseFloat(spendingStats.rows[0]?.average_per_job || 0),
          totalJobs: parseInt(spendingStats.rows[0]?.total_jobs || 0),
          totalSavings: parseFloat(spendingStats.rows[0]?.total_savings || 0),
          monthlyTrend: monthlyTrend.rows
        },
        categoryBreakdown: categoryBreakdown.rows,
        favoriteArtisans: favoriteArtisans.rows,
        ratings: {
          averageGiven: parseFloat(avgRatingGiven.rows[0]?.average_rating || 0),
          totalGiven: parseInt(avgRatingGiven.rows[0]?.total_ratings || 0)
        },
        timestamp: new Date().toISOString()
      };
      
      await cacheSet(cacheKey, analytics, 300);
    }
    
    sendSuccess(res, analytics, 'Client analytics retrieved successfully');
  } catch (error) {
    logger.error('Client analytics error:', error);
    next(error);
  }
});

// Get job analytics (admin only)
router.get('/jobs', authenticateToken, requireRole(['admin']), [
  query('category').optional().isString(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('groupBy').optional().isIn(['day', 'week', 'month'])
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { category, startDate, endDate, groupBy = 'day' } = req.query;
    const cacheKey = `analytics:jobs:${category || 'all'}:${startDate || ''}:${endDate || ''}:${groupBy}`;
    
    let analytics = await cacheGet(cacheKey);
    
    if (!analytics) {
      let dateCondition = '';
      const queryParams = [];
      let paramIndex = 1;
      
      if (startDate && endDate) {
        dateCondition = `AND j.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
        queryParams.push(startDate, endDate);
        paramIndex += 2;
      }
      
      if (category) {
        dateCondition += `${dateCondition ? ' AND' : ' AND'} j.category = $${paramIndex}`;
        queryParams.push(category);
        paramIndex++;
      }
      
      // Get jobs by status
      const statusBreakdown = await pool.query(`
        SELECT 
          j.job_status,
          COUNT(*) as count,
          COALESCE(AVG(jb.total_amount), 0) as avg_value
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE 1=1 ${dateCondition}
        GROUP BY j.job_status
      `, queryParams);
      
      // Get jobs by category
      const categoryBreakdown = await pool.query(`
        SELECT 
          j.category,
          COUNT(*) as job_count,
          COALESCE(AVG(jb.total_amount), 0) as avg_value,
          COALESCE(SUM(jb.total_amount), 0) as total_value
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE j.job_status = 'completed' ${dateCondition}
        GROUP BY j.category
        ORDER BY job_count DESC
      `, queryParams);
      
      // Get jobs by artisan tier
      const tierBreakdown = await pool.query(`
        SELECT 
          ap.tier_level,
          COUNT(*) as job_count,
          COALESCE(AVG(jb.total_amount), 0) as avg_value
        FROM jobs j
        JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE j.job_status = 'completed' ${dateCondition}
        GROUP BY ap.tier_level
        ORDER BY ap.tier_level ASC
      `, queryParams);
      
      // Get time-based breakdown
      let groupByInterval = 'day';
      if (groupBy === 'week') groupByInterval = 'week';
      if (groupBy === 'month') groupByInterval = 'month';
      
      const timeBreakdown = await pool.query(`
        SELECT 
          DATE_TRUNC('${groupByInterval}', j.created_at) as period,
          COUNT(*) as jobs_created,
          COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as jobs_completed,
          COALESCE(SUM(jb.total_amount), 0) as revenue
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE j.created_at > NOW() - INTERVAL '3 months' ${category ? 'AND j.category = $1' : ''}
        GROUP BY DATE_TRUNC('${groupByInterval}', j.created_at)
        ORDER BY period DESC
      `, category ? [category] : []);
      
      // Get peak hours
      const peakHours = await pool.query(`
        SELECT 
          EXTRACT(HOUR FROM j.created_at) as hour,
          COUNT(*) as job_count
        FROM jobs j
        WHERE j.created_at > NOW() - INTERVAL '30 days'
        GROUP BY EXTRACT(HOUR FROM j.created_at)
        ORDER BY job_count DESC
        LIMIT 5
      `);
      
      analytics = {
        summary: {
          totalJobs: statusBreakdown.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
          completedJobs: parseInt(statusBreakdown.rows.find(r => r.job_status === 'completed')?.count || 0),
          cancelledJobs: parseInt(statusBreakdown.rows.find(r => r.job_status === 'cancelled')?.count || 0),
          pendingJobs: parseInt(statusBreakdown.rows.find(r => r.job_status === 'pending')?.count || 0),
          activeJobs: parseInt(statusBreakdown.rows.find(r => ['accepted', 'arrived', 'diagnostics', 'execution'].includes(r.job_status))?.count || 0)
        },
        byStatus: statusBreakdown.rows,
        byCategory: categoryBreakdown.rows,
        byTier: tierBreakdown.rows,
        timeBreakdown: timeBreakdown.rows,
        peakHours: peakHours.rows,
        timestamp: new Date().toISOString()
      };
      
      await cacheSet(cacheKey, analytics, 300);
    }
    
    sendSuccess(res, analytics, 'Job analytics retrieved successfully');
  } catch (error) {
    logger.error('Job analytics error:', error);
    next(error);
  }
});

// Get revenue analytics (admin only)
router.get('/revenue', authenticateToken, requireRole(['admin']), [
  query('period').optional().isIn(['day', 'week', 'month', 'year']),
  query('groupBy').optional().isIn(['day', 'week', 'month'])
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { period = 'month', groupBy = 'day' } = req.query;
    const cacheKey = `analytics:revenue:${period}:${groupBy}`;
    
    let analytics = await cacheGet(cacheKey);
    
    if (!analytics) {
      let interval = '30 days';
      if (period === 'day') interval = '1 day';
      if (period === 'week') interval = '7 days';
      if (period === 'year') interval = '365 days';
      
      let groupByInterval = 'day';
      if (groupBy === 'week') groupByInterval = 'week';
      if (groupBy === 'month') groupByInterval = 'month';
      
      // Total revenue
      const totalRevenue = await pool.query(`
        SELECT 
          COALESCE(SUM(amount), 0) as total,
          COALESCE(SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END), 0) as platform_fees,
          COALESCE(SUM(CASE WHEN transaction_type = 'artisan_payout' THEN amount ELSE 0 END), 0) as artisan_payouts,
          COUNT(*) as transaction_count
        FROM escrow_transactions
        WHERE status = 'released' AND release_date > NOW() - INTERVAL '${interval}'
      `);
      
      // Revenue by period
      const revenueByPeriod = await pool.query(`
        SELECT 
          DATE_TRUNC('${groupByInterval}', release_date) as period,
          COALESCE(SUM(amount), 0) as revenue,
          COUNT(*) as transaction_count
        FROM escrow_transactions
        WHERE status = 'released' AND release_date > NOW() - INTERVAL '${interval}'
        GROUP BY DATE_TRUNC('${groupByInterval}', release_date)
        ORDER BY period DESC
      `);
      
      // Revenue by category
      const revenueByCategory = await pool.query(`
        SELECT 
          j.category,
          COALESCE(SUM(et.amount), 0) as revenue
        FROM escrow_transactions et
        JOIN jobs j ON et.job_id = j.id
        WHERE et.status = 'released' AND et.release_date > NOW() - INTERVAL '${interval}'
        GROUP BY j.category
        ORDER BY revenue DESC
        LIMIT 10
      `);
      
      // Calculate growth
      const previousPeriodRevenue = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM escrow_transactions
        WHERE status = 'released' 
          AND release_date > NOW() - INTERVAL '${interval}' - INTERVAL '${interval}'
          AND release_date < NOW() - INTERVAL '${interval}'
      `);
      
      const currentTotal = parseFloat(totalRevenue.rows[0]?.total || 0);
      const previousTotal = parseFloat(previousPeriodRevenue.rows[0]?.total || 0);
      const growth = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;
      
      // Projection (simple linear projection)
      const projection = currentTotal * 1.1; // 10% growth assumption
      
      analytics = {
        period,
        summary: {
          totalRevenue: currentTotal,
          platformFees: parseFloat(totalRevenue.rows[0]?.platform_fees || 0),
          artisanPayouts: parseFloat(totalRevenue.rows[0]?.artisan_payouts || 0),
          transactionCount: parseInt(totalRevenue.rows[0]?.transaction_count || 0),
          growth: growth.toFixed(2),
          projection
        },
        breakdown: {
          byPeriod: revenueByPeriod.rows,
          byCategory: revenueByCategory.rows
        },
        timestamp: new Date().toISOString()
      };
      
      await cacheSet(cacheKey, analytics, 300);
    }
    
    sendSuccess(res, analytics, 'Revenue analytics retrieved successfully');
  } catch (error) {
    logger.error('Revenue analytics error:', error);
    next(error);
  }
});

// Get geographic analytics (admin only)
router.get('/geographic', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    const cacheKey = 'analytics:geographic';
    let analytics = await cacheGet(cacheKey);
    
    if (!analytics) {
      // Jobs by zone/city
      const jobsByZone = await pool.query(`
        SELECT 
          j.location->>'city' as city,
          j.location->>'zone' as zone,
          COUNT(*) as job_count,
          COALESCE(SUM(jb.total_amount), 0) as revenue
        FROM jobs j
        LEFT JOIN job_billing jb ON j.id = jb.job_id
        WHERE j.job_status = 'completed' AND j.location IS NOT NULL
          AND j.created_at > NOW() - INTERVAL '6 months'
        GROUP BY j.location->>'city', j.location->>'zone'
        ORDER BY job_count DESC
        LIMIT 20
      `);
      
      // Artisan distribution
      const artisanDistribution = await pool.query(`
        SELECT 
          ap.residential_address->>'city' as city,
          ap.residential_address->>'zone' as zone,
          COUNT(*) as artisan_count,
          AVG(ap.star_rating) as avg_rating
        FROM artisan_profiles ap
        WHERE ap.is_available = true AND ap.residential_address IS NOT NULL
        GROUP BY ap.residential_address->>'city', ap.residential_address->>'zone'
        ORDER BY artisan_count DESC
        LIMIT 20
      `);
      
      // Calculate coverage (zones with at least one artisan)
      const coverageResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT zone) as zones_with_artisans,
          (SELECT COUNT(DISTINCT zone) FROM zones) as total_zones
        FROM artisan_profiles
        WHERE residential_address->>'zone' IS NOT NULL
      `);
      
      const zonesWithArtisans = parseInt(coverageResult.rows[0]?.zones_with_artisans || 0);
      const totalZones = parseInt(coverageResult.rows[0]?.total_zones || 1);
      
      analytics = {
        jobsByLocation: jobsByZone.rows,
        artisanDistribution: artisanDistribution.rows,
        coverage: {
          zonesWithArtisans,
          totalZones,
          percentage: ((zonesWithArtisans / totalZones) * 100).toFixed(2)
        },
        underservedAreas: jobsByZone.rows
          .filter(j => !artisanDistribution.rows.some(a => a.zone === j.zone))
          .map(j => ({ zone: j.zone, city: j.city, demand: j.job_count })),
        timestamp: new Date().toISOString()
      };
      
      await cacheSet(cacheKey, analytics, 3600); // Cache for 1 hour
    }
    
    sendSuccess(res, analytics, 'Geographic analytics retrieved successfully');
  } catch (error) {
    logger.error('Geographic analytics error:', error);
    next(error);
  }
});

// Get real-time analytics (admin only)
router.get('/realtime', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  try {
    // Get active users count
    const activeUsers = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM location_history
      WHERE timestamp > NOW() - INTERVAL '5 minutes'
    `);
    
    // Get active jobs
    const activeJobs = await pool.query(`
      SELECT COUNT(*) as count
      FROM jobs
      WHERE job_status IN ('accepted', 'arrived', 'diagnostics', 'execution')
    `);
    
    // Get active artisans
    const activeArtisans = await pool.query(`
      SELECT COUNT(*) as count
      FROM artisan_profiles
      WHERE is_available = true AND last_location_update > NOW() - INTERVAL '5 minutes'
    `);
    
    // Get requests per minute
    const requestsPerMinute = await pool.query(`
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE created_at > NOW() - INTERVAL '1 minute'
    `);
    
    // Get average response time
    const avgResponseTime = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))) as avg_seconds
      FROM jobs
      WHERE accepted_at IS NOT NULL AND created_at > NOW() - INTERVAL '1 hour'
    `);
    
    // Get system load (could be from monitoring service)
    const systemLoad = process.cpuUsage();
    
    const analytics = {
      activeUsers: parseInt(activeUsers.rows[0]?.count || 0),
      activeJobs: parseInt(activeJobs.rows[0]?.count || 0),
      activeArtisans: parseInt(activeArtisans.rows[0]?.count || 0),
      requestsPerMinute: parseInt(requestsPerMinute.rows[0]?.count || 0),
      averageResponseTime: avgResponseTime.rows[0]?.avg_seconds 
        ? Math.round(avgResponseTime.rows[0].avg_seconds) 
        : 0,
      systemLoad: {
        user: (systemLoad.user / 1000000).toFixed(2),
        system: (systemLoad.system / 1000000).toFixed(2)
      },
      timestamp: new Date().toISOString()
    };
    
    sendSuccess(res, analytics, 'Real-time analytics retrieved successfully');
  } catch (error) {
    logger.error('Real-time analytics error:', error);
    next(error);
  }
});

// Export analytics report
router.post('/export', authenticateToken, requireRole(['admin']), [
  query('type').isIn(['platform', 'revenue', 'jobs', 'geographic']),
  query('format').optional().isIn(['json', 'csv', 'pdf']),
  query('period').optional().isIn(['day', 'week', 'month', 'year'])
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation error', 400, errors.array());
  }

  try {
    const { type, format = 'json', period = 'month' } = req.query;
    
    // Generate report based on type
    let reportData = {};
    let filename = `report_${type}_${new Date().toISOString()}`;
    
    switch (type) {
      case 'platform':
        const platformData = await pool.query(`
          SELECT 
            DATE_TRUNC('day', created_at) as date,
            COUNT(*) as value
          FROM users
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY date DESC
        `);
        reportData = { type, period, data: platformData.rows, generatedAt: new Date() };
        break;
      case 'revenue':
        const revenueData = await pool.query(`
          SELECT 
            DATE_TRUNC('day', release_date) as date,
            SUM(amount) as revenue
          FROM escrow_transactions
          WHERE status = 'released' AND release_date > NOW() - INTERVAL '30 days'
          GROUP BY DATE_TRUNC('day', release_date)
          ORDER BY date DESC
        `);
        reportData = { type, period, data: revenueData.rows, generatedAt: new Date() };
        break;
      case 'jobs':
        const jobsData = await pool.query(`
          SELECT 
            DATE_TRUNC('day', created_at) as date,
            COUNT(*) as jobs_created,
            COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as jobs_completed
          FROM jobs
          WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY date DESC
        `);
        reportData = { type, period, data: jobsData.rows, generatedAt: new Date() };
        break;
      case 'geographic':
        const geoData = await pool.query(`
          SELECT 
            j.location->>'zone' as zone,
            COUNT(*) as job_count
          FROM jobs j
          WHERE j.created_at > NOW() - INTERVAL '30 days'
          GROUP BY j.location->>'zone'
          ORDER BY job_count DESC
        `);
        reportData = { type, period, data: geoData.rows, generatedAt: new Date() };
        break;
    }
    
    if (format === 'csv') {
      // Convert to CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
      // Send CSV data
      return res.send(reportData);
    } else if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.pdf`);
      return res.send(reportData);
    } else {
      sendSuccess(res, reportData, 'Report generated successfully');
    }
  } catch (error) {
    logger.error('Report export error:', error);
    next(error);
  }
});

module.exports = router;