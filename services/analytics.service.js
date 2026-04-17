const { pool } = require('../config/database');
const { cacheGet, cacheSet } = require('../config/redis');
const { logger } = require('../config/logger');

class AnalyticsService {
  static async getPlatformMetrics(period = 'month') {
    const cacheKey = `analytics:platform:${period}`;
    let metrics = await cacheGet(cacheKey);
    
    if (!metrics) {
      const interval = period === 'day' ? '1 day' : period === 'week' ? '7 days' : period === 'month' ? '30 days' : '365 days';
      
      const results = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '${interval}'`),
        pool.query(`SELECT COUNT(*) FROM jobs WHERE created_at > NOW() - INTERVAL '${interval}'`),
        pool.query(`SELECT COUNT(*) FROM jobs WHERE job_status = 'completed' AND completed_at > NOW() - INTERVAL '${interval}'`),
        pool.query(`SELECT COALESCE(SUM(amount), 0) FROM payment_intents WHERE status = 'succeeded' AND paid_at > NOW() - INTERVAL '${interval}'`),
        pool.query(`SELECT COUNT(*) FROM disputes WHERE created_at > NOW() - INTERVAL '${interval}'`)
      ]);
      
      metrics = {
        period,
        newUsers: parseInt(results[0].rows[0].count),
        totalJobs: parseInt(results[1].rows[0].count),
        completedJobs: parseInt(results[2].rows[0].count),
        revenue: parseFloat(results[3].rows[0].sum),
        disputes: parseInt(results[4].rows[0].count),
        completionRate: results[1].rows[0].count > 0 
          ? (results[2].rows[0].count / results[1].rows[0].count) * 100 
          : 0
      };
      
      await cacheSet(cacheKey, metrics, 3600);
    }
    
    return metrics;
  }
  
  static async getUserGrowth(days = 30) {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(CASE WHEN user_type = 'client' THEN 1 END) as new_clients,
        COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as new_artisans,
        COUNT(*) as total_new_users
      FROM users
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `);
    
    return result.rows;
  }
  
  static async getJobTrends(days = 30) {
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as jobs_created,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as jobs_completed,
        COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as jobs_cancelled,
        AVG(jb.total_amount) as average_job_value
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `);
    
    return result.rows;
  }
  
  static async getCategoryAnalytics() {
    const result = await pool.query(`
      SELECT 
        category,
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
        AVG(jb.workmanship_cost) as average_cost,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) / 3600 as avg_completion_hours
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.created_at > NOW() - INTERVAL '90 days'
      GROUP BY category
      ORDER BY total_jobs DESC
    `);
    
    return result.rows;
  }
  
  static async getArtisanPerformance(filters = {}) {
    const { tier, minRating, limit = 20 } = filters;
    
    let query = `
      SELECT 
        ap.user_id,
        ap.full_legal_name,
        ap.skill_category,
        ap.tier_level,
        ap.star_rating,
        ap.completion_rate,
        COUNT(j.id) as total_jobs,
        COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as completed_jobs,
        AVG(jb.workmanship_cost) as average_earning,
        SUM(jb.workmanship_cost) as total_earnings
      FROM artisan_profiles ap
      LEFT JOIN jobs j ON ap.user_id = j.artisan_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.created_at > NOW() - INTERVAL '90 days'
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (tier) {
      query += ` AND ap.tier_level = $${paramIndex}`;
      params.push(tier);
      paramIndex++;
    }
    
    if (minRating) {
      query += ` AND ap.star_rating >= $${paramIndex}`;
      params.push(minRating);
      paramIndex++;
    }
    
