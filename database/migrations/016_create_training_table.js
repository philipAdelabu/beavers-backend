exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS training_courses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      tier_level INTEGER CHECK (tier_level IN (1, 2, 3)),
      duration_hours INTEGER,
      modules JSONB,
      price DECIMAL(10,2),
      certification_provided BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS course_enrollments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id),
      course_id UUID NOT NULL REFERENCES training_courses(id),
      status VARCHAR(50) DEFAULT 'enrolled',
      enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(artisan_id, course_id)
    );
    
    CREATE TABLE IF NOT EXISTS module_completions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      enrollment_id UUID NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
      module_index INTEGER NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(enrollment_id, module_index)
    );
    
    CREATE TABLE IF NOT EXISTS certificates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id),
      course_id UUID NOT NULL REFERENCES training_courses(id),
      enrollment_id UUID NOT NULL REFERENCES course_enrollments(id),
      certificate_number VARCHAR(100) UNIQUE,
      issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_training_courses_tier ON training_courses(tier_level);
    CREATE INDEX idx_course_enrollments_artisan_id ON course_enrollments(artisan_id);
    CREATE INDEX idx_certificates_artisan_id ON certificates(artisan_id);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS certificates CASCADE;
    DROP TABLE IF EXISTS module_completions CASCADE;
    DROP TABLE IF EXISTS course_enrollments CASCADE;
    DROP TABLE IF EXISTS training_courses CASCADE;
  `);
};