exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS client_profiles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_legal_name VARCHAR(255) NOT NULL,
      nin VARCHAR(50) NOT NULL,
      street_address TEXT NOT NULL,
      service_address TEXT NOT NULL,
      verification_documents JSONB,
      verification_status VARCHAR(20) DEFAULT 'pending',
      verification_notes TEXT,
      stripe_customer_id VARCHAR(255),
      re_verification_needed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_client_profiles_user_id ON client_profiles(user_id);
    CREATE INDEX idx_client_profiles_nin ON client_profiles(nin);
    CREATE INDEX idx_client_profiles_verification_status ON client_profiles(verification_status);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS client_profiles CASCADE;
  `);
};