    query += ` GROUP BY ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, ap.star_rating, ap.completion_rate
               ORDER BY completed_jobs DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    return result.rows;
  }
  
  static async getClientAnalytics(clientId) {
    const result = await pool.query(`
      SELECT 
        COUNT(j.id) as total_jobs,
        COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN j.job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
        SUM(jb.total_amount) as total_spent,
        AVG(jb.total_amount) as average_job_cost,
        AVG(r.rating) as average_rating_given
      FROM client_profiles cp
      LEFT JOIN jobs j ON cp.user_id = j.client_id
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      LEFT JOIN ratings r ON j.id = r.job_id AND r.reviewer_id = cp.user_id
      WHERE cp.user_id = $1
      GROUP BY cp.user_id
    `, [clientId]);
    
    const categoryBreakdown = await pool.query(`
      SELECT 
        j.category,
        COUNT(*) as job_count,
        SUM(jb.total_amount) as total_spent
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.client_id = $1 AND j.job_status = 'completed'
      GROUP BY j.category
      ORDER BY job_count DESC
    `, [clientId]);
    
    return {
      summary: result.rows[0] || { total_jobs: 0, completed_jobs: 0, cancelled_jobs: 0, total_spent: 0, average_job_cost: 0, average_rating_given: 0 },
      categoryBreakdown: categoryBreakdown.rows
    };
  }
  
  static async getRevenueAnalytics(period = 'month') {
    const interval = period === 'day' ? '1 day' : period === 'week' ? '7 days' : period === 'month' ? '30 days' : '365 days';
    
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', release_date) as date,
        SUM(amount) as daily_revenue,
        COUNT(*) as transactions
      FROM escrow_transactions
      WHERE status = 'released' AND release_date > NOW() - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('day', release_date)
      ORDER BY date ASC
    `);
    
    const summary = await pool.query(`
      SELECT 
        SUM(amount) as total_revenue,
        AVG(amount) as average_transaction,
        COUNT(*) as total_transactions,
        SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END) as platform_fees,
        SUM(CASE WHEN transaction_type = 'workmanship' THEN amount ELSE 0 END) as artisan_payouts
      FROM escrow_transactions
      WHERE status = 'released' AND release_date > NOW() - INTERVAL '${interval}'
    `);
    
    return {
      daily: result.rows,
      summary: summary.rows[0]
    };
  }
  
  static async getGeographicDistribution() {
    const jobsByZone = await pool.query(`
      SELECT 
        j.location->>'zone' as zone,
        COUNT(*) as job_count,
        SUM(jb.total_amount) as revenue
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.location IS NOT NULL AND j.created_at > NOW() - INTERVAL '90 days'
      GROUP BY j.location->>'zone'
      ORDER BY job_count DESC
    `);
    
    const artisansByZone = await pool.query(`
      SELECT 
        ap.residential_address->>'zone' as zone,
        COUNT(*) as artisan_count,
        AVG(ap.star_rating) as avg_rating
      FROM artisan_profiles ap
      WHERE ap.residential_address IS NOT NULL
      GROUP BY ap.residential_address->>'zone'
      ORDER BY artisan_count DESC
    `);
    
    return {
      jobsByZone: jobsByZone.rows,
      artisansByZone: artisansByZone.rows
    };
  }
  
  static async getRealTimeMetrics() {
    const results = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '5 minutes'`),
      pool.query(`SELECT COUNT(*) FROM jobs WHERE job_status IN ('accepted', 'arrived', 'diagnostics', 'execution')`),
      pool.query(`SELECT COUNT(*) FROM artisan_profiles WHERE is_available = true AND last_location_update > NOW() - INTERVAL '5 minutes'`),
      pool.query(`SELECT COUNT(*) FROM payment_intents WHERE status = 'processing' AND created_at > NOW() - INTERVAL '1 hour'`)
    ]);
    
    return {
      activeUsers: parseInt(results[0].rows[0].count),
      activeJobs: parseInt(results[1].rows[0].count),
      activeArtisans: parseInt(results[2].rows[0].count),
      processingPayments: parseInt(results[3].rows[0].count),
      timestamp: new Date().toISOString()
    };
  }
  
  static async getRetentionMetrics() {
    const result = await pool.query(`
      WITH user_activity AS (
        SELECT 
          u.id,
          u.user_type,
          u.created_at as signup_date,
          COUNT(j.id) as jobs_completed
        FROM users u
        LEFT JOIN jobs j ON u.id = j.client_id AND j.job_status = 'completed'
        WHERE u.created_at > NOW() - INTERVAL '180 days'
        GROUP BY u.id, u.created_at, u.user_type
      )
      SELECT 
        DATE_TRUNC('week', signup_date) as cohort_week,
        user_type,
        COUNT(*) as total_users,
        COUNT(CASE WHEN jobs_completed >= 1 THEN 1 END) as retained_users,
        (COUNT(CASE WHEN jobs_completed >= 1 THEN 1 END)::float / COUNT(*) * 100) as retention_rate
      FROM user_activity
      GROUP BY DATE_TRUNC('week', signup_date), user_type
      ORDER BY cohort_week DESC
    `);
    
    return result.rows;
  }
  
  static async getConversionFunnel() {
    const result = await pool.query(`
      SELECT 
        'visitors' as stage,
        COUNT(DISTINCT ip_address) as count
      FROM page_views
      WHERE viewed_at > NOW() - INTERVAL '30 days'
      
      UNION ALL
      
      SELECT 
        'registrations' as stage,
        COUNT(*) as count
      FROM users
      WHERE created_at > NOW() - INTERVAL '30 days'
      
      UNION ALL
      
      SELECT 
        'verified_users' as stage,
        COUNT(*) as count
      FROM users
      WHERE is_verified = true AND created_at > NOW() - INTERVAL '30 days'
      
      UNION ALL
      
      SELECT 
        'first_job_posted' as stage,
        COUNT(DISTINCT j.client_id) as count
      FROM jobs j
      WHERE j.created_at > NOW() - INTERVAL '30 days'
      
      UNION ALL
      
      SELECT 
        'job_completed' as stage,
        COUNT(DISTINCT j.client_id) as count
      FROM jobs j
      WHERE j.job_status = 'completed' AND j.completed_at > NOW() - INTERVAL '30 days'
    `);
    
    return result.rows;
  }
  
  static async exportAnalytics(reportType, format = 'json', period = 'month') {
    let data;
    
    switch (reportType) {
      case 'platform':
        data = {
          metrics: await this.getPlatformMetrics(period),
          userGrowth: await this.getUserGrowth(period === 'month' ? 30 : period === 'year' ? 365 : 7),
          jobTrends: await this.getJobTrends(period === 'month' ? 30 : period === 'year' ? 365 : 7),
          revenue: await this.getRevenueAnalytics(period)
        };
        break;
      case 'users':
        data = await this.getUserGrowth(period === 'month' ? 30 : period === 'year' ? 365 : 7);
        break;
      case 'jobs':
        data = await this.getJobTrends(period === 'month' ? 30 : period === 'year' ? 365 : 7);
        break;
      case 'revenue':
        data = await this.getRevenueAnalytics(period);
        break;
      default:
        throw new Error('Invalid report type');
    }
    
    return {
      data,
      format,
      generatedAt: new Date().toISOString(),
      period
    };
  }
}

module.exports = AnalyticsService;