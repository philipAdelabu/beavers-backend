-- ============================================
-- Client Profile Queries
-- ============================================

-- Get client profile with user details
-- @param $1 - user_id
SELECT 
    cp.*,
    u.email,
    u.phone,
    u.is_verified,
    u.verification_status,
    u.is_active,
    u.created_at as user_created_at
FROM client_profiles cp
JOIN users u ON cp.user_id = u.id
WHERE cp.user_id = $1;

-- Update client profile
-- @param $1 - full_legal_name, $2 - street_address, $3 - service_address, $4 - user_id
UPDATE client_profiles 
SET 
    full_legal_name = COALESCE($1, full_legal_name),
    street_address = COALESCE($2, street_address),
    service_address = COALESCE($3, service_address),
    updated_at = NOW()
WHERE user_id = $4
RETURNING *;

-- Get client addresses
-- @param $1 - client_id
SELECT * FROM client_addresses 
WHERE client_id = $1 
ORDER BY is_default DESC, created_at DESC;

-- Add client address
-- @param $1 - client_id, $2 - address, $3 - label, $4 - is_default, $5 - latitude, $6 - longitude
INSERT INTO client_addresses (client_id, address, label, is_default, latitude, longitude)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- Update client address
-- @param $1 - address, $2 - label, $3 - is_default, $4 - latitude, $5 - longitude, $6 - address_id, $7 - client_id
UPDATE client_addresses 
SET 
    address = COALESCE($1, address),
    label = COALESCE($2, label),
    is_default = COALESCE($3, is_default),
    latitude = COALESCE($4, latitude),
    longitude = COALESCE($5, longitude),
    updated_at = NOW()
WHERE id = $6 AND client_id = $7
RETURNING *;

-- Delete client address
-- @param $1 - address_id, $2 - client_id
DELETE FROM client_addresses 
WHERE id = $1 AND client_id = $2
RETURNING *;

-- Get saved artisans
-- @param $1 - client_id
SELECT 
    sa.*,
    ap.full_legal_name,
    ap.skill_category,
    ap.tier_level,
    ap.star_rating,
    ap.completion_rate,
    ap.trust_score
FROM saved_artisans sa
JOIN artisan_profiles ap ON sa.artisan_id = ap.user_id
WHERE sa.client_id = $1
ORDER BY sa.created_at DESC;

-- Save artisan
-- @param $1 - client_id, $2 - artisan_id
INSERT INTO saved_artisans (client_id, artisan_id)
VALUES ($1, $2)
ON CONFLICT (client_id, artisan_id) DO NOTHING
RETURNING *;

-- Remove saved artisan
-- @param $1 - client_id, $2 - artisan_id
DELETE FROM saved_artisans 
WHERE client_id = $1 AND artisan_id = $2
RETURNING *;

-- Get client job statistics
-- @param $1 - client_id
SELECT 
    COUNT(*) as total_jobs,
    COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
    COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
    COUNT(CASE WHEN job_status IN ('pending', 'accepted', 'arrived', 'diagnostics', 'execution') THEN 1 END) as active_jobs,
    COALESCE(SUM(jb.total_amount), 0) as total_spent,
    COALESCE(AVG(jb.total_amount), 0) as average_spent
FROM jobs j
LEFT JOIN job_billing jb ON j.id = jb.job_id
WHERE j.client_id = $1;

-- Get client favorite categories
-- @param $1 - client_id, $2 - limit
SELECT 
    category,
    COUNT(*) as job_count
FROM jobs
WHERE client_id = $1
GROUP BY category
ORDER BY job_count DESC
LIMIT $2;