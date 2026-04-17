-- ============================================
-- Report Queries
-- ============================================

-- Financial report - summary
-- @param $1 - start_date, $2 - end_date
SELECT 
    COUNT(*) as total_transactions,
    SUM(amount) as total_revenue,
    AVG(amount) as average_transaction,
    SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END) as platform_fees,
    SUM(CASE WHEN transaction_type = 'workmanship' THEN amount ELSE 0 END) as artisan_payouts,
    SUM(CASE WHEN transaction_type = 'materials' THEN amount ELSE 0 END) as materials_cost,
    SUM(CASE WHEN transaction_type = 'base_fee' THEN amount ELSE 0 END) as base_fees,
    SUM(CASE WHEN transaction_type = 'diagnostics_fee' THEN amount ELSE 0 END) as diagnostics_fees,
    SUM(CASE WHEN transaction_type = 'execution_fee' THEN amount ELSE 0 END) as execution_fees
FROM escrow_transactions
WHERE status = 'released'
    AND release_date BETWEEN $1 AND $2;

-- Financial report - daily breakdown
-- @param $1 - start_date, $2 - end_date
SELECT 
    DATE_TRUNC('day', release_date) as date,
    COUNT(*) as transactions,
    SUM(amount) as revenue,
    AVG(amount) as average_amount,
    SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END) as platform_fees
FROM escrow_transactions
WHERE status = 'released'
    AND release_date BETWEEN $1 AND $2
GROUP BY DATE_TRUNC('day', release_date)
ORDER BY date ASC;

-- User report - summary
-- @param $1 - start_date, $2 - end_date
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN user_type = 'client' THEN 1 END) as total_clients,
    COUNT(CASE WHEN user_type = 'artisan' THEN 1 END) as total_artisans,
    COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
    COUNT(CASE WHEN created_at BETWEEN $1 AND $2 THEN 1 END) as new_users,
    COUNT(CASE WHEN user_type = 'client' AND created_at BETWEEN $1 AND $2 THEN 1 END) as new_clients,
    COUNT(CASE WHEN user_type = 'artisan' AND created_at BETWEEN $1 AND $2 THEN 1 END) as new_artisans
FROM users;

-- User report - by location
-- @param $1 - start_date, $2 - end_date
SELECT 
    COALESCE(cp.service_address->>'zone', ap.residential_address->>'zone', 'Unknown') as zone,
    COUNT(CASE WHEN u.user_type = 'client' THEN 1 END) as clients,
    COUNT(CASE WHEN u.user_type = 'artisan' THEN 1 END) as artisans
FROM users u
LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
WHERE u.created_at BETWEEN $1 AND $2
GROUP BY zone
ORDER BY clients DESC;

-- Job report - by category
-- @param $1 - start_date, $2 - end_date
SELECT 
    category,
    COUNT(*) as job_count,
    COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_count,
    COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_count,
    COALESCE(AVG(jb.total_amount), 0) as average_value,
    COALESCE(SUM(jb.total_amount), 0) as total_value
FROM jobs j
LEFT JOIN job_billing jb ON j.id = jb.job_id
WHERE j.created_at BETWEEN $1 AND $2
GROUP BY category
ORDER BY job_count DESC;

-- Job report - by tier
-- @param $1 - start_date, $2 - end_date
SELECT 
    ap.tier_level,
    COUNT(*) as job_count,
    COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as completed_count,
    COALESCE(AVG(jb.workmanship_cost), 0) as average_earning
FROM jobs j
JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
LEFT JOIN job_billing jb ON j.id = jb.job_id
WHERE j.job_status = 'completed'
    AND j.completed_at BETWEEN $1 AND $2
GROUP BY ap.tier_level
ORDER BY ap.tier_level ASC;

-- Artisan performance report
-- @param $1 - start_date, $2 - end_date, $3 - limit
SELECT 
    ap.user_id,
    ap.full_legal_name,
    ap.skill_category,
    ap.tier_level,
    ap.star_rating,
    ap.completion_rate,
    COUNT(j.id) as total_jobs,
    COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as completed_jobs,
    COALESCE(SUM(jb.workmanship_cost), 0) as total_earnings,
    COALESCE(AVG(jb.workmanship_cost), 0) as average_earning,
    COALESCE(AVG(r.rating), 0) as avg_rating
FROM artisan_profiles ap
LEFT JOIN jobs j ON ap.user_id = j.artisan_id
LEFT JOIN job_billing jb ON j.id = jb.job_id
LEFT JOIN ratings r ON j.id = r.job_id AND r.reviewee_id = ap.user_id
WHERE ($1::date IS NULL OR j.completed_at >= $1)
    AND ($2::date IS NULL OR j.completed_at <= $2)
GROUP BY ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, ap.star_rating, ap.completion_rate
ORDER BY completed_jobs DESC
LIMIT $3;

-- Dispute report
-- @param $1 - start_date, $2 - end_date
SELECT 
    reason,
    COUNT(*) as count,
    COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count,
    AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_resolution_hours
FROM disputes
WHERE created_at BETWEEN $1 AND $2
GROUP BY reason
ORDER BY count DESC;

-- Payout report
-- @param $1 - start_date, $2 - end_date
SELECT 
    ap.user_id,
    ap.full_legal_name,
    COUNT(ap.id) as payout_count,
    SUM(ap.amount) as total_amount,
    AVG(ap.amount) as average_amount
FROM artisan_payouts ap
WHERE ap.created_at BETWEEN $1 AND $2
    AND ap.status = 'completed'
GROUP BY ap.user_id, ap.full_legal_name
ORDER BY total_amount DESC;

-- Refund report
-- @param $1 - start_date, $2 - end_date
SELECT 
    COUNT(*) as total_refunds,
    SUM(amount) as total_amount,
    AVG(amount) as average_amount,
    reason,
    COUNT(*) as count_by_reason
FROM refunds
WHERE created_at BETWEEN $1 AND $2
    AND status = 'completed'
GROUP BY reason
ORDER BY count_by_reason DESC;

-- Commission report
-- @param $1 - start_date, $2 - end_date
SELECT 
    DATE_TRUNC('month', release_date) as month,
    SUM(CASE WHEN transaction_type = 'platform_fee' THEN amount ELSE 0 END) as platform_fees,
    SUM(CASE WHEN transaction_type = 'monthly_fee' THEN amount ELSE 0 END) as monthly_fees,
    SUM(CASE WHEN transaction_type = 'onboarding_fee' THEN amount ELSE 0 END) as onboarding_fees
FROM escrow_transactions
WHERE status = 'released'
    AND release_date BETWEEN $1 AND $2
GROUP BY DATE_TRUNC('month', release_date)
ORDER BY month DESC;