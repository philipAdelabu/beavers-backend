exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS fees_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) UNIQUE NOT NULL,
      onboarding_fee DECIMAL(12,2) DEFAULT 5000.00,
      onboarding_fee_is_active BOOLEAN DEFAULT TRUE,   
      monthly_fee DECIMAL(12,2) DEFAULT 1500.00,
      monthly_fee_is_active BOOLEAN DEFAULT TRUE, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    

    -- Insert main table
    INSERT INTO fees_settings (id, name, onboarding_fee_is_active, monthly_fee_is_active, created_at, updated_at) VALUES
      (uuid_generate_v4(), 'fee_configuration', false, true, NOW(), NOW());
    
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_fees_settings_updated_at ON fees_settings;
    DROP TABLE IF EXISTS FEES_SETTINGS CASCADE;
  `);
};
