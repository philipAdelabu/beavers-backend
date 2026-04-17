exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS dispatch_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      boq_id UUID NOT NULL REFERENCES bill_of_quantities(id),
      warehouse_id UUID NOT NULL REFERENCES warehouses(id),
      items JSONB NOT NULL,
      delivery_address TEXT NOT NULL,
      client_id UUID NOT NULL REFERENCES users(id),
      job_id UUID NOT NULL REFERENCES jobs(id),
      status VARCHAR(50) DEFAULT 'pending',
      priority VARCHAR(20) DEFAULT 'normal',
      rider_name VARCHAR(255),
      rider_phone VARCHAR(20),
      rider_id UUID REFERENCES users(id),
      tracking_url TEXT,
      current_location JSONB,
      estimated_delivery_time INTEGER,
      delivery_photo TEXT,
      delivery_signature TEXT,
      received_by VARCHAR(255),
      cancellation_reason TEXT,
      cancelled_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      assigned_at TIMESTAMP,
      started_at TIMESTAMP,
      delivered_at TIMESTAMP,
      cancelled_at TIMESTAMP,
      last_location_update TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS inventory_reservations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      dispatch_id UUID NOT NULL REFERENCES dispatch_requests(id),
      item_id UUID NOT NULL REFERENCES inventory_items(id),
      quantity INTEGER NOT NULL,
      status VARCHAR(50) DEFAULT 'reserved',
      reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      delivered_at TIMESTAMP,
      cancelled_at TIMESTAMP
    );
    
    CREATE INDEX idx_dispatch_requests_boq_id ON dispatch_requests(boq_id);
    CREATE INDEX idx_dispatch_requests_warehouse_id ON dispatch_requests(warehouse_id);
    CREATE INDEX idx_dispatch_requests_job_id ON dispatch_requests(job_id);
    CREATE INDEX idx_dispatch_requests_status ON dispatch_requests(status);
    CREATE INDEX idx_inventory_reservations_dispatch_id ON inventory_reservations(dispatch_id);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS inventory_reservations CASCADE;
    DROP TABLE IF EXISTS dispatch_requests CASCADE;
  `);
};