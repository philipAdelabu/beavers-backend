exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- Create users table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(20) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('client', 'artisan', 'admin')),
      is_verified BOOLEAN DEFAULT FALSE,
      verification_status VARCHAR(20) DEFAULT 'pending',
      verification_notes TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      last_login TIMESTAMP,
      last_login_ip INET,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes
    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_users_phone ON users(phone);
    CREATE INDEX idx_users_user_type ON users(user_type);
    CREATE INDEX idx_users_verification_status ON users(verification_status);
    CREATE INDEX idx_users_is_active ON users(is_active);
    CREATE INDEX idx_users_created_at ON users(created_at);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS users CASCADE;
  `);
};