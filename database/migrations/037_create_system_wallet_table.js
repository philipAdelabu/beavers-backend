exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create system_wallets table
    CREATE TABLE IF NOT EXISTS system_wallets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_name VARCHAR(100) NOT NULL,
      wallet_type VARCHAR(50) NOT NULL CHECK (wallet_type IN ('main', 'commission', 'fees', 'escrow', 'operations')),
      balance DECIMAL(12,2) DEFAULT 0,
      pending_balance DECIMAL(12,2) DEFAULT 0,
      total_credited DECIMAL(12,2) DEFAULT 0,
      total_debited DECIMAL(12,2) DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'NGN',
      is_active BOOLEAN DEFAULT TRUE,
      description TEXT,
      last_transaction_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create system_wallet_transactions table
    CREATE TABLE IF NOT EXISTS system_wallet_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_id UUID NOT NULL REFERENCES system_wallets(id) ON DELETE CASCADE,
      transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
        'onboarding_fee', 'monthly_fee', 'commission', 'transfer_in', 'transfer_out',
        'refund', 'adjustment', 'bonus', 'penalty', 'operational_cost'
      )),
      amount DECIMAL(12,2) NOT NULL,
      balance_before DECIMAL(12,2) NOT NULL,
      balance_after DECIMAL(12,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'NGN',
      status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
      reference VARCHAR(100) UNIQUE,
      description TEXT,
      source_type VARCHAR(50),
      source_id UUID,
      destination_type VARCHAR(50),
      destination_id UUID,
      metadata JSONB,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create system_wallet_balance_history table for tracking daily balances
    CREATE TABLE IF NOT EXISTS system_wallet_balance_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_id UUID NOT NULL REFERENCES system_wallets(id) ON DELETE CASCADE,
      balance DECIMAL(12,2) NOT NULL,
      date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_id, date)
    );
    
    -- Create system_wallet_settings table
    CREATE TABLE IF NOT EXISTS system_wallet_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      key VARCHAR(100) UNIQUE NOT NULL,
      value JSONB,
      description TEXT,
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_system_wallets_type ON system_wallets(wallet_type);
    CREATE INDEX IF NOT EXISTS idx_system_wallets_name ON system_wallets(wallet_name);
    
    CREATE INDEX IF NOT EXISTS idx_system_wallet_transactions_wallet_id ON system_wallet_transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_system_wallet_transactions_type ON system_wallet_transactions(transaction_type);
    CREATE INDEX IF NOT EXISTS idx_system_wallet_transactions_reference ON system_wallet_transactions(reference);
    CREATE INDEX IF NOT EXISTS idx_system_wallet_transactions_source ON system_wallet_transactions(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_system_wallet_transactions_created_at ON system_wallet_transactions(created_at);
    
    CREATE INDEX IF NOT EXISTS idx_system_wallet_balance_history_wallet_id ON system_wallet_balance_history(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_system_wallet_balance_history_date ON system_wallet_balance_history(date);
    
    -- Insert default system wallets
    INSERT INTO system_wallets (id, wallet_name, wallet_type, description, created_at, updated_at) VALUES
      (uuid_generate_v4(), 'Main Revenue Wallet', 'main', 'Primary wallet for all platform revenue', NOW(), NOW()),
      (uuid_generate_v4(), 'Commission Wallet', 'commission', 'Wallet for platform commissions from jobs', NOW(), NOW()),
      (uuid_generate_v4(), 'Fees Wallet', 'fees', 'Wallet for onboarding and monthly fees', NOW(), NOW()),
      (uuid_generate_v4(), 'Operational Expenses', 'operations', 'Wallet for operational costs and expenses', NOW(), NOW());
    
    -- Insert default settings
    INSERT INTO system_wallet_settings (key, value, description) VALUES
      ('auto_transfer_settings', '{"enabled": true, "transfer_to": "main", "threshold": 10000, "schedule": "daily"}', 'Auto transfer settings for wallet consolidation'),
      ('commission_distribution', '{"platform": 70, "operations": 20, "fees": 10}', 'How commissions are distributed across wallets'),
      ('fee_wallets', '{"onboarding": "fees", "monthly": "fees"}', 'Which wallet receives which type of fee'),
      ('notification_settings', '{"balance_threshold": 1000, "daily_summary": true, "weekly_summary": true}', 'Notification settings for wallet');
    
    -- Create triggers for updated_at
    CREATE TRIGGER update_system_wallets_updated_at 
      BEFORE UPDATE ON system_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_system_wallet_transactions_updated_at 
      BEFORE UPDATE ON system_wallet_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_system_wallet_settings_updated_at 
      BEFORE UPDATE ON system_wallet_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    -- Create function to auto-record daily balance
    CREATE OR REPLACE FUNCTION record_system_wallet_daily_balance()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO system_wallet_balance_history (wallet_id, balance, date)
      VALUES (NEW.id, NEW.balance, CURRENT_DATE)
      ON CONFLICT (wallet_id, date) 
      DO UPDATE SET balance = EXCLUDED.balance;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Create trigger to record daily balance on update
    CREATE TRIGGER record_system_wallet_daily_balance
      AFTER UPDATE ON system_wallets
      FOR EACH ROW
      EXECUTE FUNCTION record_system_wallet_daily_balance();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS record_system_wallet_daily_balance ON system_wallets;
    DROP FUNCTION IF EXISTS record_system_wallet_daily_balance();
    DROP TRIGGER IF EXISTS update_system_wallet_settings_updated_at ON system_wallet_settings;
    DROP TRIGGER IF EXISTS update_system_wallet_transactions_updated_at ON system_wallet_transactions;
    DROP TRIGGER IF EXISTS update_system_wallets_updated_at ON system_wallets;
    DROP TABLE IF EXISTS system_wallet_settings CASCADE;
    DROP TABLE IF EXISTS system_wallet_balance_history CASCADE;
    DROP TABLE IF EXISTS system_wallet_transactions CASCADE;
    DROP TABLE IF EXISTS system_wallets CASCADE;
  `);
};