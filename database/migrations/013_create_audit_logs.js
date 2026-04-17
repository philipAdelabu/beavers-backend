exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type VARCHAR(100),
      entity_id UUID,
      action VARCHAR(100),
      user_id UUID REFERENCES users(id),
      old_data JSONB,
      new_data JSONB,
      ip_address INET,
      user_agent TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS login_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id),
      ip_address INET,
      user_agent TEXT,
      success BOOLEAN,
      login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS failed_logins (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255),
      ip_address INET,
      attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX idx_login_history_user_id ON login_history(user_id);
    CREATE INDEX idx_failed_logins_email ON failed_logins(email);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS failed_logins CASCADE;
    DROP TABLE IF EXISTS login_history CASCADE;
    DROP TABLE IF EXISTS audit_logs CASCADE;
  `);
};