exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS escrow_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id),
      client_id UUID NOT NULL REFERENCES users(id),
      artisan_id UUID REFERENCES users(id),
      amount DECIMAL(10,2) NOT NULL,
      transaction_type VARCHAR(50),
      status VARCHAR(50) DEFAULT 'held',
      dispute_buffer_until TIMESTAMP,
      release_date TIMESTAMP,
      release_reason VARCHAR(100),
      frozen_at TIMESTAMP,
      freeze_reason TEXT,
      frozen_by UUID REFERENCES users(id),
      refunded_at TIMESTAMP,
      refund_reason TEXT,
      refunded_by UUID REFERENCES users(id),
      released_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS artisan_payouts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id),
      artisan_id UUID NOT NULL REFERENCES users(id),
      amount DECIMAL(10,2) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      transfer_reference VARCHAR(255),
      failure_reason TEXT,
      completed_at TIMESTAMP,
      failed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS withdrawals (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id),
      amount DECIMAL(10,2) NOT NULL,
      bank_code VARCHAR(10),
      account_number VARCHAR(20),
      account_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending',
      transfer_reference VARCHAR(255),
      failure_reason TEXT,
      completed_at TIMESTAMP,
      failed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_escrow_job_id ON escrow_transactions(job_id);
    CREATE INDEX idx_escrow_client_id ON escrow_transactions(client_id);
    CREATE INDEX idx_escrow_artisan_id ON escrow_transactions(artisan_id);
    CREATE INDEX idx_escrow_status ON escrow_transactions(status);
    CREATE INDEX idx_artisan_payouts_artisan_id ON artisan_payouts(artisan_id);
    CREATE INDEX idx_artisan_payouts_status ON artisan_payouts(status);
    CREATE INDEX idx_withdrawals_artisan_id ON withdrawals(artisan_id);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS withdrawals CASCADE;
    DROP TABLE IF EXISTS artisan_payouts CASCADE;
    DROP TABLE IF EXISTS escrow_transactions CASCADE;
  `);
};