// config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    // Create tables
    await client.query(`
      -- Users table (clients and artisans)
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('client', 'artisan', 'admin')),
        is_verified BOOLEAN DEFAULT FALSE,
        verification_status VARCHAR(20) DEFAULT 'pending',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Client profiles
      CREATE TABLE IF NOT EXISTS client_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        full_legal_name VARCHAR(255) NOT NULL,
        nin VARCHAR(50) NOT NULL,
        street_address TEXT NOT NULL,
        service_address TEXT NOT NULL,
        verification_documents JSONB,
        re_verification_needed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Artisan profiles
      CREATE TABLE IF NOT EXISTS artisan_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        full_legal_name VARCHAR(255) NOT NULL,
        nin VARCHAR(50) NOT NULL,
        passport_photo_url TEXT,
        residential_address TEXT NOT NULL,
        skill_category VARCHAR(100) NOT NULL,
        sub_categories TEXT[],
        tier_level INTEGER DEFAULT 1 CHECK (tier_level IN (1, 2, 3)),
        star_rating DECIMAL(3,2) DEFAULT 0,
        total_ratings INTEGER DEFAULT 0,
        completion_rate DECIMAL(5,2) DEFAULT 0,
        onboarding_fee_paid BOOLEAN DEFAULT FALSE,
        monthly_fee_status VARCHAR(20) DEFAULT 'pending',
        is_available BOOLEAN DEFAULT FALSE,
        current_location JSONB,
        trust_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Jobs table
      CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES users(id),
        artisan_id UUID REFERENCES users(id),
        category VARCHAR(100) NOT NULL,
        description TEXT,
        media_urls TEXT[],
        service_type VARCHAR(50) CHECK (service_type IN ('inspection', 'repair', 'installation', 'emergency')),
        job_status VARCHAR(50) DEFAULT 'pending',
        billing_mode VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Job billing
      CREATE TABLE IF NOT EXISTS job_billing (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
        base_fee DECIMAL(10,2),
        diagnostics_fee DECIMAL(10,2),
        execution_fee DECIMAL(10,2),
        materials_cost DECIMAL(10,2),
        workmanship_cost DECIMAL(10,2),
        total_amount DECIMAL(10,2),
        billing_status VARCHAR(50) DEFAULT 'pending',
        escrow_hold_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Bill of Quantities
      CREATE TABLE IF NOT EXISTS bill_of_quantities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
        artisan_id UUID REFERENCES users(id),
        items JSONB NOT NULL,
        total_materials_cost DECIMAL(10,2),
        total_workmanship_cost DECIMAL(10,2),
        status VARCHAR(50) DEFAULT 'draft',
        client_approved BOOLEAN DEFAULT FALSE,
        admin_approved BOOLEAN DEFAULT FALSE,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Warehouse and inventory
      CREATE TABLE IF NOT EXISTS warehouses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        location JSONB NOT NULL,
        address TEXT NOT NULL,
        zone VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Dispatch requests
      CREATE TABLE IF NOT EXISTS dispatch_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        boq_id UUID REFERENCES bill_of_quantities(id),
        warehouse_id UUID REFERENCES warehouses(id),
        items JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        rider_name VARCHAR(255),
        rider_phone VARCHAR(20),
        tracking_url TEXT,
        delivered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Payments and escrow
      CREATE TABLE IF NOT EXISTS escrow_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES jobs(id),
        client_id UUID REFERENCES users(id),
        artisan_id UUID REFERENCES users(id),
        amount DECIMAL(10,2),
        transaction_type VARCHAR(50),
        status VARCHAR(50) DEFAULT 'held',
        release_date TIMESTAMP,
        dispute_buffer_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Ratings
      CREATE TABLE IF NOT EXISTS ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES jobs(id),
        reviewer_id UUID REFERENCES users(id),
        reviewee_id UUID REFERENCES users(id),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        review TEXT,
        categories JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Location tracking
      CREATE TABLE IF NOT EXISTS location_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        artisan_id UUID REFERENCES users(id),
        job_id UUID REFERENCES jobs(id),
        location JSONB NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Audit logs
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type VARCHAR(100),
        entity_id UUID,
        action VARCHAR(100),
        user_id UUID REFERENCES users(id),
        old_data JSONB,
        new_data JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Notifications
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        type VARCHAR(50),
        title VARCHAR(255),
        message TEXT,
        data JSONB,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(job_status);
      CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_artisan ON jobs(artisan_id);
      CREATE INDEX IF NOT EXISTS idx_location_history_artisan ON location_history(artisan_id);
      CREATE INDEX IF NOT EXISTS idx_location_history_timestamp ON location_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_artisan_location ON artisan_profiles USING GIST (current_location);
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { pool, initializeDatabase };