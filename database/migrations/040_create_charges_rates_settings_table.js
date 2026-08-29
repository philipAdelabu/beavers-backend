exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS charges_rate_settings (

      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) UNIQUE NOT NULL,

      client_fee_rate DECIMAL(3,2)  DEFAULT 5,
      client_fee_rate_is_active BOOLEAN DEFAULT TRUE,  
      artisan_fee_rate DECIMAL(3,2)  DEFAULT 5,
      artisan_fee_rate_is_active BOOLEAN DEFAULT TRUE,  
      merchant_fee_rate DECIMAL(3,2)  DEFAULT 5,
      merchant_fee_rate_is_active BOOLEAN DEFAULT FALSE, 

      vat_fee_rate DECIMAL(3,2) DEFAULT 7.5,
      vat_fee_rate_is_active BOOLEAN DEFAULT TRUE, 

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Insert main table
    INSERT INTO charges_rate_settings (id, name, created_at, updated_at) VALUES
      (uuid_generate_v4(), 'charges_fee_rate_configuration', NOW(), NOW());
    
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_charges_rate_settings_updated_at ON charges_rate_settings;
    DROP TABLE IF EXISTS CHARGES_RATE_SETTINGS CASCADE;
  `);
};
