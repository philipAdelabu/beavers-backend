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
    CREATE INDEX idx_subcategories_category_id ON subcategories(category_id);
    CREATE INDEX idx_subcategories_name ON subcategories(name);
    CREATE INDEX idx_subcategories_is_active ON subcategories(is_active);
    CREATE INDEX idx_subcategories_display_order ON subcategories(display_order);
    
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
    
    -- Painting subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Interior Painting',
      'Painting of interior walls and ceilings',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Painting';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Exterior Painting',
      'Painting of exterior walls and surfaces',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Painting';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Wallpaper Installation',
      'Installation and removal of wallpaper',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Painting';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Spray Painting',
      'Professional spray painting services',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Painting';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Decorative Painting',
      'Decorative and artistic painting',
      5,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Painting';
    
    -- Tiling subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Floor Tiling',
      'Installation of floor tiles',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Tiling';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Wall Tiling',
      'Installation of wall tiles',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Tiling';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Tile Repair',
      'Repair and replacement of damaged tiles',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Tiling';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Grouting',
      'Application and repair of grout',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Tiling';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Mosaic Installation',
      'Installation of mosaic tiles',
      5,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Tiling';
    
    -- HVAC subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'AC Installation',
      'Air conditioning installation',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'HVAC';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'AC Repair',
      'Air conditioning repair and maintenance',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'HVAC';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Refrigeration',
      'Refrigeration system installation and repair',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'HVAC';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Ventilation',
      'Ventilation system installation',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'HVAC';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Heating Systems',
      'Heating system installation and repair',
      5,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'HVAC';
    
    -- Generator Repair subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Generator Installation',
      'Generator installation and setup',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Generator Repair';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Generator Repair',
      'Generator repair and troubleshooting',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Generator Repair';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Generator Maintenance',
      'Regular generator maintenance services',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Generator Repair';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Automatic Transfer Switch',
      'Installation of automatic transfer switches',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Generator Repair';
    
    -- CCTV Installation subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'CCTV Camera Installation',
      'Installation of CCTV cameras',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'CCTV Installation';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'DVR/NVR Setup',
      'Configuration of DVR and NVR systems',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'CCTV Installation';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Remote Monitoring Setup',
      'Setup of remote monitoring access',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'CCTV Installation';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'CCTV Maintenance',
      'Maintenance and repair of CCTV systems',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'CCTV Installation';
    
    -- Appliance Repair subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Refrigerator Repair',
      'Repair of refrigerators and freezers',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Appliance Repair';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Washing Machine Repair',
      'Repair of washing machines and dryers',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Appliance Repair';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Oven and Cooker Repair',
      'Repair of ovens, cookers, and stoves',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Appliance Repair';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Microwave Repair',
      'Repair of microwave ovens',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Appliance Repair';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Dishwasher Repair',
      'Repair of dishwashers',
      5,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Appliance Repair';
    
    -- Landscaping subcategories
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Garden Design',
      'Professional garden design services',
      1,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Landscaping';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Lawn Maintenance',
      'Lawn mowing and maintenance',
      2,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Landscaping';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Tree Trimming',
      'Tree trimming and removal services',
      3,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Landscaping';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Irrigation Systems',
      'Installation of irrigation systems',
      4,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Landscaping';
    
    INSERT INTO subcategories (id, category_id, name, description, display_order, created_at, updated_at)
    SELECT 
      uuid_generate_v4(),
      c.id,
      'Pest Control',
      'Garden pest control services',
      5,
      NOW(),
      NOW()
    FROM categories c WHERE c.name = 'Landscaping';
    
    -- Create trigger for updated_at
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