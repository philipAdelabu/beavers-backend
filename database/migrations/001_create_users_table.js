exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- Create function to automatically update updated_at column
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
     
    -- Create users table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(20) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('client', 'artisan', 'admin')),
      is_verified BOOLEAN DEFAULT FALSE,
      is_email_verified BOOLEAN DEFAULT FALSE,
      is_phone_verified BOOLEAN DEFAULT FALSE,
      verification_status VARCHAR(20) DEFAULT 'pending',
      verification_notes TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      is_logged_in BOOLEAN DEFAULT FALSE,
      last_login TIMESTAMP,
      last_logout TIMESTAMP,
      last_login_ip INET,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
    CREATE INDEX IF NOT EXISTS idx_users_verification_status ON users(verification_status);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
    
    -- Create trigger for users table
    CREATE TRIGGER update_users_updated_at 
      BEFORE UPDATE ON users 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    DROP TABLE IF EXISTS users CASCADE;
    DROP FUNCTION IF EXISTS update_updated_at_column();
  `);
};
