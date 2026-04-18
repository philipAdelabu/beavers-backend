exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create subcategories table
    CREATE TABLE IF NOT EXISTS subcategories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      icon VARCHAR(255),
      required_certifications JSONB,
      is_active BOOLEAN DEFAULT TRUE,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, name)
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id);
    CREATE INDEX IF NOT EXISTS idx_subcategories_name ON subcategories(name);
    CREATE INDEX IF NOT EXISTS idx_subcategories_is_active ON subcategories(is_active);
    CREATE INDEX IF NOT EXISTS idx_subcategories_display_order ON subcategories(display_order);
    
    -- Insert subcategories for existing categories
    -- Plumbing subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Pipe Fitting',
      'Installation and repair of pipes and fittings',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Plumbing';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Water Heater Installation',
      'Installation and maintenance of water heaters',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Plumbing';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Leak Detection',
      'Professional leak detection and repair services',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Plumbing';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Drain Cleaning',
      'Clearing clogged drains and sewer lines',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Plumbing';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Bathroom Installation',
      'Complete bathroom fixture installation',
      5,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Plumbing';
    
    -- Electrical subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Wiring',
      'Electrical wiring for residential and commercial buildings',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Electrical';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Lighting Installation',
      'Installation of lighting fixtures and systems',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Electrical';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Circuit Breaker',
      'Installation and repair of circuit breakers',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Electrical';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Generator Installation',
      'Installation and connection of generators',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Electrical';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Electrical Panel Upgrade',
      'Upgrading electrical panels and systems',
      5,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Electrical';
    
    -- Carpentry subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Furniture Making',
      'Custom furniture design and construction',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Carpentry';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Cabinet Installation',
      'Kitchen and bathroom cabinet installation',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Carpentry';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Door and Window Fitting',
      'Installation and repair of doors and windows',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Carpentry';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Flooring Installation',
      'Wood and laminate flooring installation',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Carpentry';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Furniture Repair',
      'Repair and restoration of furniture',
      5,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Carpentry';
    
    -- Create trigger for subcategories table
    CREATE TRIGGER update_subcategories_updated_at 
      BEFORE UPDATE ON subcategories 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_subcategories_updated_at ON subcategories;
    DROP TABLE IF EXISTS subcategories CASCADE;
  `);
};