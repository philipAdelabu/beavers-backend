exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Add soft delete columns to existing tables
    ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    ALTER TABLE artisan_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    
    -- Create indexes for soft delete queries
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at ON jobs(deleted_at);
    
    -- Create function to automatically update updated_at
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
    
    -- Create triggers for updated_at
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_artisan_profiles_updated_at BEFORE UPDATE ON artisan_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_client_profiles_updated_at BEFORE UPDATE ON client_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_bill_of_quantities_updated_at BEFORE UPDATE ON bill_of_quantities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_job_billing_updated_at BEFORE UPDATE ON job_billing FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
    DROP TRIGGER IF EXISTS update_artisan_profiles_updated_at ON artisan_profiles;
    DROP TRIGGER IF EXISTS update_client_profiles_updated_at ON client_profiles;
    DROP TRIGGER IF EXISTS update_bill_of_quantities_updated_at ON bill_of_quantities;
    DROP TRIGGER IF EXISTS update_job_billing_updated_at ON job_billing;
    DROP TRIGGER IF EXISTS update_payment_intents_updated_at ON payment_intents;
    DROP TRIGGER IF EXISTS update_warehouses_updated_at ON warehouses;
    DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON inventory_items;
    DROP TRIGGER IF EXISTS update_disputes_updated_at ON disputes;
    DROP TRIGGER IF EXISTS update_updated_at_column;
    
    ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
    ALTER TABLE jobs DROP COLUMN IF EXISTS deleted_at;
    ALTER TABLE artisan_profiles DROP COLUMN IF EXISTS deleted_at;
    ALTER TABLE client_profiles DROP COLUMN IF EXISTS deleted_at;
  `);
};