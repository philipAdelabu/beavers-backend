const { v4: uuidv4 } = require('uuid');

/**
 * Seed warehouse locations
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  const warehouses = [
    {
      id: uuidv4(),
      name: 'Lagos Central Warehouse',
      location: JSON.stringify({ latitude: 6.5244, longitude: 3.3792 }),
      address: '123 Industrial Area, Ikeja, Lagos',
      zone: 'Lagos Mainland',
      manager_name: 'John Okonkwo',
      manager_phone: '+2348023456789',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Lagos Island Warehouse',
      location: JSON.stringify({ latitude: 6.4500, longitude: 3.4000 }),
      address: '45 Marina Road, Lagos Island, Lagos',
      zone: 'Lagos Island',
      manager_name: 'Adaobi Eze',
      manager_phone: '+2348034567890',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Abuja Central Warehouse',
      location: JSON.stringify({ latitude: 9.0765, longitude: 7.3986 }),
      address: '78 Garki Area, Abuja, FCT',
      zone: 'Abuja',
      manager_name: 'Ibrahim Musa',
      manager_phone: '+2348045678901',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Port Harcourt Warehouse',
      location: JSON.stringify({ latitude: 4.8156, longitude: 7.0498 }),
      address: '12 Trans Amadi, Port Harcourt, Rivers',
      zone: 'Port Harcourt',
            manager_name: 'Chidi Okoro',
      manager_phone: '+2348056789012',
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Ibadan Warehouse',
      location: JSON.stringify({ latitude: 7.3775, longitude: 3.9470 }),
      address: '34 Ring Road, Ibadan, Oyo',
      zone: 'Ibadan',
      manager_name: 'Funke Adeyemi',
      manager_phone: '+2348067890123',
      is_active: true
    }
  ];
  
  for (const warehouse of warehouses) {
    const existing = await queryInterface.query(
      `SELECT id FROM warehouses WHERE name = $1`,
      [warehouse.name]
    );
    
    if (existing.rows.length === 0) {
      await queryInterface.query(`
        INSERT INTO warehouses (id, name, location, address, zone, manager_name, manager_phone, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      `, [
        warehouse.id, warehouse.name, warehouse.location, warehouse.address,
        warehouse.zone, warehouse.manager_name, warehouse.manager_phone, warehouse.is_active
      ]);
      console.log(`Warehouse created: ${warehouse.name}`);
    } else {
      console.log(`Warehouse already exists: ${warehouse.name}`);
    }
  }
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`DELETE FROM warehouses WHERE name IN ('Lagos Central Warehouse', 'Lagos Island Warehouse', 'Abuja Central Warehouse', 'Port Harcourt Warehouse', 'Ibadan Warehouse')`);
  console.log('Warehouses removed');
};