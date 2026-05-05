exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Add visibility fields to jobs table
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS viewed_count INTEGER DEFAULT 0;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS offer_count INTEGER DEFAULT 0;
    
    -- Add separate latitude/longitude columns for location queries (if not exist)
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8);
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);
    
    -- Create regular b-tree indexes (NO GiST indexes on jsonb)
    CREATE INDEX IF NOT EXISTS idx_jobs_is_public_expires ON jobs(is_public, expires_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_category_status ON jobs(category, job_status);
    CREATE INDEX IF NOT EXISTS idx_jobs_coordinates ON jobs(latitude, longitude);
    
    -- Create job_alerts table
    CREATE TABLE IF NOT EXISTS job_alerts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      categories TEXT[],
      min_budget DECIMAL(10,2),
      max_distance INTEGER,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(artisan_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_job_alerts_artisan_id ON job_alerts(artisan_id);
    
    -- Create job_views table
    CREATE TABLE IF NOT EXISTS job_views (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      artisan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(job_id, artisan_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_job_views_job_id ON job_views(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_views_artisan_id ON job_views(artisan_id);
    
    -- Create saved_jobs table
    CREATE TABLE IF NOT EXISTS saved_jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      artisan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(job_id, artisan_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_saved_jobs_artisan_id ON saved_jobs(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_saved_jobs_created_at ON saved_jobs(created_at);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS saved_jobs CASCADE;
    DROP TABLE IF EXISTS job_views CASCADE;
    DROP TABLE IF EXISTS job_alerts CASCADE;
    DROP INDEX IF EXISTS idx_jobs_is_public_expires;
    DROP INDEX IF EXISTS idx_jobs_category_status;
    DROP INDEX IF EXISTS idx_jobs_coordinates;
    ALTER TABLE jobs DROP COLUMN IF EXISTS is_public;
    ALTER TABLE jobs DROP COLUMN IF EXISTS expires_at;
    ALTER TABLE jobs DROP COLUMN IF EXISTS viewed_count;
    ALTER TABLE jobs DROP COLUMN IF EXISTS offer_count;
    ALTER TABLE jobs DROP COLUMN IF EXISTS latitude;
    ALTER TABLE jobs DROP COLUMN IF EXISTS longitude;
  `);
};