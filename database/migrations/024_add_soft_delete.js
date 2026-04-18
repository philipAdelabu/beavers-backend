exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Add soft delete columns to existing tables (only if they don't exist)
    DO $$ 
    BEGIN
      -- Add deleted_at to users if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'users' AND column_name = 'deleted_at') THEN
        ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
      END IF;
      
      -- Add deleted_at to jobs if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'jobs' AND column_name = 'deleted_at') THEN
        ALTER TABLE jobs ADD COLUMN deleted_at TIMESTAMP;
      END IF;
      
      -- Add deleted_at to artisan_profiles if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'artisan_profiles' AND column_name = 'deleted_at') THEN
        ALTER TABLE artisan_profiles ADD COLUMN deleted_at TIMESTAMP;
      END IF;
      
      -- Add deleted_at to client_profiles if not exists
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'client_profiles' AND column_name = 'deleted_at') THEN
        ALTER TABLE client_profiles ADD COLUMN deleted_at TIMESTAMP;
      END IF;
    END $$;
    
    -- Create indexes for soft delete queries (if they don't exist)
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at ON jobs(deleted_at);
    
    -- Note: The update_updated_at_column function and triggers were already created in migration 001
    -- We don't need to recreate them here
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    -- Remove soft delete columns
    ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
    ALTER TABLE jobs DROP COLUMN IF EXISTS deleted_at;
    ALTER TABLE artisan_profiles DROP COLUMN IF EXISTS deleted_at;
    ALTER TABLE client_profiles DROP COLUMN IF EXISTS deleted_at;
    
    -- Drop indexes
    DROP INDEX IF EXISTS idx_users_deleted_at;
    DROP INDEX IF EXISTS idx_jobs_deleted_at;
  `);
};