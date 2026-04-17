const { v4: uuidv4 } = require('uuid');

/**
 * Seed training courses for artisans
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  const courses = [
    {
      id: uuidv4(),
      name: 'Advanced Plumbing Techniques',
      description: 'Master advanced plumbing techniques including pipe fitting, leak detection, and water heater installation',
      tier_level: 2,
      duration_hours: 40,
      modules: JSON.stringify([
        { name: 'Safety Protocols', duration: 4 },
        { name: 'Pipe Fitting', duration: 12 },
        { name: 'Leak Detection', duration: 8 },
        { name: 'Water Heater Installation', duration: 8 },
        { name: 'Final Assessment', duration: 8 }
      ]),
      price: 25000,
      certification_provided: true,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Electrical Wiring Certification',
      description: 'Comprehensive electrical wiring course covering residential and commercial installations',
      tier_level: 2,
      duration_hours: 50,
      modules: JSON.stringify([
        { name: 'Electrical Safety', duration: 8 },
        { name: 'Wiring Basics', duration: 12 },
        { name: 'Circuit Breakers', duration: 10 },
        { name: 'Lighting Installation', duration: 10 },
        { name: 'Final Practical Exam', duration: 10 }
      ]),
      price: 30000,
      certification_provided: true,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Professional Carpentry',
      description: 'Advanced carpentry skills for furniture making, cabinetry, and finishing',
      tier_level: 2,
      duration_hours: 60,
      modules: JSON.stringify([
        { name: 'Wood Types & Tools', duration: 10 },
        { name: 'Joinery Techniques', duration: 15 },
        { name: 'Furniture Making', duration: 20 },
        { name: 'Finishing & Polishing', duration: 10 },
        { name: 'Project Assessment', duration: 5 }
      ]),
      price: 35000,
      certification_provided: true,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'HVAC Master Class',
      description: 'Complete HVAC training for air conditioning and refrigeration systems',
      tier_level: 3,
      duration_hours: 80,
      modules: JSON.stringify([
        { name: 'HVAC Fundamentals', duration: 15 },
        { name: 'Refrigeration Cycle', duration: 15 },
        { name: 'Installation Techniques', duration: 20 },
        { name: 'Troubleshooting', duration: 15 },
        { name: 'Maintenance & Repair', duration: 15 }
      ]),
      price: 50000,
      certification_provided: true,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Solar Panel Installation',
      description: 'Learn to install and maintain solar power systems for residential and commercial use',
      tier_level: 3,
      duration_hours: 40,
      modules: JSON.stringify([
        { name: 'Solar Energy Basics', duration: 8 },
        { name: 'Panel Installation', duration: 12 },
        { name: 'Inverter Setup', duration: 8 },
        { name: 'Battery Systems', duration: 8 },
        { name: 'Maintenance', duration: 4 }
      ]),
      price: 40000,
      certification_provided: true,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'CCTV & Security Systems',
      description: 'Professional training for CCTV installation, configuration, and maintenance',
      tier_level: 2,
      duration_hours: 35,
      modules: JSON.stringify([
        { name: 'Security Systems Overview', duration: 5 },
        { name: 'Camera Installation', duration: 10 },
        { name: 'DVR/NVR Configuration', duration: 10 },
        { name: 'Remote Access Setup', duration: 5 },
        { name: 'Troubleshooting', duration: 5 }
      ]),
      price: 25000,
      certification_provided: true,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Customer Service Excellence',
      description: 'Essential customer service skills for artisans to build trust and get better ratings',
      tier_level: 1,
      duration_hours: 15,
      modules: JSON.stringify([
        { name: 'Communication Skills', duration: 5 },
        { name: 'Conflict Resolution', duration: 5 },
        { name: 'Professional Conduct', duration: 5 }
      ]),
      price: 10000,
      certification_provided: false,
      is_active: true
    }
  ];
  
  for (const course of courses) {
    const existing = await queryInterface.query(
      `SELECT id FROM training_courses WHERE name = $1`,
      [course.name]
    );
    
    if (existing.rows.length === 0) {
      await queryInterface.query(`
        INSERT INTO training_courses (id, name, description, tier_level, duration_hours, modules, price, certification_provided, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `, [
        course.id, course.name, course.description, course.tier_level,
        course.duration_hours, course.modules, course.price,
        course.certification_provided, course.is_active
      ]);
      console.log(`Training course created: ${course.name}`);
    } else {
      console.log(`Training course already exists: ${course.name}`);
    }
  }
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`DELETE FROM training_courses WHERE name IN ('Advanced Plumbing Techniques', 'Electrical Wiring Certification', 'Professional Carpentry', 'HVAC Master Class', 'Solar Panel Installation', 'CCTV & Security Systems', 'Customer Service Excellence')`);
  console.log('Training courses removed');
};