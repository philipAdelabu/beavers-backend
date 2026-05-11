exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create job_timeline table to track job status changes and activities
    CREATE TABLE IF NOT EXISTS job_timeline (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status VARCHAR(50) NOT NULL,
      description TEXT,
      metadata JSONB,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes for efficient queries
    CREATE INDEX IF NOT EXISTS idx_job_timeline_job_id ON job_timeline(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_timeline_status ON job_timeline(status);
    CREATE INDEX IF NOT EXISTS idx_job_timeline_created_at ON job_timeline(created_at);
    CREATE INDEX IF NOT EXISTS idx_job_timeline_job_status ON job_timeline(job_id, status);
    
    -- Create function to automatically add timeline entries on job status change
    CREATE OR REPLACE FUNCTION log_job_status_change()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.job_status IS DISTINCT FROM NEW.job_status THEN
        INSERT INTO job_timeline (job_id, status, description, metadata, created_at)
        VALUES (
          NEW.id, 
          NEW.job_status, 
          'Job status changed from ' || COALESCE(OLD.job_status, 'null') || ' to ' || NEW.job_status,
          jsonb_build_object(
            'old_status', OLD.job_status,
            'new_status', NEW.job_status,
            'changed_by', current_user
          ),
          NOW()
        );
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Create trigger to automatically log job status changes
    DROP TRIGGER IF EXISTS trigger_job_status_change ON jobs;
    CREATE TRIGGER trigger_job_status_change
      AFTER UPDATE OF job_status ON jobs
      FOR EACH ROW
      EXECUTE FUNCTION log_job_status_change();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS trigger_job_status_change ON jobs;
    DROP FUNCTION IF EXISTS log_job_status_change();
    DROP TABLE IF EXISTS job_timeline CASCADE;
  `);
};