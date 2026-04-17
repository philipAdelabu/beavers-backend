const { v4: uuidv4 } = require('uuid');

/**
 * Seed inventory items for warehouses
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  // Get warehouse IDs
  const warehouses = await queryInterface.query(`
    SELECT id, name FROM warehouses WHERE is_active = true
  `);
  
  const lagosWarehouse = warehouses.rows.find(w => w.name === 'Lagos Central Warehouse');
  const abujaWarehouse = warehouses.rows.find(w => w.name === 'Abuja Central Warehouse');
  const phWarehouse = warehouses.rows.find(w => w.name === 'Port Harcourt Warehouse');
  
  const inventoryItems = [
    // Plumbing items
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'PVC Pipe 1 inch',
      sku: 'PVC-PIPE-1IN',
      category: 'plumbing',
      unit_price: 1500,
      unit: 'meter',
      quantity: 1000,
      reorder_level: 100,
      is_active: true
    },
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'PVC Pipe 2 inch',
      sku: 'PVC-PIPE-2IN',
      category: 'plumbing',
      unit_price: 2500,
      unit: 'meter',
      quantity: 800,
      reorder_level: 80,
      is_active: true
    },
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'Pipe Fittings Set',
      sku: 'PIPE-FITTINGS',
      category: 'plumbing',
      unit_price: 500,
      unit: 'set',
      quantity: 2000,
      reorder_level: 200,
      is_active: true
    },
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'Water Heater 50L',
      sku: 'WATER-HEATER-50L',
      category: 'plumbing',
      unit_price: 45000,
      unit: 'unit',
      quantity: 50,
      reorder_level: 10,
      is_active: true
    },
    // Electrical items
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'Electrical Wire 2.5mm',
      sku: 'WIRE-2.5MM',
      category: 'electrical',
      unit_price: 800,
      unit: 'meter',
      quantity: 5000,
      reorder_level: 500,
      is_active: true
    },
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'Circuit Breaker 20A',
      sku: 'BREAKER-20A',
      category: 'electrical',
      unit_price: 3500,
      unit: 'unit',
      quantity: 300,
      reorder_level: 50,
      is_active: true
    },
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'LED Bulb 10W',
      sku: 'LED-BULB-10W',
      category: 'electrical',
      unit_price: 1200,
      unit: 'unit',
      quantity: 1000,
      reorder_level: 100,
      is_active: true
    },
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'Electrical Socket',
      sku: 'SOCKET-13A',
      category: 'electrical',
      unit_price: 800,
      unit: 'unit',
      quantity: 800,
      reorder_level: 100,
      is_active: true
    },
    // Painting items
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'Paint (White) 4L',
      sku: 'PAINT-WHITE-4L',
      category: 'painting',
      unit_price: 4500,
      unit: 'bucket',
      quantity: 200,
      reorder_level: 30,
      is_active: true
    },
    {
      id: uuidv4(),
      warehouse_id: lagosWarehouse?.id,
      name: 'Paint Roller Set',
      sku: 'PAINT-ROLLER',
      category: 'painting',
      unit_price: 1500,
      unit: 'set',
      quantity: 150,
      reorder_level: 20,
      is_active: true
    },
    // Abuja warehouse items
    {
      id: uuidv4(),
      warehouse_id: abujaWarehouse?.id,
      name: 'PVC Pipe 1 inch',
      sku: 'PVC-PIPE-1IN-ABJ',
      category: 'plumbing',
      unit_price: 1600,
      unit: 'meter',
      quantity: 600,
      reorder_level: 80,
      is_active: true
    },
    {
      id: uuidv4(),
      warehouse_id: abujaWarehouse?.id,
      name: 'Electrical Wire 2.5mm',
      sku: 'WIRE-2.5MM-ABJ',
      category: 'electrical',
      unit_price: 850,
      unit: 'meter',
      quantity: 3000,
      reorder_level: 300,
      is_active: true
    },
    // Port Harcourt warehouse items
    {
      id: uuidv4(),
      warehouse_id: phWarehouse?.id,
      name: 'PVC Pipe 1 inch',
      sku: 'PVC-PIPE-1IN-PH',
      category: 'plumbing',
      unit_price: 1550,
      unit: 'meter',
      quantity: 500,
      reorder_level: 60,
      is_active: true
    },
    {
      id: uuidv4(),
      warehouse_id: phWarehouse?.id,
      name: 'Circuit Breaker 20A',
      sku: 'BREAKER-20A-PH',
      category: 'electrical',
      unit_price: 3600,
      unit: 'unit',
      quantity: 150,
      reorder_level: 30,
      is_active: true
    }
  ];
  
  for (const item of inventoryItems) {
    if (!item.warehouse_id) continue;
    
    const existing = await queryInterface.query(
      `SELECT id FROM inventory_items WHERE sku = $1`,
      [item.sku]
    );
    
    if (existing.rows.length === 0) {
      await queryInterface.query(`
        INSERT INTO inventory_items (id, warehouse_id, name, sku, category, unit_price, unit, quantity, reorder_level, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      `, [
        item.id, item.warehouse_id, item.name, item.sku, item.category,
        item.unit_price, item.unit, item.quantity, item.reorder_level, item.is_active
      ]);
      console.log(`Inventory item created: ${item.name} (${item.sku})`);
    } else {
      console.log(`Inventory item already exists: ${item.sku}`);
    }
  }
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`DELETE FROM inventory_items WHERE sku LIKE '%-%'`);
  console.log('Inventory items removed');
};