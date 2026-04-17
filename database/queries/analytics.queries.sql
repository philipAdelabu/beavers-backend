-- ============================================
-- Analytics Queries
-- ============================================

-- Get platform user statistics
-- @param $1 - start_date, $2 - end_date
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN user_type = 'client' THEN 1 END) as total_clients,
    COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as total_artisans,
    COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
    COUNT(CASE WHEN created_at BETWEEN $1 AND $2 THEN 1 END) as new_users
FROM users;

-- Get daily user growth
-- @param $1 - days
SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(CASE WHEN user_type = 'client' THEN 1 END) as new_clients,
    COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as new_artisans,
    COUNT(*) as total_new
FROM users
WHERE created_at > NOW() - INTERVAL '$1 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date ASC;

-- Get job statistics
-- @param $1 - start_date, $2 - end_date
SELECT 
    COUNT(*) as total_jobs,
    COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
    COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
    COUNT(CASE WHEN job_status IN ('pending', 'accepted', 'arrived', 'diagnostics', 'execution') THEN 1 END) as active_jobs,
    COALESCE(AVG(jb.total_amount), 0) as average_job_value,
    COALESCE(SUM(jb.total_amount), 0) as total_job_value
FROM jobs j
LEFT JOIN job_billing jb ON j.id = jb.job_id
WHERE j.created_at BETWEEN $1 AND $2;

-- Get daily job trends
-- @param $1 - days
SELECT 
    DATE_TRUNC('day', j.created_at) as date,
    COUNT(*) as jobs_created,
    COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as jobs_completed,
    COALESCE(AVG(jb.total_amount), 0) as average_value,
    COALESCE(SUM(jb.total_amount), 0) as total_value
FROM jobs j
LEFT JOIN job_billing jb ON j.id = jb.job_id
WHERE j.created_at > NOW() - INTERVAL '$1 days'
GROUP BY DATE_TRUNC('day', j.created_at)
ORDER BY date ASC;

-- Get job category breakdown
-- @param $1 - start_date, $2 - end_date
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
ORDER BY job_count DESC;

-- Get revenue analytics
-- @param $1 - start_date, $2 - end_date
SELECT 
    SUM(amount) as total_revenue,
    AVG(amount) as average_transaction,
    COUNT(*) as total_transactions,
    SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END) as platform_fees,
    SUM(CASE WHEN transaction_type = 'workmanship' THEN amount ELSE 0 END) as artisan_payouts,
    SUM(CASE WHEN transaction_type = 'materials' THEN amount ELSE 0 END) as materials_cost
FROM escrow_transactions
WHERE status = 'released'
    AND release_date BETWEEN $1 AND $2;

-- Get daily revenue breakdown
-- @param $1 - days
SELECT 
    DATE_TRUNC('day', release_date) as date,
    COUNT(*) as transactions,
    SUM(amount) as revenue,
    AVG(amount) as average_amount
FROM escrow_transactions
WHERE status = 'released'
    AND release_date > NOW() - INTERVAL '$1 days'
GROUP BY DATE_TRUNC('day', release_date)
ORDER BY date ASC;

-- Get revenue by category
-- @param $1 - start_date, $2 - end_date
SELECT 
    j.category,
    COUNT(*) as transactions,
    SUM(et.amount) as revenue
FROM escrow_transactions et
JOIN jobs j ON et.job_id = j.id
WHERE et.status = 'released'
    AND et.release_date BETWEEN $1 AND $2
GROUP BY j.category
ORDER BY revenue DESC;

-- Get artisan performance ranking
-- @param $1 - limit, $2 - start_date, $3 - end_date
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
WHERE j.completed_at BETWEEN $2 AND $3
GROUP BY ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, ap.star_rating
ORDER BY completed_jobs DESC
LIMIT $1;

-- Get client spending analytics
-- @param $1 - client_id
SELECT 
    cp.user_id,
    cp.full_legal_name,
    COUNT(j.id) as total_jobs,
    SUM(jb.total_amount) as total_spent,
    AVG(jb.total_amount) as average_job_cost,
    AVG(r.rating) as average_rating_given
FROM client_profiles cp
LEFT JOIN jobs j ON cp.user_id = j.client_id
LEFT JOIN job_billing jb ON j.id = jb.job_id
LEFT JOIN ratings r ON j.id = r.job_id AND r.reviewer_id = cp.user_id
WHERE cp.user_id = $1
GROUP BY cp.user_id, cp.full_legal_name;

-- Get geographic distribution of jobs
-- @param $1 - start_date, $2 - end_date
SELECT 
    j.location->>'zone' as zone,
    COUNT(*) as job_count,
    SUM(jb.total_amount) as revenue
FROM jobs j
LEFT JOIN job_billing jb ON j.id = jb.job_id
WHERE j.location IS NOT NULL
    AND j.created_at BETWEEN $1 AND $2
GROUP BY j.location->>'zone'
ORDER BY job_count DESC;

-- Get dispute statistics
-- @param $1 - start_date, $2 - end_date
SELECT 
    COUNT(*) as total_disputes,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
    COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
    AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_resolution_hours
FROM disputes
WHERE created_at BETWEEN $1 AND $2;

-- Get user retention cohort analysis
SELECT 
    DATE_TRUNC('week', signup_date) as cohort_week,
    user_type,
    COUNT(*) as total_users,
    COUNT(CASE WHEN jobs_completed >= 1 THEN 1 END) as retained_users,
    (COUNT(CASE WHEN jobs_completed >= 1 THEN 1 END)::float / COUNT(*) * 100) as retention_rate
FROM (
    SELECT 
        u.id,
        u.user_type,
        u.created_at as signup_date,
        COUNT(j.id) as jobs_completed
    FROM users u
    LEFT JOIN jobs j ON u.id = j.client_id AND j.job_status = 'completed'
    WHERE u.created_at > NOW() - INTERVAL '180 days'
    GROUP BY u.id, u.created_at, u.user_type
) user_activity
GROUP BY DATE_TRUNC('week', signup_date), user_type
ORDER BY cohort_week DESC;

-- Get real-time metrics
SELECT 
    (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '5 minutes') as active_users,
    (SELECT COUNT(*) FROM jobs WHERE job_status IN ('accepted', 'arrived', 'diagnostics', 'execution')) as active_jobs,
    (SELECT COUNT(*) FROM artisan_profiles WHERE is_available = true AND last_location_update > NOW() - INTERVAL '5 minutes') as active_artisans,
    (SELECT COUNT(*) FROM payment_intents WHERE status = 'processing' AND created_at > NOW() - INTERVAL '1 hour') as processing_payments;