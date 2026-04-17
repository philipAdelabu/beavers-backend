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
      display_order INTEGER DEFAULT 0,
      parent_category_id UUID REFERENCES categories(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_categories_name ON categories(name);
    CREATE INDEX idx_categories_is_active ON categories(is_active);
    CREATE INDEX idx_categories_display_order ON categories(display_order);
    CREATE INDEX idx_categories_parent_category ON categories(parent_category_id);
    
    -- Insert main categories
    INSERT INTO categories (id, name, description, display_order, created_at, updated_at) VALUES
      (uuid_generate_v4(), 'Plumbing', 'Professional plumbing services including repairs, installations, and maintenance', 1, NOW(), NOW()),
      (uuid_generate_v4(), 'Electrical', 'Electrical installations, repairs, wiring, and maintenance', 2, NOW(), NOW()),
      (uuid_generate_v4(), 'Carpentry', 'Carpentry and woodworking services including furniture making and repairs', 3, NOW(), NOW()),
      (uuid_generate_v4(), 'Painting', 'Interior and exterior painting, wallpaper installation, and decoration', 4, NOW(), NOW()),
      (uuid_generate_v4(), 'Tiling', 'Floor and wall tiling services for residential and commercial properties', 5, NOW(), NOW()),
      (uuid_generate_v4(), 'HVAC', 'Heating, ventilation, and air conditioning services', 6, NOW(), NOW()),
      (uuid_generate_v4(), 'Generator Repair', 'Generator installation, repair, and maintenance services', 7, NOW(), NOW()),
      (uuid_generate_v4(), 'CCTV Installation', 'CCTV camera installation, configuration, and maintenance', 8, NOW(), NOW()),
      (uuid_generate_v4(), 'Appliance Repair', 'Repair and maintenance of home and office appliances', 9, NOW(), NOW()),
      (uuid_generate_v4(), 'Landscaping', 'Garden and landscape design, maintenance, and installation', 10, NOW(), NOW());
    
    -- Create trigger for updated_at
    CREATE TRIGGER update_categories_updated_at 
      BEFORE UPDATE ON categories 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
    DROP TABLE IF EXISTS categories CASCADE;
  `);
};