exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      location JSONB NOT NULL,
      address TEXT NOT NULL,
      zone VARCHAR(100),
      manager_name VARCHAR(255),
      manager_phone VARCHAR(20),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS inventory_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      warehouse_id UUID NOT NULL REFERENCES warehouses(id),
      name VARCHAR(255) NOT NULL,
      sku VARCHAR(100) UNIQUE,
      category VARCHAR(100),
      unit_price DECIMAL(10,2) NOT NULL,
      unit VARCHAR(20),
      quantity INTEGER DEFAULT 0,
      reserved_quantity INTEGER DEFAULT 0,
      reorder_level INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      item_id UUID NOT NULL REFERENCES inventory_items(id),
      quantity_change INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      reason TEXT,
      reference_id UUID,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_warehouses_zone ON warehouses(zone);
    CREATE INDEX idx_inventory_items_warehouse_id ON inventory_items(warehouse_id);
    CREATE INDEX idx_inventory_items_sku ON inventory_items(sku);
    CREATE INDEX idx_inventory_items_category ON inventory_items(category);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS inventory_transactions CASCADE;
    DROP TABLE IF EXISTS inventory_items CASCADE;
    DROP TABLE IF EXISTS warehouses CASCADE;
  `);
};