exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create admin_roles table
    CREATE TABLE IF NOT EXISTS admin_roles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(50) UNIQUE NOT NULL,
      description TEXT,
      permissions JSONB,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create admin_profiles table
    CREATE TABLE IF NOT EXISTS admin_profiles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id UUID REFERENCES admin_roles(id),
      full_name VARCHAR(255) NOT NULL,
      avatar_url TEXT,
      department VARCHAR(100),
      phone_extension VARCHAR(15),
      last_active TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create admin_activity_logs table
    CREATE TABLE IF NOT EXISTS admin_activity_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(200) NOT NULL,
      entity_type VARCHAR(50),
      entity_id UUID,
      details JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create admin_notifications table
    CREATE TABLE IF NOT EXISTS admin_notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      admin_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50),
      is_read BOOLEAN DEFAULT FALSE,
      read_at TIMESTAMP,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create system_configurations table
    CREATE TABLE IF NOT EXISTS system_configurations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      key VARCHAR(100) UNIQUE NOT NULL,
      value JSONB,
      description TEXT,
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create platform_statistics table for cached stats
    CREATE TABLE IF NOT EXISTS platform_statistics (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      stat_date DATE UNIQUE NOT NULL,
      metrics JSONB,
      calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Insert default admin roles
    INSERT INTO admin_roles (id, name, description, permissions, created_at, updated_at) VALUES
      (uuid_generate_v4(), 'super_admin', 'Full system access', '{"all": true}', NOW(), NOW()),
      (uuid_generate_v4(), 'admin', 'Standard admin access', '{"users": true, "jobs": true, "disputes": true, "reports": true}', NOW(), NOW()),
      (uuid_generate_v4(), 'support', 'Customer support access', '{"disputes": true, "users_view": true, "jobs_view": true}', NOW(), NOW()),
      (uuid_generate_v4(), 'finance', 'Financial operations access', '{"payments": true, "reports": true, "refunds": true}', NOW(), NOW()),
      (uuid_generate_v4(), 'verification', 'User verification access', '{"verifications": true}', NOW(), NOW());
    
    -- Insert system configurations
    INSERT INTO system_configurations (key, value, description) VALUES
      ('platform_fees', '{"base_fee": 2500, "diagnostics_rate": 500, "execution_rate": 1000, "commission_percent": 10}', 'Platform fee configuration'),
      ('notification_settings', '{"email_enabled": true, "sms_enabled": true, "push_enabled": true}', 'Notification settings'),
      ('job_settings', '{"offer_expiry_minutes": 2, "arrival_timeout_minutes": 30, "max_distance_km": 50}', 'Job configuration settings'),
      ('maintenance_mode', '{"enabled": false, "message": "System under maintenance"}', 'Maintenance mode settings');
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_admin_profiles_user_id ON admin_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_admin_profiles_role_id ON admin_profiles(role_id);
    CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id);
    CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_action ON admin_activity_logs(action);
    CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON admin_activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_id ON admin_notifications(admin_id);
    CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read ON admin_notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_platform_statistics_stat_date ON platform_statistics(stat_date);
    
    -- Create triggers for updated_at
    CREATE TRIGGER update_admin_roles_updated_at 
      BEFORE UPDATE ON admin_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_admin_profiles_updated_at 
      BEFORE UPDATE ON admin_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_system_configurations_updated_at 
      BEFORE UPDATE ON system_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_system_configurations_updated_at ON system_configurations;
    DROP TRIGGER IF EXISTS update_admin_profiles_updated_at ON admin_profiles;
    DROP TRIGGER IF EXISTS update_admin_roles_updated_at ON admin_roles;
    DROP TABLE IF EXISTS platform_statistics CASCADE;
    DROP TABLE IF EXISTS system_configurations CASCADE;
    DROP TABLE IF EXISTS admin_notifications CASCADE;
    DROP TABLE IF EXISTS admin_activity_logs CASCADE;
    DROP TABLE IF EXISTS admin_profiles CASCADE;
    DROP TABLE IF EXISTS admin_roles CASCADE;
  `);
};