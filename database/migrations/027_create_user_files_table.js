// database/migrations/027_create_user_files_table.js
exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS user_files (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_type VARCHAR(50) NOT NULL,
      file_path TEXT NOT NULL,
      file_name VARCHAR(255),
      file_size INTEGER,
      mime_type VARCHAR(100),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_files_file_type ON user_files(file_type);
    CREATE INDEX IF NOT EXISTS idx_user_files_created_at ON user_files(created_at);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS user_files CASCADE;
  `);
};
