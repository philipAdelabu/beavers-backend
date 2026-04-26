// database/migrations/028_add_last_logout_to_users.js
exports.up = async (queryInterface) => {
  await queryInterface.query(`
    
    CREATE TABLE IF NOT EXISTS user_activity_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL,
      metadata JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action ON user_activity_logs(action);
    CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS user_activity_logs CASCADE;
    ALTER TABLE users DROP COLUMN IF EXISTS last_logout;
  `);
};