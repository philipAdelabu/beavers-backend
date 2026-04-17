exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS job_offers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id),
      artisan_id UUID NOT NULL REFERENCES users(id),
      status VARCHAR(50) DEFAULT 'pending',
      expires_at TIMESTAMP,
      responded_at TIMESTAMP,
      response_time INTEGER,
      match_score DECIMAL(5,2),
      distance DECIMAL(10,2),
      is_resend BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS arrival_pins (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID UNIQUE NOT NULL REFERENCES jobs(id),
      pin VARCHAR(6) NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS job_timeline (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id),
      status VARCHAR(50),
      description TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_job_offers_job_id ON job_offers(job_id);
    CREATE INDEX idx_job_offers_artisan_id ON job_offers(artisan_id);
    CREATE INDEX idx_job_offers_status ON job_offers(status);
    CREATE INDEX idx_arrival_pins_job_id ON arrival_pins(job_id);
    CREATE INDEX idx_job_timeline_job_id ON job_timeline(job_id);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS job_timeline CASCADE;
    DROP TABLE IF EXISTS arrival_pins CASCADE;
    DROP TABLE IF EXISTS job_offers CASCADE;
  `);
};