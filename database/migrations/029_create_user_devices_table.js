exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create user_devices table for FCM tokens
    CREATE TABLE IF NOT EXISTS user_devices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fcm_token VARCHAR(255) UNIQUE NOT NULL,
      device_id VARCHAR(255),
      device_name VARCHAR(255),
      device_model VARCHAR(100),
      os_version VARCHAR(50),
      app_version VARCHAR(20),
      platform VARCHAR(20),
      is_active BOOLEAN DEFAULT TRUE,
      last_used TIMESTAMP,
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      unregistered_at TIMESTAMP,
      invalidated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_devices_fcm_token ON user_devices(fcm_token);
    CREATE INDEX IF NOT EXISTS idx_user_devices_is_active ON user_devices(is_active);
    CREATE INDEX IF NOT EXISTS idx_user_devices_last_used ON user_devices(last_used);
    
    -- Create push_notifications table
    CREATE TABLE IF NOT EXISTS push_notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id UUID REFERENCES user_devices(id),
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      data JSONB,
      priority VARCHAR(20) DEFAULT 'normal',
      status VARCHAR(50) DEFAULT 'pending',
      sent_at TIMESTAMP,
      delivered_at TIMESTAMP,
      clicked_at TIMESTAMP,
      error_message TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_push_notifications_user_id ON push_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_push_notifications_status ON push_notifications(status);
    CREATE INDEX IF NOT EXISTS idx_push_notifications_created_at ON push_notifications(created_at);
    
    -- Create invalid_tokens table
    CREATE TABLE IF NOT EXISTS invalid_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      token VARCHAR(255) NOT NULL,
      reason VARCHAR(100),
      invalidated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_invalid_tokens_token ON invalid_tokens(token);
    
    -- Create trigger for updated_at
    CREATE TRIGGER update_user_devices_updated_at 
      BEFORE UPDATE ON user_devices 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_user_devices_updated_at ON user_devices;
    DROP TABLE IF EXISTS invalid_tokens CASCADE;
    DROP TABLE IF EXISTS push_notifications CASCADE;
    DROP TABLE IF EXISTS user_devices CASCADE;
  `);
};