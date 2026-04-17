exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Performance indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_client_id_status ON jobs(client_id, job_status);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_artisan_id_status ON jobs(artisan_id, job_status);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_created_at_status ON jobs(created_at, job_status);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_category_created ON jobs(category, created_at);
    
    -- Composite indexes for common queries
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_verification ON users(verification_status, is_active);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artisan_availability ON artisan_profiles(is_available, tier_level, star_rating);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_artisan_monthly_fee ON artisan_profiles(monthly_fee_status, is_available);
    
    -- Payment indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_intents_client_status ON payment_intents(client_id, status);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escrow_job_status ON escrow_transactions(job_id, status);
    
    -- Notification indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_created_user ON notifications(created_at, user_id);
    
    -- Rating indexes
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ratings_reviewee_rating ON ratings(reviewee_id, rating);
    
    -- Location history indexes for time-based queries
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_location_history_artisan_timestamp ON location_history(artisan_id, timestamp);
    
    -- Audit log indexes for efficient searching
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity_action ON audit_logs(entity_type, action);
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_user ON audit_logs(created_at, user_id);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP INDEX IF EXISTS idx_jobs_client_id_status;
    DROP INDEX IF EXISTS idx_jobs_artisan_id_status;
    DROP INDEX IF EXISTS idx_jobs_created_at_status;
    DROP INDEX IF EXISTS idx_jobs_category_created;
    DROP INDEX IF EXISTS idx_users_verification;
    DROP INDEX IF EXISTS idx_artisan_availability;
    DROP INDEX IF EXISTS idx_artisan_monthly_fee;
    DROP INDEX IF EXISTS idx_payment_intents_client_status;
    DROP INDEX IF EXISTS idx_escrow_job_status;
    DROP INDEX IF EXISTS idx_notifications_user_read;
    DROP INDEX IF EXISTS idx_notifications_created_user;
    DROP INDEX IF EXISTS idx_ratings_reviewee_rating;
    DROP INDEX IF EXISTS idx_location_history_artisan_timestamp;
    DROP INDEX IF EXISTS idx_audit_logs_entity_action;
    DROP INDEX IF EXISTS idx_audit_logs_created_user;
  `);
};