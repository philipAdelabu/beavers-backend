exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS job_billing (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      base_fee DECIMAL(10,2) DEFAULT 0,
      diagnostics_fee DECIMAL(10,2) DEFAULT 0,
      diagnostics_duration DECIMAL(10,2),
      execution_fee DECIMAL(10,2) DEFAULT 0,
      execution_duration DECIMAL(10,2),
      execution_mode VARCHAR(20),
      materials_cost DECIMAL(10,2) DEFAULT 0,
      workmanship_cost DECIMAL(10,2) DEFAULT 0,
      total_amount DECIMAL(10,2) DEFAULT 0,
      platform_fee DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      billing_status VARCHAR(50) DEFAULT 'pending',
      escrow_hold_id VARCHAR(255),
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_job_billing_job_id ON job_billing(job_id);
    CREATE INDEX idx_job_billing_billing_status ON job_billing(billing_status);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS job_billing CASCADE;
  `);
};