exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create fee_payment_intents table for tracking user fee payments
    CREATE TABLE IF NOT EXISTS funding_payment_intents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fee_type VARCHAR(50) NOT NULL CHECK (fee_type IN ('onboarding', 'monthly', 'funding', 'tech_fee')),
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'NGN',
      payment_reference VARCHAR(100) UNIQUE NOT NULL,
      payment_intent_id VARCHAR(255) UNIQUE,
      client_secret VARCHAR(255),
      status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded')),
      payment_method_type VARCHAR(50),
      payment_method_id VARCHAR(255),
      gateway VARCHAR(50) DEFAULT 'paystack',
      gateway_reference VARCHAR(255),
      gateway_transaction_id VARCHAR(255),
      failure_reason TEXT,
      metadata JSONB,
      paid_at TIMESTAMP,
      failed_at TIMESTAMP,
      expires_at TIMESTAMP,
      refunded_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_funding_payment_intents_user_id ON funding_payment_intents(user_id);
    CREATE INDEX IF NOT EXISTS idx_funding_payment_intents_fee_type ON funding_payment_intents(fee_type);
    CREATE INDEX IF NOT EXISTS idx_funding_payment_intents_status ON funding_payment_intents(status);
    CREATE INDEX IF NOT EXISTS idx_funding_payment_intents_payment_reference ON funding_payment_intents(payment_reference);
    CREATE INDEX IF NOT EXISTS idx_funding_payment_intents_payment_intent_id ON funding_payment_intents(payment_intent_id);
    CREATE INDEX IF NOT EXISTS idx_funding_payment_intents_created_at ON funding_payment_intents(created_at);
    CREATE INDEX IF NOT EXISTS idx_funding_payment_intents_expires_at ON funding_payment_intents(expires_at);
    
    -- Create trigger for updated_at
    CREATE TRIGGER update_funding_payment_intents_updated_at 
      BEFORE UPDATE ON funding_payment_intents 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_funding_payment_intents_updated_at ON funding_payment_intents;
    DROP TABLE IF EXISTS funding_payment_intents CASCADE;
  `);
};