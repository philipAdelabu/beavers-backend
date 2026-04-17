exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS payment_intents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id),
      client_id UUID NOT NULL REFERENCES users(id),
      payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
      client_secret VARCHAR(255) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'NGN',
      status VARCHAR(50) DEFAULT 'pending',
      failure_reason TEXT,
      metadata JSONB,
      paid_at TIMESTAMP,
      failed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS refunds (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id),
      payment_intent_id VARCHAR(255),
      amount DECIMAL(10,2) NOT NULL,
      reason TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      transaction_id VARCHAR(255),
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS payment_methods (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      client_id UUID NOT NULL REFERENCES users(id),
      payment_method_id VARCHAR(255) NOT NULL,
      type VARCHAR(50),
      last4 VARCHAR(4),
      expiry_month INTEGER,
      expiry_year INTEGER,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_payment_intents_job_id ON payment_intents(job_id);
    CREATE INDEX idx_payment_intents_client_id ON payment_intents(client_id);
    CREATE INDEX idx_payment_intents_status ON payment_intents(status);
    CREATE INDEX idx_refunds_job_id ON refunds(job_id);
    CREATE INDEX idx_payment_methods_client_id ON payment_methods(client_id);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS payment_methods CASCADE;
    DROP TABLE IF EXISTS refunds CASCADE;
    DROP TABLE IF EXISTS payment_intents CASCADE;
  `);
};