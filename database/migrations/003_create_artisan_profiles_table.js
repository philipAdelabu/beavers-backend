exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS artisan_profiles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_legal_name VARCHAR(255) NOT NULL,
      nin VARCHAR(50) NOT NULL,
      passport_photo_url TEXT,
      residential_address TEXT NOT NULL,
      skill_category VARCHAR(100) NOT NULL,
      sub_categories TEXT[],
      tier_level INTEGER DEFAULT 1 CHECK (tier_level IN (1, 2, 3)),
      star_rating DECIMAL(3,2) DEFAULT 0,
      total_ratings INTEGER DEFAULT 0,
      completion_rate DECIMAL(5,2) DEFAULT 0,
      trust_score INTEGER DEFAULT 0,
      onboarding_fee_paid BOOLEAN DEFAULT FALSE,
      monthly_fee_status VARCHAR(20) DEFAULT 'pending',
      last_fee_payment TIMESTAMP,
      is_available BOOLEAN DEFAULT FALSE,
      current_location JSONB,
      documents JSONB,
      bank_details JSONB,
      stripe_customer_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      subscription_status VARCHAR(50),
      last_location_update TIMESTAMP,
      last_availability_change TIMESTAMP,
      last_seen TIMESTAMP,
      tier_updated_at TIMESTAMP,
      tier_update_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_artisan_profiles_user_id ON artisan_profiles(user_id);
    CREATE INDEX idx_artisan_profiles_skill_category ON artisan_profiles(skill_category);
    CREATE INDEX idx_artisan_profiles_tier_level ON artisan_profiles(tier_level);
    CREATE INDEX idx_artisan_profiles_star_rating ON artisan_profiles(star_rating);
    CREATE INDEX idx_artisan_profiles_is_available ON artisan_profiles(is_available);
    CREATE INDEX idx_artisan_profiles_monthly_fee_status ON artisan_profiles(monthly_fee_status);
    CREATE INDEX idx_artisan_profiles_current_location ON artisan_profiles USING GIST (current_location);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS artisan_profiles CASCADE;
  `);
};