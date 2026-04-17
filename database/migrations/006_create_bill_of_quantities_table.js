exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS bill_of_quantities (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      artisan_id UUID NOT NULL REFERENCES users(id),
      items JSONB NOT NULL,
      total_materials_cost DECIMAL(10,2) DEFAULT 0,
      total_workmanship_cost DECIMAL(10,2) DEFAULT 0,
      notes TEXT,
      version INTEGER DEFAULT 1,
      status VARCHAR(50) DEFAULT 'draft',
      client_approved BOOLEAN DEFAULT FALSE,
      admin_approved BOOLEAN DEFAULT FALSE,
      rejection_reason TEXT,
      client_approved_at TIMESTAMP,
      admin_approved_at TIMESTAMP,
      submitted_at TIMESTAMP,
      rejected_at TIMESTAMP,
      admin_id UUID REFERENCES users(id),
      delivery_status VARCHAR(50),
      delivered_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_boq_job_id ON bill_of_quantities(job_id);
    CREATE INDEX idx_boq_artisan_id ON bill_of_quantities(artisan_id);
    CREATE INDEX idx_boq_status ON bill_of_quantities(status);
    CREATE INDEX idx_boq_version ON bill_of_quantities(job_id, version);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS bill_of_quantities CASCADE;
  `);
};