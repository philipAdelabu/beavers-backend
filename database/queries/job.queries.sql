-- ============================================
-- Job Queries
-- ============================================

-- Create new job
-- @param $1 - client_id, $2 - category, $3 - description, $4 - media_urls, $5 - service_type, $6 - location
INSERT INTO jobs (client_id, category, description, media_urls, service_type, job_status, location)
VALUES ($1, $2, $3, $4, $5, 'pending', $6)
RETURNING *;

-- Get job details with all related info
-- @param $1 - job_id
SELECT 
    j.*,
    cp.full_legal_name as client_name,
    cp.phone as client_phone,
    cp.email as client_email,
    ap.full_legal_name as artisan_name,
    ap.phone as artisan_phone,
    ap.star_rating as artisan_rating,
    jb.base_fee,
    jb.diagnostics_fee,
    jb.execution_fee,
    jb.materials_cost,
    jb.workmanship_cost,
    jb.total_amount,
    jb.billing_status,
    boq.items as boq_items,
    boq.status as boq_status
FROM jobs j
LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
LEFT JOIN job_billing jb ON j.id = jb.job_id
LEFT JOIN bill_of_quantities boq ON j.id = boq.job_id AND boq.version = (
    SELECT MAX(version) FROM bill_of_quantities WHERE job_id = j.id
)
WHERE j.id = $1;

-- Get client jobs with pagination
-- @param $1 - client_id, $2 - status, $3 - limit, $4 - offset
SELECT 
    j.*,
    ap.full_legal_name as artisan_name,
    ap.star_rating
FROM jobs j
LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
WHERE j.client_id = $1
    AND ($2::text IS NULL OR j.job_status = $2)
ORDER BY j.created_at DESC
LIMIT $3 OFFSET $4;

-- Count client jobs
-- @param $1 - client_id, $2 - status
SELECT COUNT(*) 
FROM jobs 
WHERE client_id = $1
    AND ($2::text IS NULL OR job_status = $2);

-- Get artisan jobs with pagination
-- @param $1 - artisan_id, $2 - status, $3 - limit, $4 - offset
SELECT 
    j.*,
    cp.full_legal_name as client_name,
    cp.phone as client_phone
FROM jobs j
LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
WHERE j.artisan_id = $1
    AND ($2::text IS NULL OR j.job_status = $2)
ORDER BY j.created_at DESC
LIMIT $3 OFFSET $4;

-- Get active jobs for artisan
-- @param $1 - artisan_id
SELECT * FROM jobs 
WHERE artisan_id = $1 
    AND job_status IN ('accepted', 'arrived', 'diagnostics', 'execution')
ORDER BY created_at ASC;

-- Accept job offer
-- @param $1 - job_id, $2 - artisan_id
UPDATE jobs 
SET 
    artisan_id = $2,
    job_status = 'accepted',
    accepted_at = NOW(),
    updated_at = NOW()
WHERE id = $1 AND job_status = 'pending'
RETURNING *;

-- Confirm arrival
-- @param $1 - job_id
UPDATE jobs 
SET 
    job_status = 'arrived',
    arrived_at = NOW(),
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- Start diagnostics
-- @param $1 - job_id, $2 - artisan_id
UPDATE jobs 
SET 
    diagnostics_started_at = NOW(),
    job_status = 'diagnostics'
WHERE id = $1 AND artisan_id = $2
RETURNING *;

-- Stop diagnostics
-- @param $1 - job_id, $2 - artisan_id, $3 - billing_mode
UPDATE jobs 
SET 
    diagnostics_ended_at = NOW(),
    billing_mode = $3,
    job_status = 'awaiting_execution_approval'
WHERE id = $1 AND artisan_id = $2
RETURNING *;

-- Start execution (time-based)
-- @param $1 - job_id, $2 - artisan_id
UPDATE jobs 
SET 
    execution_started_at = NOW(),
    job_status = 'execution'
WHERE id = $1 AND artisan_id = $2 AND billing_mode = 'time_based'
RETURNING *;

-- Pause execution
-- @param $1 - job_id, $2 - artisan_id
UPDATE jobs 
SET job_status = 'paused'
WHERE id = $1 AND artisan_id = $2
RETURNING *;

-- Resume execution
-- @param $1 - job_id, $2 - artisan_id
UPDATE jobs 
SET job_status = 'execution'
WHERE id = $1 AND artisan_id = $2
RETURNING *;

-- Stop execution
-- @param $1 - job_id, $2 - artisan_id
UPDATE jobs 
SET 
    execution_ended_at = NOW(),
    job_status = 'awaiting_completion_confirmation'
WHERE id = $1 AND artisan_id = $2
RETURNING *;

-- Submit quote
-- @param $1 - job_id, $2 - artisan_id, $3 - quote_amount, $4 - quote_details, $5 - estimated_duration
UPDATE jobs 
SET 
    quoted_amount = $3,
    quote_details = $4,
    estimated_duration = $5,
    job_status = 'pending_quote_approval'
WHERE id = $1 AND artisan_id = $2 AND billing_mode = 'quoted'
RETURNING *;

-- Approve quote
-- @param $1 - job_id, $2 - client_id
UPDATE jobs 
SET 
    job_status = 'quote_approved',
    quote_approved_at = NOW()
WHERE id = $1 AND client_id = $2 AND job_status = 'pending_quote_approval'
RETURNING *;

-- Complete job
-- @param $1 - job_id, $2 - artisan_id, $3 - completion_notes
UPDATE jobs 
SET 
    job_status = 'completed',
    completed_at = NOW(),
    completion_notes = $3
WHERE id = $1 AND artisan_id = $2
    AND job_status IN ('execution', 'quote_approved', 'awaiting_completion_confirmation')
RETURNING *;

-- Cancel job
-- @param $1 - job_id, $2 - reason, $3 - cancelled_by
UPDATE jobs 
SET 
    job_status = 'cancelled',
    cancelled_at = NOW(),
    cancellation_reason = $2,
    cancelled_by = $3
WHERE id = $1
RETURNING *;

-- Create job offer
-- @param $1 - job_id, $2 - artisan_id
INSERT INTO job_offers (job_id, artisan_id, status, expires_at)
VALUES ($1, $2, 'pending', NOW() + INTERVAL '2 minutes')
RETURNING *;

-- Get job timeline
-- @param $1 - job_id
SELECT * FROM job_timeline 
WHERE job_id = $1 
ORDER BY created_at ASC;

-- Add timeline entry
-- @param $1 - job_id, $2 - status, $3 - description, $4 - metadata
INSERT INTO job_timeline (job_id, status, description, metadata)
VALUES ($1, $2, $3, $4)
RETURNING *;