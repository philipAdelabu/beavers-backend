exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create wallets table
    CREATE TABLE IF NOT EXISTS wallets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('client', 'artisan')),
      balance DECIMAL(12,2) DEFAULT 0,
      pending_balance DECIMAL(12,2) DEFAULT 0,
      total_deposited DECIMAL(12,2) DEFAULT 0,
      total_withdrawn DECIMAL(12,2) DEFAULT 0,
      total_earned DECIMAL(12,2) DEFAULT 0,
      total_spent DECIMAL(12,2) DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'NGN',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create wallet transactions table
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id),
      transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
        'deposit', 'withdrawal', 'payment', 'refund', 'earning', 
        'fee', 'bonus', 'adjustment', 'hold', 'release'
      )),
      amount DECIMAL(12,2) NOT NULL,
      balance_before DECIMAL(12,2) NOT NULL,
      balance_after DECIMAL(12,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'NGN',
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
      reference VARCHAR(100) UNIQUE,
      description TEXT,
      metadata JSONB,
      job_id UUID REFERENCES jobs(id),
      escrow_transaction_id UUID REFERENCES escrow_transactions(id),
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create withdrawal requests table (for artisans)
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id),
      wallet_id UUID NOT NULL REFERENCES wallets(id),
      amount DECIMAL(12,2) NOT NULL,
      bank_code VARCHAR(10),
      account_number VARCHAR(20),
      account_name VARCHAR(255),
      bank_name VARCHAR(100),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
      reference VARCHAR(100) UNIQUE,
      failure_reason TEXT,
      processed_by UUID REFERENCES users(id),
      processed_at TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create transaction holds table (for escrow-like holds)
    CREATE TABLE IF NOT EXISTS transaction_holds (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_id UUID NOT NULL REFERENCES wallets(id),
      job_id UUID REFERENCES jobs(id),
      amount DECIMAL(12,2) NOT NULL,
      reason VARCHAR(100),
      release_date TIMESTAMP,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'released', 'cancelled', 'expired')),
      released_at TIMESTAMP,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
    CREATE INDEX IF NOT EXISTS idx_wallets_user_type ON wallets(user_type);
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON wallet_transactions(reference);
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_job_id ON wallet_transactions(job_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_artisan_id ON withdrawal_requests(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
    CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_reference ON withdrawal_requests(reference);
    CREATE INDEX IF NOT EXISTS idx_transaction_holds_wallet_id ON transaction_holds(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_holds_job_id ON transaction_holds(job_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_holds_status ON transaction_holds(status);
    
    -- Create trigger for updated_at
    CREATE TRIGGER update_wallets_updated_at 
      BEFORE UPDATE ON wallets 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_wallet_transactions_updated_at 
      BEFORE UPDATE ON wallet_transactions 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_withdrawal_requests_updated_at 
      BEFORE UPDATE ON withdrawal_requests 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_transaction_holds_updated_at 
      BEFORE UPDATE ON transaction_holds 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_transaction_holds_updated_at ON transaction_holds;
    DROP TRIGGER IF EXISTS update_withdrawal_requests_updated_at ON withdrawal_requests;
    DROP TRIGGER IF EXISTS update_wallet_transactions_updated_at ON wallet_transactions;
    DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
    DROP TABLE IF EXISTS transaction_holds CASCADE;
    DROP TABLE IF EXISTS withdrawal_requests CASCADE;
    DROP TABLE IF EXISTS wallet_transactions CASCADE;
    DROP TABLE IF EXISTS wallets CASCADE;
  `);
};