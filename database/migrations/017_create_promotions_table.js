exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS promotions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      code VARCHAR(100) UNIQUE,
      type VARCHAR(50) CHECK (type IN ('percentage', 'fixed')),
      value DECIMAL(10,2) NOT NULL,
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      max_uses INTEGER,
      used_count INTEGER DEFAULT 0,
      user_type VARCHAR(20),
      is_new_users_only BOOLEAN DEFAULT FALSE,
      min_spend DECIMAL(10,2),
      max_discount DECIMAL(10,2),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS promotion_usage (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      promotion_id UUID NOT NULL REFERENCES promotions(id),
      user_id UUID NOT NULL REFERENCES users(id),
      job_id UUID REFERENCES jobs(id),
      discount_amount DECIMAL(10,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_promotions_code ON promotions(code);
    CREATE INDEX idx_promotions_is_active ON promotions(is_active);
    CREATE INDEX idx_promotion_usage_user_id ON promotion_usage(user_id);
    CREATE INDEX idx_promotion_usage_promotion_id ON promotion_usage(promotion_id);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS promotion_usage CASCADE;
    DROP TABLE IF EXISTS promotions CASCADE;
  `);
};