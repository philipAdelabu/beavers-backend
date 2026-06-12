exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create artisan_fee_payments table for tracking onboarding and monthly fees
    CREATE TABLE IF NOT EXISTS artisan_fee_payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fee_type VARCHAR(50) NOT NULL CHECK (fee_type IN ('onboarding', 'monthly')),
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'NGN',
      payment_reference VARCHAR(100) UNIQUE,
      payment_method VARCHAR(50),
      status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
      payment_date TIMESTAMP,
      expiry_date TIMESTAMP,
      transaction_id VARCHAR(255),
      payment_gateway VARCHAR(50),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create artisan_subscriptions table for managing monthly subscriptions
    CREATE TABLE IF NOT EXISTS artisan_subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_status VARCHAR(50) DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'past_due', 'cancelled', 'expired')),
      current_period_start TIMESTAMP,
      current_period_end TIMESTAMP,
      last_payment_date TIMESTAMP,
      next_payment_date TIMESTAMP,
      payment_method_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      stripe_customer_id VARCHAR(255),
      paystack_subscription_code VARCHAR(255),
      flutterwave_subscription_id VARCHAR(255),
      auto_renew BOOLEAN DEFAULT TRUE,
      grace_period_end TIMESTAMP,
      cancelled_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create fee_configuration table for managing fee amounts
    CREATE TABLE IF NOT EXISTS fee_configuration (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      fee_type VARCHAR(50) UNIQUE NOT NULL CHECK (fee_type IN ('onboarding', 'monthly')),
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'NGN',
      is_active BOOLEAN DEFAULT TRUE,
      description TEXT,
      grace_period_days INTEGER DEFAULT 7,
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create fee_payment_logs for audit trail
    CREATE TABLE IF NOT EXISTS fee_payment_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fee_payment_id UUID REFERENCES artisan_fee_payments(id),
      action VARCHAR(100) NOT NULL,
      status VARCHAR(50),
      details JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_artisan_fee_payments_artisan_id ON artisan_fee_payments(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_artisan_fee_payments_fee_type ON artisan_fee_payments(fee_type);
    CREATE INDEX IF NOT EXISTS idx_artisan_fee_payments_status ON artisan_fee_payments(status);
    CREATE INDEX IF NOT EXISTS idx_artisan_fee_payments_payment_reference ON artisan_fee_payments(payment_reference);
    CREATE INDEX IF NOT EXISTS idx_artisan_fee_payments_payment_date ON artisan_fee_payments(payment_date);
    
    CREATE INDEX IF NOT EXISTS idx_artisan_subscriptions_artisan_id ON artisan_subscriptions(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_artisan_subscriptions_subscription_status ON artisan_subscriptions(subscription_status);
    CREATE INDEX IF NOT EXISTS idx_artisan_subscriptions_next_payment_date ON artisan_subscriptions(next_payment_date);
    
    CREATE INDEX IF NOT EXISTS idx_fee_payment_logs_artisan_id ON fee_payment_logs(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_fee_payment_logs_action ON fee_payment_logs(action);
    CREATE INDEX IF NOT EXISTS idx_fee_payment_logs_created_at ON fee_payment_logs(created_at);
    
    -- Insert default fee configuration
    INSERT INTO fee_configuration (fee_type, amount, currency, description, grace_period_days, created_at, updated_at) VALUES
      ('onboarding', 5000, 'NGN', 'One-time onboarding fee for new artisans', 0, NOW(), NOW()),
      ('monthly', 5000, 'NGN', 'Monthly technology fee for platform access', 7, NOW(), NOW());
    
    -- Create trigger for updated_at
    CREATE TRIGGER update_artisan_fee_payments_updated_at 
      BEFORE UPDATE ON artisan_fee_payments 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_artisan_subscriptions_updated_at 
      BEFORE UPDATE ON artisan_subscriptions 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_fee_configuration_updated_at 
      BEFORE UPDATE ON fee_configuration 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_fee_configuration_updated_at ON fee_configuration;
    DROP TRIGGER IF EXISTS update_artisan_subscriptions_updated_at ON artisan_subscriptions;
    DROP TRIGGER IF EXISTS update_artisan_fee_payments_updated_at ON artisan_fee_payments;
    DROP TABLE IF EXISTS fee_payment_logs CASCADE;
    DROP TABLE IF EXISTS fee_configuration CASCADE;
    DROP TABLE IF EXISTS artisan_subscriptions CASCADE;
    DROP TABLE IF EXISTS artisan_fee_payments CASCADE;
  `);
};