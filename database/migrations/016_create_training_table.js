exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Create training_courses table
    CREATE TABLE IF NOT EXISTS training_courses (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      description TEXT,
      short_description VARCHAR(500),
      category VARCHAR(100),
      tier_level INTEGER CHECK (tier_level IN (1, 2, 3)),
      duration_hours INTEGER,
      modules JSONB,
      price DECIMAL(10,2) DEFAULT 0,
      thumbnail_url TEXT,
      cover_image_url TEXT,
      certification_provided BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      is_featured BOOLEAN DEFAULT FALSE,
      display_order INTEGER DEFAULT 0,
      created_by UUID REFERENCES users(id),
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create course_enrollments table
    CREATE TABLE IF NOT EXISTS course_enrollments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'in_progress', 'completed', 'dropped', 'expired')),
      progress_percentage INTEGER DEFAULT 0,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      expires_at TIMESTAMP,
      certificate_id UUID,
      payment_status VARCHAR(50) DEFAULT 'pending',
      payment_reference VARCHAR(100),
      enrolled_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(artisan_id, course_id)
    );
    
    -- Create module_completions table
    CREATE TABLE IF NOT EXISTS module_completions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      enrollment_id UUID NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
      module_index INTEGER NOT NULL,
      module_name VARCHAR(255),
      completed BOOLEAN DEFAULT FALSE,
      completed_at TIMESTAMP,
      time_spent_minutes INTEGER DEFAULT 0,
      quiz_score DECIMAL(5,2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(enrollment_id, module_index)
    );
    
    -- Create certificates table
    CREATE TABLE IF NOT EXISTS certificates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
      enrollment_id UUID NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
      certificate_number VARCHAR(100) UNIQUE NOT NULL,
      certificate_url TEXT,
      issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expiry_date TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE,
      verification_code VARCHAR(100) UNIQUE,
      metadata JSONB,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create course_reviews table
    CREATE TABLE IF NOT EXISTS course_reviews (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      course_id UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
      artisan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER CHECK (rating >= 1 AND rating <= 5),
      review TEXT,
      is_approved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(course_id, artisan_id)
    );
    
    -- Create artisan_tier_history table
    CREATE TABLE IF NOT EXISTS artisan_tier_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      artisan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      old_tier INTEGER,
      new_tier INTEGER NOT NULL,
      reason VARCHAR(255),
      triggered_by VARCHAR(50) CHECK (triggered_by IN ('admin', 'system', 'artisan')),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create tier_requirements table
    CREATE TABLE IF NOT EXISTS tier_requirements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tier_level INTEGER UNIQUE NOT NULL CHECK (tier_level IN (1, 2, 3)),
      min_jobs_completed INTEGER DEFAULT 0,
      min_rating DECIMAL(3,2) DEFAULT 0,
      min_completion_rate DECIMAL(5,2) DEFAULT 0,
      required_courses INTEGER DEFAULT 0,
      required_certifications INTEGER DEFAULT 0,
      min_trust_score INTEGER DEFAULT 0,
      benefits JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_training_courses_name ON training_courses(name);
    CREATE INDEX IF NOT EXISTS idx_training_courses_tier_level ON training_courses(tier_level);
    CREATE INDEX IF NOT EXISTS idx_training_courses_is_active ON training_courses(is_active);
    CREATE INDEX IF NOT EXISTS idx_training_courses_slug ON training_courses(slug);
    
    CREATE INDEX IF NOT EXISTS idx_course_enrollments_artisan_id ON course_enrollments(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_course_enrollments_course_id ON course_enrollments(course_id);
    CREATE INDEX IF NOT EXISTS idx_course_enrollments_status ON course_enrollments(status);
    CREATE INDEX IF NOT EXISTS idx_course_enrollments_progress ON course_enrollments(progress_percentage);
    
    CREATE INDEX IF NOT EXISTS idx_module_completions_enrollment_id ON module_completions(enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_module_completions_completed ON module_completions(completed);
    
    CREATE INDEX IF NOT EXISTS idx_certificates_artisan_id ON certificates(artisan_id);
    CREATE INDEX IF NOT EXISTS idx_certificates_course_id ON certificates(course_id);
    CREATE INDEX IF NOT EXISTS idx_certificates_certificate_number ON certificates(certificate_number);
    CREATE INDEX IF NOT EXISTS idx_certificates_verification_code ON certificates(verification_code);
    
    CREATE INDEX IF NOT EXISTS idx_course_reviews_course_id ON course_reviews(course_id);
    CREATE INDEX IF NOT EXISTS idx_course_reviews_artisan_id ON course_reviews(artisan_id);
    
    CREATE INDEX IF NOT EXISTS idx_artisan_tier_history_artisan_id ON artisan_tier_history(artisan_id);
    
    -- Insert default tier requirements
    INSERT INTO tier_requirements (tier_level, min_jobs_completed, min_rating, min_completion_rate, required_courses, required_certifications, min_trust_score, benefits) VALUES
      (1, 0, 0, 0, 0, 0, 0, '{"features": ["Basic job access", "Standard rates", "Limited visibility"]}'),
      (2, 10, 4.0, 80, 1, 0, 70, '{"features": ["More job access", "Higher rates", "Priority visibility", "Training access"]}'),
      (3, 50, 4.5, 90, 3, 1, 85, '{"features": ["Premium job access", "Highest rates", "Top visibility", "Advanced training", "Certification badges"]}');
    
    -- Insert sample training courses
    INSERT INTO training_courses (id, name, slug, description, short_description, category, tier_level, duration_hours, price, certification_provided, is_active, display_order, created_at, updated_at, modules) VALUES
      (uuid_generate_v4(), 'Advanced Plumbing Techniques', 'advanced-plumbing-techniques', 
       'Master advanced plumbing techniques including pipe fitting, leak detection, and water heater installation. This course covers both residential and commercial plumbing systems.', 
       'Master advanced plumbing for residential and commercial', 'plumbing', 2, 40, 25000, true, true, 1, NOW(), NOW(), '[1,2, 3]'),
      
      (uuid_generate_v4(), 'Electrical Wiring Certification', 'electrical-wiring-certification', 
       'Comprehensive electrical wiring course covering residential and commercial installations, safety protocols, and modern electrical systems.', 
       'Complete electrical wiring for residential and commercial', 'electrical', 2, 50, 30000, true, true, 2, NOW(), NOW(), '[1,2, 3, 4]'),
      
      (uuid_generate_v4(), 'Professional Carpentry', 'professional-carpentry', 
       'Advanced carpentry skills for furniture making, cabinetry, finishing, and custom woodworking projects.', 
       'Advanced carpentry for furniture and cabinetry', 'carpentry', 2, 60, 35000, true, true, 3, NOW(), NOW(), '[1,2, 3]'),
      
      (uuid_generate_v4(), 'HVAC Master Class', 'hvac-master-class', 
       'Complete HVAC training for air conditioning and refrigeration systems, including installation, maintenance, and troubleshooting.', 
       'Complete HVAC systems training', 'hvac', 3, 80, 50000, true, true, 4, NOW(), NOW(), '[1,2, 3, 4, 5]'),
      
      (uuid_generate_v4(), 'Solar Panel Installation', 'solar-panel-installation', 
       'Learn to install and maintain solar power systems for residential and commercial use, including panel installation, inverter setup, and battery systems.', 
       'Solar power installation and maintenance', 'solar', 3, 40, 40000, true, true, 5, NOW(), NOW(), '[1,2, 3]' ),
      
      (uuid_generate_v4(), 'CCTV & Security Systems', 'cctv-security-systems', 
       'Professional training for CCTV installation, configuration, and maintenance, including remote access and troubleshooting.', 
       'Professional CCTV and security systems', 'security', 2, 35, 25000, true, true, 6, NOW(), NOW(), '[1,2]'),
      
      (uuid_generate_v4(), 'Customer Service Excellence', 'customer-service-excellence', 
       'Essential customer service skills for artisans to build trust, communicate effectively, and get better ratings from clients.', 
       'Essential customer service skills', 'soft_skills', 1, 15, 10000, false, true, 7, NOW(), NOW(), '[1,2]');
    
    -- Create triggers for updated_at
    CREATE TRIGGER update_training_courses_updated_at 
      BEFORE UPDATE ON training_courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_course_enrollments_updated_at 
      BEFORE UPDATE ON course_enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_module_completions_updated_at 
      BEFORE UPDATE ON module_completions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_certificates_updated_at 
      BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_course_reviews_updated_at 
      BEFORE UPDATE ON course_reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
    CREATE TRIGGER update_tier_requirements_updated_at 
      BEFORE UPDATE ON tier_requirements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_tier_requirements_updated_at ON tier_requirements;
    DROP TRIGGER IF EXISTS update_course_reviews_updated_at ON course_reviews;
    DROP TRIGGER IF EXISTS update_certificates_updated_at ON certificates;
    DROP TRIGGER IF EXISTS update_module_completions_updated_at ON module_completions;
    DROP TRIGGER IF EXISTS update_course_enrollments_updated_at ON course_enrollments;
    DROP TRIGGER IF EXISTS update_training_courses_updated_at ON training_courses;
    DROP TABLE IF EXISTS tier_requirements CASCADE;
    DROP TABLE IF EXISTS artisan_tier_history CASCADE;
    DROP TABLE IF EXISTS course_reviews CASCADE;
    DROP TABLE IF EXISTS certificates CASCADE;
    DROP TABLE IF EXISTS module_completions CASCADE;
    DROP TABLE IF EXISTS course_enrollments CASCADE;
    DROP TABLE IF EXISTS training_courses CASCADE;
  `);
};