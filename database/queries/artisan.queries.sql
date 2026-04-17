-- ============================================
-- Artisan Profile Queries
-- ============================================

-- Get artisan profile with user details
-- @param $1 - user_id
SELECT 
    ap.*,
    u.email,
    u.phone,
    u.is_verified,
    u.verification_status,
    u.is_active,
    u.created_at as user_created_at
FROM artisan_profiles ap
JOIN users u ON ap.user_id = u.id
WHERE ap.user_id = $1;

-- Update artisan profile
-- @param $1 - full_legal_name, $2 - residential_address, $3 - skill_category, $4 - sub_categories, $5 - user_id
UPDATE artisan_profiles 
SET 
    full_legal_name = COALESCE($1, full_legal_name),
    residential_address = COALESCE($2, residential_address),
    skill_category = COALESCE($3, skill_category),
    sub_categories = COALESCE($4, sub_categories),
    updated_at = NOW()
WHERE user_id = $5
RETURNING *;

-- Update artisan availability
-- @param $1 - is_available, $2 - current_location, $3 - user_id
UPDATE artisan_profiles 
SET 
    is_available = $1,
    current_location = $2,
    last_availability_change = NOW(),
    last_location_update = NOW()
WHERE user_id = $3
RETURNING *;

-- Get available artisans by category
-- @param $1 - category, $2 - is_available, $3 - monthly_fee_status
SELECT 
    ap.*,
    u.email,
    u.phone,
    u.is_active
FROM artisan_profiles ap
JOIN users u ON ap.user_id = u.id
WHERE ap.skill_category = $1
    AND ap.is_available = $2
    AND ap.monthly_fee_status = $3
    AND u.is_active = true
ORDER BY ap.tier_level DESC, ap.star_rating DESC;

-- Get artisan earnings summary
-- @param $1 - artisan_id, $2 - start_date, $3 - end_date
SELECT 
    COALESCE(SUM(jb.workmanship_cost), 0) as total_earnings,
    COALESCE(SUM(CASE WHEN jb.billing_status = 'paid' THEN jb.workmanship_cost ELSE 0 END), 0) as paid_earnings,
    COALESCE(SUM(CASE WHEN jb.billing_status = 'pending' THEN jb.workmanship_cost ELSE 0 END), 0) as pending_earnings,
    COUNT(*) as total_jobs,
    COUNT(CASE WHEN j.job_status = 'completed' THEN 1 END) as completed_jobs,
    AVG(jb.workmanship_cost) as average_earning
FROM jobs j
JOIN job_billing jb ON j.id = jb.job_id
WHERE j.artisan_id = $1 
    AND j.job_status = 'completed'
    AND ($2::date IS NULL OR j.completed_at >= $2)
    AND ($3::date IS NULL OR j.completed_at <= $3);

-- Get artisan monthly earnings breakdown
-- @param $1 - artisan_id
SELECT 
    DATE_TRUNC('month', j.completed_at) as month,
    COALESCE(SUM(jb.workmanship_cost), 0) as earnings,
    COUNT(*) as jobs_completed
FROM jobs j
JOIN job_billing jb ON j.id = jb.job_id
WHERE j.artisan_id = $1 
    AND j.job_status = 'completed'
    AND j.completed_at > NOW() - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', j.completed_at)
ORDER BY month DESC;

-- Get artisan withdrawal history
-- @param $1 - artisan_id, $2 - limit, $3 - offset
SELECT * FROM withdrawals 
WHERE artisan_id = $1 
ORDER BY created_at DESC 
LIMIT $2 OFFSET $3;

-- Create withdrawal request
-- @param $1 - artisan_id, $2 - amount, $3 - bank_code, $4 - account_number, $5 - account_name
INSERT INTO withdrawals (artisan_id, amount, bank_code, account_number, account_name, status)
VALUES ($1, $2, $3, $4, $5, 'pending')
RETURNING *;

-- Update artisan tier
-- @param $1 - tier_level, $2 - tier_update_reason, $3 - user_id
UPDATE artisan_profiles 
SET 
    tier_level = $1,
    tier_updated_at = NOW(),
    tier_update_reason = $2
WHERE user_id = $3
RETURNING *;

-- Get artisan performance metrics
-- @param $1 - artisan_id
SELECT 
    ap.star_rating,
    ap.total_ratings,
    ap.completion_rate,
    ap.trust_score,
    ap.tier_level,
    (SELECT COUNT(*) FROM jobs WHERE artisan_id = $1 AND job_status = 'completed') as total_completed_jobs,
    (SELECT AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))) FROM jobs WHERE artisan_id = $1 AND accepted_at IS NOT NULL) as avg_response_time_seconds,
    (SELECT AVG(EXTRACT(EPOCH FROM (completed_at - accepted_at))) FROM jobs WHERE artisan_id = $1 AND completed_at IS NOT NULL) as avg_completion_time_seconds
FROM artisan_profiles ap
WHERE ap.user_id = $1;

-- Get artisan rating distribution
-- @param $1 - artisan_id
SELECT 
    rating,
    COUNT(*) as count
FROM ratings
WHERE reviewee_id = $1
GROUP BY rating
ORDER BY rating DESC;

-- Get artisan tools
-- @param $1 - artisan_id
SELECT * FROM artisan_tools 
WHERE artisan_id = $1 
ORDER BY created_at DESC;

-- Get artisan schedule
-- @param $1 - artisan_id, $2 - date
SELECT * FROM artisan_schedules 
WHERE artisan_id = $1 AND date = $2
ORDER BY start_time;

-- Set artisan schedule
-- @param $1 - artisan_id, $2 - day_of_week, $3 - start_time, $4 - end_time, $5 - is_available
INSERT INTO artisan_schedules (artisan_id, day_of_week, start_time, end_time, is_available)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (artisan_id, day_of_week) 
DO UPDATE SET 
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    is_available = EXCLUDED.is_available,
    updated_at = NOW()
RETURNING *;