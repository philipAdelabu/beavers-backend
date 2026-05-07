exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS job_timeline (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status VARCHAR(100),
      description TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
  
    CREATE INDEX idx_job_timeline_status ON job_timeline(status);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS job_timeline CASCADE;
  `);
};