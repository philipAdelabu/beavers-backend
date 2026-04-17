const { v4: uuidv4 } = require('uuid');

/**
 * Seed service zones
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  const zones = [
    {
      id: uuidv4(),
      name: 'Lagos Mainland',
      coordinates: JSON.stringify([
        { lat: 6.5244, lng: 3.3792 },
        { lat: 6.6000, lng: 3.4000 },
        { lat: 6.5500, lng: 3.4500 },
        { lat: 6.5000, lng: 3.3500 }
      ]),
      is_active: true,
      pricing_multiplier: 1.0
    },
    {
      id: uuidv4(),
      name: 'Lagos Island',
      coordinates: JSON.stringify([
        { lat: 6.4500, lng: 3.4000 },
        { lat: 6.4800, lng: 3.4300 },
        { lat: 6.4400, lng: 3.4200 },
        { lat: 6.4300, lng: 3.3900 }
      ]),
      is_active: true,
      pricing_multiplier: 1.2
    },
    {
      id: uuidv4(),
      name: 'Abuja',
      coordinates: JSON.stringify([
        { lat: 9.0765, lng: 7.3986 },
        { lat: 9.1000, lng: 7.4500 },
        { lat: 9.0500, lng: 7.4200 },
        { lat: 9.0800, lng: 7.3800 }
      ]),
      is_active: true,
      pricing_multiplier: 1.1
    },
    {
      id: uuidv4(),
      name: 'Port Harcourt',
      coordinates: JSON.stringify([
        { lat: 4.8156, lng: 7.0498 },
        { lat: 4.8500, lng: 7.1000 },
        { lat: 4.8000, lng: 7.0800 },
        { lat: 4.8200, lng: 7.0300 }
      ]),
      is_active: true,
      pricing_multiplier: 1.0
    },
    {
      id: uuidv4(),
      name: 'Ibadan',
      coordinates: JSON.stringify([
        { lat: 7.3775, lng: 3.9470 },
        { lat: 7.4200, lng: 3.9800 },
        { lat: 7.3500, lng: 3.9200 },
        { lat: 7.3800, lng: 3.9000 }
      ]),
      is_active: true,
      pricing_multiplier: 0.95
    },
    {
      id: uuidv4(),
      name: 'Kano',
      coordinates: JSON.stringify([
        { lat: 12.0022, lng: 8.5917 },
        { lat: 12.0500, lng: 8.6500 },
        { lat: 11.9800, lng: 8.6000 },
        { lat: 12.0000, lng: 8.5500 }
      ]),
      is_active: true,
      pricing_multiplier: 0.95
    }
  ];
  
  for (const zone of zones) {
    const existing = await queryInterface.query(
      `SELECT id FROM zones WHERE name = $1`,
      [zone.name]
    );
    
    if (existing.rows.length === 0) {
      await queryInterface.query(`
        INSERT INTO zones (id, name, coordinates, is_active, pricing_multiplier, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `, [zone.id, zone.name, zone.coordinates, zone.is_active, zone.pricing_multiplier]);
      console.log(`Zone created: ${zone.name}`);
    } else {
      console.log(`Zone already exists: ${zone.name}`);
    }
  }
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`DELETE FROM zones WHERE name IN ('Lagos Mainland', 'Lagos Island', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano')`);
  console.log('Zones removed');
};