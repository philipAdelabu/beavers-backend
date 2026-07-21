exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create zones table
    CREATE TABLE IF NOT EXISTS zones (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      description TEXT,
      coordinates JSONB NOT NULL,
      center_latitude DECIMAL(10,8),
      center_longitude DECIMAL(11,8),
      radius_km DECIMAL(5,2),
      is_active BOOLEAN DEFAULT TRUE,
      pricing_multiplier DECIMAL(3,2) DEFAULT 1.0,
      delivery_fee DECIMAL(10,2) DEFAULT 0,
      min_order_amount DECIMAL(10,2) DEFAULT 0,
      zone_code VARCHAR(20) UNIQUE,
      display_order INTEGER DEFAULT 0,
      created_by UUID REFERENCES users(id),
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_zones_name ON zones(name);
    CREATE INDEX IF NOT EXISTS idx_zones_is_active ON zones(is_active);
    CREATE INDEX IF NOT EXISTS idx_zones_zone_code ON zones(zone_code);
    CREATE INDEX IF NOT EXISTS idx_zones_display_order ON zones(display_order);
    
    -- Create trigger for updated_at
    CREATE TRIGGER update_zones_updated_at 
      BEFORE UPDATE ON zones 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    -- Insert default zones for Nigeria
    INSERT INTO zones (id, name, description, coordinates, zone_code, display_order, created_at, updated_at) VALUES
      (uuid_generate_v4(), 'Lagos Mainland', 'Mainland area of Lagos state', 
       '[{"lat": 6.5244, "lng": 3.3792}, {"lat": 6.6000, "lng": 3.4000}, {"lat": 6.5500, "lng": 3.4500}, {"lat": 6.5000, "lng": 3.3500}]',
       'LAG-MAIN', 1, NOW(), NOW()),
      
      (uuid_generate_v4(), 'Lagos Island', 'Island area of Lagos state',
       '[{"lat": 6.4500, "lng": 3.4000}, {"lat": 6.4800, "lng": 3.4300}, {"lat": 6.4400, "lng": 3.4200}, {"lat": 6.4300, "lng": 3.3900}]',
       'LAG-ISL', 2, NOW(), NOW()),
      
      (uuid_generate_v4(), 'Abuja', 'Federal Capital Territory',
       '[{"lat": 9.0765, "lng": 7.3986}, {"lat": 9.1000, "lng": 7.4500}, {"lat": 9.0500, "lng": 7.4200}, {"lat": 9.0800, "lng": 7.3800}]',
       'ABJ', 3, NOW(), NOW()),
      
      (uuid_generate_v4(), 'Port Harcourt', 'Rivers State capital',
       '[{"lat": 4.8156, "lng": 7.0498}, {"lat": 4.8500, "lng": 7.1000}, {"lat": 4.8000, "lng": 7.0800}, {"lat": 4.8200, "lng": 7.0300}]',
       'PHC', 4, NOW(), NOW()),
      
      (uuid_generate_v4(), 'Ibadan', 'Oyo State capital',
       '[{"lat": 7.3775, "lng": 3.9470}, {"lat": 7.4200, "lng": 3.9800}, {"lat": 7.3500, "lng": 3.9200}, {"lat": 7.3800, "lng": 3.9000}]',
       'IBD', 5, NOW(), NOW()),
      
      (uuid_generate_v4(), 'Kano', 'Kano State capital',
       '[{"lat": 12.0022, "lng": 8.5917}, {"lat": 12.0500, "lng": 8.6500}, {"lat": 11.9800, "lng": 8.6000}, {"lat": 12.0000, "lng": 8.5500}]',
       'KAN', 6, NOW(), NOW());
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_zones_updated_at ON zones;
    DROP TABLE IF EXISTS zones CASCADE;
  `);
};