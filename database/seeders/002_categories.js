const { v4: uuidv4 } = require('uuid');

/**
 * Seed artisan categories
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  const categories = [
    {
      id: uuidv4(),
      name: 'Plumbing',
      description: 'Professional plumbing services including repairs, installations, and maintenance',
      required_certifications: JSON.stringify(['Plumbing Certification', 'Trade Test']),
      billing_rules: JSON.stringify({ default_mode: 'time_based', requires_boq: true }),
      icon: 'plumbing-icon.png',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Electrical',
      description: 'Electrical installations, repairs, wiring, and maintenance',
      required_certifications: JSON.stringify(['Electrical License', 'Trade Test']),
      billing_rules: JSON.stringify({ default_mode: 'time_based', requires_boq: true }),
      icon: 'electrical-icon.png',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Carpentry',
      description: 'Carpentry and woodworking services including furniture making and repairs',
      required_certifications: JSON.stringify(['Carpentry Certification']),
      billing_rules: JSON.stringify({ default_mode: 'quoted', requires_boq: true }),
      icon: 'carpentry-icon.png',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Painting',
      description: 'Interior and exterior painting, wallpaper installation, and decoration',
      required_certifications: JSON.stringify([]),
      billing_rules: JSON.stringify({ default_mode: 'quoted', requires_boq: true }),
      icon: 'painting-icon.png',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Tiling',
      description: 'Floor and wall tiling services for residential and commercial properties',
      required_certifications: JSON.stringify([]),
      billing_rules: JSON.stringify({ default_mode: 'quoted', requires_boq: true }),
      icon: 'tiling-icon.png',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'HVAC',
      description: 'Heating, ventilation, and air conditioning services',
      required_certifications: JSON.stringify(['HVAC Certification']),
      billing_rules: JSON.stringify({ default_mode: 'time_based', requires_boq: true }),
      icon: 'hvac-icon.png',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Generator Repair',
      description: 'Generator installation, repair, and maintenance services',
      required_certifications: JSON.stringify(['Generator Technician Certification']),
      billing_rules: JSON.stringify({ default_mode: 'time_based', requires_boq: true }),
      icon: 'generator-icon.png',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'CCTV Installation',
      description: 'CCTV camera installation, configuration, and maintenance',
      required_certifications: JSON.stringify(['Security Systems Certification']),
      billing_rules: JSON.stringify({ default_mode: 'quoted', requires_boq: true }),
      icon: 'cctv-icon.png',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Appliance Repair',
      description: 'Repair and maintenance of home and office appliances',
      required_certifications: JSON.stringify([]),
      billing_rules: JSON.stringify({ default_mode: 'time_based', requires_boq: false }),
      icon: 'appliance-icon.png',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Landscaping',
      description: 'Garden and landscape design, maintenance, and installation',
      required_certifications: JSON.stringify([]),
      billing_rules: JSON.stringify({ default_mode: 'quoted', requires_boq: true }),
      icon: 'landscaping-icon.png',
      is_active: true
    }
  ];
  
  for (const category of categories) {
    const existing = await queryInterface.query(
      `SELECT id FROM categories WHERE name = $1`,
      [category.name]
    );
    
    if (existing.rows.length === 0) {
      await queryInterface.query(`
        INSERT INTO categories (id, name, description, required_certifications, billing_rules, icon, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      `, [
        category.id, category.name, category.description,
        category.required_certifications, category.billing_rules,
        category.icon, category.is_active
      ]);
      console.log(`Category created: ${category.name}`);
    } else {
      console.log(`Category already exists: ${category.name}`);
    }
  }
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`DELETE FROM categories WHERE name IN ('Plumbing', 'Electrical', 'Carpentry', 'Painting', 'Tiling', 'HVAC', 'Generator Repair', 'CCTV Installation', 'Appliance Repair', 'Landscaping')`);
  console.log('Categories removed');
};