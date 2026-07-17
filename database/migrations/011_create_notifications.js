exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50),
      title VARCHAR(255),
      message TEXT,
      data JSONB,
      channel VARCHAR(20),
      is_read BOOLEAN DEFAULT FALSE,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email_enabled BOOLEAN DEFAULT TRUE,
      sms_enabled BOOLEAN DEFAULT TRUE,
      push_enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS user_devices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fcm_token VARCHAR(255) UNIQUE NOT NULL,
      device_info JSONB,
      is_active BOOLEAN DEFAULT TRUE,
      last_used TIMESTAMP,
      unregistered_at TIMESTAMP,
      invalidated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX idx_notifications_is_read ON notifications(is_read);
    CREATE INDEX idx_notifications_created_at ON notifications(created_at);
    CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
    CREATE INDEX idx_user_devices_fcm_token ON user_devices(fcm_token);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS user_devices CASCADE;
    DROP TABLE IF EXISTS notification_preferences CASCADE;
    DROP TABLE IF EXISTS notifications CASCADE;
  `);
};