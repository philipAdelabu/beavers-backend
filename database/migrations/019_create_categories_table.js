exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      required_certifications JSONB,
      billing_rules JSONB,
      icon VARCHAR(255),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS zones (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      coordinates JSONB NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      pricing_multiplier DECIMAL(3,2) DEFAULT 1.0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS system_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      category VARCHAR(100) NOT NULL,
      key VARCHAR(100) NOT NULL,
      value JSONB,
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category, key)
    );
    
    CREATE INDEX idx_categories_name ON categories(name);
    CREATE INDEX idx_zones_name ON zones(name);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS system_settings CASCADE;
    DROP TABLE IF EXISTS zones CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
  `);
};