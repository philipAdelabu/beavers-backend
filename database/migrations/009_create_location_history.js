exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Enable PostGIS extension for geospatial queries
    CREATE EXTENSION IF NOT EXISTS postgis;
    
    CREATE TABLE IF NOT EXISTS location_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id),
      job_id UUID REFERENCES jobs(id),
      location JSONB NOT NULL,
      heading INTEGER,
      speed DECIMAL(10,2),
      accuracy DECIMAL(10,2),
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS geofences (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID UNIQUE NOT NULL REFERENCES jobs(id),
      center GEOMETRY(POINT, 4326) NOT NULL,
      radius INTEGER DEFAULT 100,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS geofence_checks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      geofence_id UUID NOT NULL REFERENCES geofences(id),
      artisan_lat DECIMAL(10,8) NOT NULL,
      artisan_lng DECIMAL(11,8) NOT NULL,
      distance DECIMAL(10,2),
      within_geofence BOOLEAN,
      checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_location_history_artisan_id ON location_history(artisan_id);
    CREATE INDEX idx_location_history_job_id ON location_history(job_id);
    CREATE INDEX idx_location_history_timestamp ON location_history(timestamp);
    CREATE INDEX idx_geofences_job_id ON geofences(job_id);
    CREATE INDEX idx_geofences_expires_at ON geofences(expires_at);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS geofence_checks CASCADE;
    DROP TABLE IF EXISTS geofences CASCADE;
    DROP TABLE IF EXISTS location_history CASCADE;
  `);
};