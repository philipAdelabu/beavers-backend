exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS saved_artisans (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      client_id UUID NOT NULL REFERENCES users(id),
      artisan_id UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(client_id, artisan_id)
    );
    
    CREATE TABLE IF NOT EXISTS client_addresses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      client_id UUID NOT NULL REFERENCES users(id),
      address TEXT NOT NULL,
      label VARCHAR(100),
      is_default BOOLEAN DEFAULT FALSE,
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS artisan_tools (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id),
      name VARCHAR(255) NOT NULL,
      quantity INTEGER DEFAULT 1,
      condition VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS artisan_schedules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id),
      day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
      start_time TIME,
      end_time TIME,
      is_available BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(artisan_id, day_of_week)
    );
    
    CREATE INDEX idx_saved_artisans_client_id ON saved_artisans(client_id);
    CREATE INDEX idx_client_addresses_client_id ON client_addresses(client_id);
    CREATE INDEX idx_artisan_tools_artisan_id ON artisan_tools(artisan_id);
    CREATE INDEX idx_artisan_schedules_artisan_id ON artisan_schedules(artisan_id);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS artisan_schedules CASCADE;
    DROP TABLE IF EXISTS artisan_tools CASCADE;
    DROP TABLE IF EXISTS client_addresses CASCADE;
    DROP TABLE IF EXISTS saved_artisans CASCADE;
  `);
};