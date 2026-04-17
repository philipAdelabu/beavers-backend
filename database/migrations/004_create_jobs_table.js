exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      client_id UUID NOT NULL REFERENCES users(id),
      artisan_id UUID REFERENCES users(id),
      category VARCHAR(100) NOT NULL,
      description TEXT,
      media_urls TEXT[],
      service_type VARCHAR(50) CHECK (service_type IN ('inspection', 'repair', 'installation', 'emergency')),
      job_status VARCHAR(50) DEFAULT 'pending',
      billing_mode VARCHAR(50) CHECK (billing_mode IN ('time_based', 'quoted')),
      location JSONB,
      quoted_amount DECIMAL(10,2),
      quote_details TEXT,
      estimated_duration INTEGER,
      diagnostics_findings TEXT,
      diagnostics_started_at TIMESTAMP,
      diagnostics_ended_at TIMESTAMP,
      execution_started_at TIMESTAMP,
      execution_ended_at TIMESTAMP,
      accepted_at TIMESTAMP,
      arrived_at TIMESTAMP,
      completed_at TIMESTAMP,
      cancelled_at TIMESTAMP,
      cancellation_reason TEXT,
      cancelled_by VARCHAR(20),
      quote_approved_at TIMESTAMP,
      quote_rejected_at TIMESTAMP,
      quote_rejection_reason TEXT,
      completion_notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_jobs_client_id ON jobs(client_id);
    CREATE INDEX idx_jobs_artisan_id ON jobs(artisan_id);
    CREATE INDEX idx_jobs_job_status ON jobs(job_status);
    CREATE INDEX idx_jobs_category ON jobs(category);
    CREATE INDEX idx_jobs_service_type ON jobs(service_type);
    CREATE INDEX idx_jobs_created_at ON jobs(created_at);
    CREATE INDEX idx_jobs_completed_at ON jobs(completed_at);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS jobs CASCADE;
  `);
};