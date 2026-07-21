const { pool } = require('../config/database');
const { redis, cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');
const { v4: uuidv4 } = require('uuid');

class TrainingService {
  // ==================== Course Management ====================
  
  /**
   * Create a new training course
   */
  static async createCourse(courseData, adminId) {
    const {
      name, description, shortDescription, category, tierLevel,
      durationHours, modules, price, thumbnailUrl, coverImageUrl,
      certificationProvided, isFeatured, displayOrder
    } = courseData;
    
    // Generate slug from name
    const slug = this.generateSlug(name);
    
    // Check if slug exists
    const existing = await pool.query(
      `SELECT id FROM training_courses WHERE slug = $1`,
      [slug]
    );
    
    if (existing.rows.length > 0) {
      throw new AppError(409, 'Course with similar name already exists');
    }
    
    const result = await pool.query(
      `INSERT INTO training_courses (
        name, slug, description, short_description, category, tier_level,
        duration_hours, modules, price, thumbnail_url, cover_image_url,
        certification_provided, is_featured, display_order, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        name, slug, description, shortDescription, category, tierLevel,
        durationHours, JSON.stringify(modules || []), price || 0,
        thumbnailUrl, coverImageUrl, certificationProvided || false,
        isFeatured || false, displayOrder || 0, adminId
      ]
    );
    
    await this.clearCourseCache();
    
    logger.info(`Course created: ${name} by admin ${adminId}`);
    
    return result.rows[0];
  }
  
  /**
   * Get all courses
   */
  static async getAllCourses(filters = {}) {
    const { 
      category, tierLevel, isActive, isFeatured, search,
      page = 1, limit = 20
    } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT c.*,
             COUNT(DISTINCT ce.id) as enrollment_count,
             COUNT(DISTINCT ce.id) FILTER (WHERE ce.status = 'completed') as completion_count,
             AVG(cr.rating) as avg_rating,
             COUNT(DISTINCT cr.id) as review_count
      FROM training_courses c
      LEFT JOIN course_enrollments ce ON c.id = ce.course_id
      LEFT JOIN course_reviews cr ON c.id = cr.course_id AND cr.is_approved = true
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (category) {
      query += ` AND c.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (tierLevel) {
      query += ` AND c.tier_level <= $${paramIndex}`;
      params.push(tierLevel);
      paramIndex++;
    }
    
    if (isActive !== undefined) {
      query += ` AND c.is_active = $${paramIndex}`;
      params.push(isActive);
      paramIndex++;
    }
    
    if (isFeatured !== undefined) {
      query += ` AND c.is_featured = $${paramIndex}`;
      params.push(isFeatured);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (c.name ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` GROUP BY c.id ORDER BY c.display_order ASC, c.name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM training_courses
      WHERE 1=1
      ${category ? `AND category = '${category}'` : ''}
      ${tierLevel ? `AND tier_level <= ${tierLevel}` : ''}
      ${isActive !== undefined ? `AND is_active = ${isActive}` : ''}
      ${search ? `AND (name ILIKE '%${search}%' OR description ILIKE '%${search}%')` : ''}
    `;
    const countResult = await pool.query(countQuery);
    
    return {
      courses: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  /**
   * Get courses by tier level
   */
  static async getCoursesByTier(tierLevel) {
    const cacheKey = `courses:tier:${tierLevel}`;
    let courses = await cacheGet(cacheKey);
    
    if (!courses) {
      const result = await pool.query(
        `SELECT * FROM training_courses 
         WHERE tier_level <= $1 AND is_active = true
         ORDER BY display_order ASC, name ASC`,
        [tierLevel]
      );
      courses = result.rows;
      await cacheSet(cacheKey, courses, 3600);
    }
    
    return courses;
  }
  
  /**
   * Get course by ID
   */
  static async getCourseById(courseId) {
    const cacheKey = `course:${courseId}`;
    let course = await cacheGet(cacheKey);
    
    if (!course) {
      const result = await pool.query(
        `SELECT c.*,
                COUNT(DISTINCT ce.id) as enrollment_count,
                COUNT(DISTINCT ce.id) FILTER (WHERE ce.status = 'completed') as completion_count,
                AVG(cr.rating) as avg_rating,
                COUNT(DISTINCT cr.id) as review_count
         FROM training_courses c
         LEFT JOIN course_enrollments ce ON c.id = ce.course_id
         LEFT JOIN course_reviews cr ON c.id = cr.course_id AND cr.is_approved = true
         WHERE c.id = $1
         GROUP BY c.id`,
        [courseId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError(404, 'Course not found');
      }
      
      course = result.rows[0];
      await cacheSet(cacheKey, course, 3600);
    }
    
    return course;
  }
  
  /**
   * Get course by slug
   */
  static async getCourseBySlug(slug) {
    const result = await pool.query(
      `SELECT * FROM training_courses WHERE slug = $1 AND is_active = true`,
      [slug]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Course not found');
    }
    
    return result.rows[0];
  }
  
  /**
   * Update course
   */
  static async updateCourse(courseId, updateData, adminId) {
    const allowedFields = [
      'name', 'description', 'short_description', 'category', 'tier_level',
      'duration_hours', 'modules', 'price', 'thumbnail_url', 'cover_image_url',
      'certification_provided', 'is_active', 'is_featured', 'display_order'
    ];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        if (key === 'modules' && value) {
          setClause.push(`${key} = $${paramIndex}::jsonb`);
          values.push(JSON.stringify(value));
        } else {
          setClause.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) {
      throw new AppError(400, 'No valid fields to update');
    }
    
    // If name is updated, update slug too
    if (updateData.name) {
      const slug = this.generateSlug(updateData.name);
      setClause.push(`slug = $${paramIndex}`);
      values.push(slug);
      paramIndex++;
    }
    
    values.push(adminId, courseId);
    const query = `
      UPDATE training_courses 
      SET ${setClause.join(', ')}, updated_by = $${paramIndex}, updated_at = NOW()
      WHERE id = $${paramIndex + 1}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Course not found');
    }
    
    await this.clearCourseCache();
    
    logger.info(`Course updated: ${courseId} by admin ${adminId}`);
    
    return result.rows[0];
  }
  
  /**
   * Delete course (soft delete)
   */
  static async deleteCourse(courseId, adminId) {
    const result = await pool.query(
      `UPDATE training_courses 
       SET is_active = false, updated_by = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [adminId, courseId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Course not found');
    }
    
    await this.clearCourseCache();
    
    logger.info(`Course deleted: ${courseId} by admin ${adminId}`);
    
    return result.rows[0];
  }
  
  // ==================== Course Enrollments ====================
  
  /**
   * Enroll artisan in a course
   */
  static async enrollArtisan(artisanId, courseId, paymentReference = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if course exists and is active
      const courseResult = await client.query(
        `SELECT * FROM training_courses WHERE id = $1 AND is_active = true`,
        [courseId]
      );
      
      if (courseResult.rows.length === 0) {
        throw new AppError(404, 'Course not found or not active');
      }
      
      const course = courseResult.rows[0];
      
      // Check if already enrolled
      const existingEnrollment = await client.query(
        `SELECT * FROM course_enrollments 
         WHERE artisan_id = $1 AND course_id = $2`,
        [artisanId, courseId]
      );
      
      if (existingEnrollment.rows.length > 0) {
        throw new AppError(400, 'Already enrolled in this course');
      }
      
      // Check tier eligibility
      const artisanResult = await client.query(
        `SELECT tier_level FROM artisan_profiles WHERE user_id = $1`,
        [artisanId]
      );
      
      if (artisanResult.rows.length === 0) {
        throw new AppError(404, 'Artisan not found');
      }
      
      const artisanTier = artisanResult.rows[0].tier_level;
      
      if (artisanTier < course.tier_level) {
        throw new AppError(403, `This course requires Tier ${course.tier_level} or higher`);
      }
      
      // Create enrollment
      const enrollmentResult = await client.query(
        `INSERT INTO course_enrollments (
          artisan_id, course_id, status, started_at, payment_status, payment_reference
        ) VALUES ($1, $2, 'enrolled', NOW(), $3, $4)
        RETURNING *`,
        [artisanId, courseId, course.price > 0 ? 'pending' : 'completed', paymentReference]
      );
      
      const enrollment = enrollmentResult.rows[0];
      
      // If course is free, mark as in_progress
      if (course.price === 0) {
        await client.query(
          `UPDATE course_enrollments 
           SET status = 'in_progress', payment_status = 'completed'
           WHERE id = $1`,
          [enrollment.id]
        );
      }
      
      await client.query('COMMIT');
      
      await this.clearEnrollmentCache(artisanId);
      
      logger.info(`Artisan ${artisanId} enrolled in course ${courseId}`);
      
      return enrollment;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get artisan's enrollments
   */
  static async getArtisanEnrollments(artisanId, filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT ce.*, 
             c.name as course_name, 
             c.slug as course_slug,
             c.thumbnail_url,
             c.duration_hours,
             c.certification_provided,
             c.tier_level,
             (SELECT COUNT(*) FROM module_completions mc 
              WHERE mc.enrollment_id = ce.id AND mc.completed = true) as completed_modules,
             (SELECT COUNT(*) FROM course_reviews cr 
              WHERE cr.course_id = ce.course_id AND cr.artisan_id = ce.artisan_id) as has_reviewed
      FROM course_enrollments ce
      JOIN training_courses c ON ce.course_id = c.id
      WHERE ce.artisan_id = $1
    `;
    const params = [artisanId];
    let paramIndex = 2;
    
    if (status) {
      query += ` AND ce.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY ce.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM course_enrollments
      WHERE artisan_id = $1
      ${status ? `AND status = '${status}'` : ''}
    `;
    const countParams = [artisanId];
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      enrollments: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  /**
   * Get enrollment details
   */
  static async getEnrollmentDetails(enrollmentId, artisanId) {
    const result = await pool.query(
      `SELECT ce.*, 
              c.name as course_name,
              c.slug as course_slug,
              c.modules as course_modules,
              c.description as course_description,
              c.duration_hours,
              c.certification_provided,
              c.tier_level,
              (SELECT json_agg(row_to_json(mc)) FROM module_completions mc 
               WHERE mc.enrollment_id = ce.id) as module_progress
       FROM course_enrollments ce
       JOIN training_courses c ON ce.course_id = c.id
       WHERE ce.id = $1 AND ce.artisan_id = $2`,
      [enrollmentId, artisanId]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Enrollment not found');
    }
    
    return result.rows[0];
  }
  
  // ==================== Module Progress ====================
  
  /**
   * Complete a module
   */
  static async completeModule(enrollmentId, artisanId, moduleIndex, timeSpent = 0, quizScore = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verify enrollment
      const enrollmentResult = await client.query(
        `SELECT * FROM course_enrollments 
         WHERE id = $1 AND artisan_id = $2`,
        [enrollmentId, artisanId]
      );
      
      if (enrollmentResult.rows.length === 0) {
        throw new AppError(404, 'Enrollment not found');
      }
      
      const enrollment = enrollmentResult.rows[0];
      
      if (enrollment.status === 'completed') {
        throw new AppError(400, 'Course already completed');
      }
      
      // Get course modules
      const courseResult = await client.query(
        `SELECT modules FROM training_courses WHERE id = $1`,
        [enrollment.course_id]
      );
      
      const modules = courseResult.rows[0].modules;

      
      if (moduleIndex >= modules.length) {
        throw new AppError(400, 'Invalid module index');
      }
      
      const moduleName = modules[moduleIndex]?.name || `Module ${moduleIndex + 1}`;
      
      // Mark module as completed
      const completionResult = await client.query(
        `INSERT INTO module_completions (
          enrollment_id, module_index, module_name, completed, completed_at, 
          time_spent_minutes, quiz_score
        ) VALUES ($1, $2, $3, true, NOW(), $4, $5)
        ON CONFLICT (enrollment_id, module_index) 
        DO UPDATE SET completed = true, completed_at = NOW(), 
                      time_spent_minutes = EXCLUDED.time_spent_minutes,
                      quiz_score = COALESCE(EXCLUDED.quiz_score, module_completions.quiz_score)
        RETURNING *`,
        [enrollmentId, moduleIndex, moduleName, timeSpent, quizScore]
      );
      
      // Count completed modules
      const completedCountResult = await client.query(
        `SELECT COUNT(*) FROM module_completions 
         WHERE enrollment_id = $1 AND completed = true`,
        [enrollmentId]
      );
      
      const completedCount = parseInt(completedCountResult.rows[0].count);
      const totalModules = modules.length;
      const progressPercentage = Math.round((completedCount / totalModules) * 100);
      
      // Update enrollment progress
      let status = 'in_progress';
      if (completedCount === totalModules) {
        status = 'completed';
      }
      
      await client.query(
        `UPDATE course_enrollments 
         SET progress_percentage = $1,
             status = $2,
             completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
         WHERE id = $3`,
        [progressPercentage, status, enrollmentId]
      );
      
      // If course completed, generate certificate
      let certificate = null;
      if (status === 'completed') {
        const courseResult2 = await client.query(
          `SELECT * FROM training_courses WHERE id = $1`,
          [enrollment.course_id]
        );
        
        const course = courseResult2.rows[0];
        
        if (course.certification_provided) {
          certificate = await this.generateCertificate(
            artisanId,
            enrollment.course_id,
            enrollmentId,
            client
          );
        }
      }
      
      await client.query('COMMIT');
      
      await this.clearEnrollmentCache(artisanId);
      
      logger.info(`Module ${moduleIndex} completed for enrollment ${enrollmentId}`);
      
      return {
        moduleCompletion: completionResult.rows[0],
        progressPercentage,
        status,
        certificate
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  // ==================== Certificates ====================
  
  /**
   * Generate certificate for completed course
   */
  static async generateCertificate(artisanId, courseId, enrollmentId, client = null) {
    const dbClient = client || (await pool.connect());
    const shouldRelease = !client;
    
    try {
      // Check if certificate already exists
      const existing = await dbClient.query(
        `SELECT * FROM certificates 
         WHERE artisan_id = $1 AND course_id = $2`,
        [artisanId, courseId]
      );
      
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }
      
      // Get artisan and course info
      const artisanResult = await dbClient.query(
        `SELECT ap.full_legal_name, u.email 
         FROM artisan_profiles ap
         JOIN users u ON ap.user_id = u.id
         WHERE ap.user_id = $1`,
        [artisanId]
      );
      
      const courseResult = await dbClient.query(
        `SELECT name FROM training_courses WHERE id = $1`,
        [courseId]
      );
      
      const artisan = artisanResult.rows[0];
      const course = courseResult.rows[0];
      
      // Generate certificate number
      const certificateNumber = `CERT-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`.toUpperCase();
      const verificationCode = `${Date.now().toString(36)}${Math.random().toString(36).substr(2, 8)}`.toUpperCase();
      
      const result = await dbClient.query(
        `INSERT INTO certificates (
          artisan_id, course_id, enrollment_id, certificate_number, verification_code,
          issue_date, is_active
        ) VALUES ($1, $2, $3, $4, $5, NOW(), true)
        RETURNING *`,
        [artisanId, courseId, enrollmentId, certificateNumber, verificationCode]
      );
      
      // Update enrollment with certificate_id
      await dbClient.query(
        `UPDATE course_enrollments SET certificate_id = $1 WHERE id = $2`,
        [result.rows[0].id, enrollmentId]
      );
      
      return result.rows[0];
    } finally {
      if (shouldRelease && dbClient.release) {
        dbClient.release();
      }
    }
  }
  
  /**
   * Get artisan's certificates
   */
  static async getArtisanCertificates(artisanId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT c.*, 
              tc.name as course_name,
              tc.slug as course_slug,
              tc.thumbnail_url
       FROM certificates c
       JOIN training_courses tc ON c.course_id = tc.id
       WHERE c.artisan_id = $1 AND c.is_active = true
       ORDER BY c.issue_date DESC
       LIMIT $2 OFFSET $3`,
      [artisanId, limit, offset]
    );
    
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM certificates WHERE artisan_id = $1 AND is_active = true`,
      [artisanId]
    );
    
    return {
      certificates: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  /**
   * Verify certificate by number
   */
  static async verifyCertificate(certificateNumber) {
    const result = await pool.query(
      `SELECT c.*, 
              ap.full_legal_name as artisan_name,
              tc.name as course_name,
              tc.slug as course_slug
       FROM certificates c
       JOIN artisan_profiles ap ON c.artisan_id = ap.user_id
       JOIN training_courses tc ON c.course_id = tc.id
       WHERE c.certificate_number = $1 AND c.is_active = true`,
      [certificateNumber]
    );
    
    if (result.rows.length === 0) {
      return { valid: false, message: 'Certificate not found or invalid' };
    }
    
    return {
      valid: true,
      certificate: result.rows[0]
    };
  }
  
  // ==================== Course Reviews ====================
  
  /**
   * Submit course review
   */
  static async submitReview(courseId, artisanId, rating, review) {
    const result = await pool.query(
      `INSERT INTO course_reviews (course_id, artisan_id, rating, review, is_approved)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (course_id, artisan_id) 
       DO UPDATE SET rating = EXCLUDED.rating, review = EXCLUDED.review, updated_at = NOW()
       RETURNING *`,
      [courseId, artisanId, rating, review]
    );
    
    await cacheDel(`course:${courseId}`);
    
    return result.rows[0];
  }
  
  /**
   * Get course reviews
   */
  static async getCourseReviews(courseId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const result = await pool.query(
      `SELECT cr.*, 
              ap.full_legal_name as artisan_name,
              ap.star_rating as artisan_rating
       FROM course_reviews cr
       JOIN artisan_profiles ap ON cr.artisan_id = ap.user_id
       WHERE cr.course_id = $1 AND cr.is_approved = true
       ORDER BY cr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [courseId, limit, offset]
    );
    
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM course_reviews 
       WHERE course_id = $1 AND is_approved = true`,
      [courseId]
    );
    
    const stats = await pool.query(
      `SELECT 
         AVG(rating) as avg_rating,
         COUNT(*) as total_reviews,
         COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
         COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
         COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
         COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
         COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
       FROM course_reviews
       WHERE course_id = $1 AND is_approved = true`,
      [courseId]
    );
    
    return {
      reviews: result.rows,
      statistics: stats.rows[0],
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  }
  
  // ==================== Tier Management ====================
  
  /**
   * Get tier requirements
   */
  static async getTierRequirements() {
    const cacheKey = 'tier:requirements';
    let requirements = await cacheGet(cacheKey);
    
    if (!requirements) {
      const result = await pool.query(
        `SELECT * FROM tier_requirements ORDER BY tier_level ASC`
      );
      requirements = result.rows;
      await cacheSet(cacheKey, requirements, 3600);
    }
    
    return requirements;
  }
  
  /**
   * Update tier requirements
   */
  static async updateTierRequirements(tierLevel, requirements, adminId) {
    const {
      minJobsCompleted, minRating, minCompletionRate,
      requiredCourses, requiredCertifications, minTrustScore, benefits
    } = requirements;
    
    const result = await pool.query(
      `UPDATE tier_requirements 
       SET min_jobs_completed = COALESCE($1, min_jobs_completed),
           min_rating = COALESCE($2, min_rating),
           min_completion_rate = COALESCE($3, min_completion_rate),
           required_courses = COALESCE($4, required_courses),
           required_certifications = COALESCE($5, required_certifications),
           min_trust_score = COALESCE($6, min_trust_score),
           benefits = COALESCE($7, benefits),
           updated_at = NOW()
       WHERE tier_level = $8
       RETURNING *`,
      [
        minJobsCompleted, minRating, minCompletionRate,
        requiredCourses, requiredCertifications, minTrustScore,
        JSON.stringify(benefits), tierLevel
      ]
    );
    
    if (result.rows.length === 0) {
      throw new AppError(404, 'Tier requirements not found');
    }
    
    await cacheDel('tier:requirements');
    
    logger.info(`Tier ${tierLevel} requirements updated by admin ${adminId}`);
    
    return result.rows[0];
  }
  
  /**
   * Check and update artisan tier based on performance
   */
  static async checkAndUpdateTier(artisanId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get artisan current tier and stats
      const artisanResult = await client.query(
        `SELECT ap.tier_level, ap.star_rating, ap.completion_rate, ap.trust_score,
                (SELECT COUNT(*) FROM jobs WHERE artisan_id = $1 AND job_status = 'completed') as jobs_completed,
                (SELECT COUNT(*) FROM course_enrollments WHERE artisan_id = $1 AND status = 'completed') as courses_completed,
                (SELECT COUNT(*) FROM certificates WHERE artisan_id = $1 AND is_active = true) as certificates_earned
         FROM artisan_profiles ap
         WHERE ap.user_id = $1`,
        [artisanId]
      );
      
      if (artisanResult.rows.length === 0) {
        throw new AppError(404, 'Artisan not found');
      }
      
      const artisan = artisanResult.rows[0];
      
      // Get tier requirements
      const requirements = await this.getTierRequirements();
      
      let newTier = artisan.tier_level;
      
      // Check if eligible for upgrade
      for (const req of requirements) {
        if (req.tier_level > artisan.tier_level) {
          const eligible = 
            artisan.jobs_completed >= req.min_jobs_completed &&
            artisan.star_rating >= req.min_rating &&
            artisan.completion_rate >= req.min_completion_rate &&
            artisan.courses_completed >= req.required_courses &&
            artisan.certificates_earned >= req.required_certifications &&
            artisan.trust_score >= req.min_trust_score;
          
          if (eligible) {
            newTier = req.tier_level;
          } else {
            break;
          }
        }
      }
      
      // Update tier if changed
      if (newTier !== artisan.tier_level) {
        await client.query(
          `UPDATE artisan_profiles 
           SET tier_level = $1, tier_updated_at = NOW()
           WHERE user_id = $2`,
          [newTier, artisanId]
        );
        
        // Log tier change
        await client.query(
          `INSERT INTO artisan_tier_history (artisan_id, old_tier, new_tier, reason, triggered_by)
           VALUES ($1, $2, $3, 'Auto-upgrade based on performance', 'system')`,
          [artisanId, artisan.tier_level, newTier]
        );
        
        await client.query('COMMIT');
        
        // Clear cache
        await cacheDel(`artisan:profile:${artisanId}`);
        
        logger.info(`Artisan ${artisanId} upgraded from Tier ${artisan.tier_level} to Tier ${newTier}`);
        
        return {
          upgraded: true,
          oldTier: artisan.tier_level,
          newTier: newTier
        };
      }
      
      await client.query('COMMIT');
      
      return {
        upgraded: false,
        currentTier: artisan.tier_level
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get tier statistics
   */
  static async getTierStatistics() {
    const result = await pool.query(`
      SELECT 
        tier_level,
        COUNT(*) as artisan_count,
        AVG(star_rating) as avg_rating,
        AVG(completion_rate) as avg_completion_rate,
        AVG(trust_score) as avg_trust_score
      FROM artisan_profiles
      GROUP BY tier_level
      ORDER BY tier_level ASC
    `);
    
    return result.rows;
  }
  
  // ==================== Helper Methods ====================
  
  /**
   * Generate slug from name
   */
  static generateSlug(name) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  
  /**
   * Clear course cache
   */
  static async clearCourseCache() {
    await cacheDel('courses:tier:*');
    const keys = await redis.keys('course:*');
    if (keys.length > 0) {
      await redis.del(keys);
    }
    logger.info('Course cache cleared');
  }
  
  /**
   * Clear enrollment cache
   */
  static async clearEnrollmentCache(artisanId) {
    await cacheDel(`enrollments:${artisanId}`);
  }
  
  /**
   * Get course statistics
   */
  static async getCourseStatistics() {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_courses,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_courses,
        COUNT(CASE WHEN certification_provided = true THEN 1 END) as certified_courses,
        SUM(duration_hours) as total_duration_hours,
        AVG(price) as avg_price
      FROM training_courses
    `);
    
    const enrollmentStats = await pool.query(`
      SELECT 
        COUNT(*) as total_enrollments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completions,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'enrolled' THEN 1 END) as enrolled,
        AVG(progress_percentage) as avg_progress
      FROM course_enrollments
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    
    const certStats = await pool.query(`
      SELECT 
        COUNT(*) as total_certificates,
        COUNT(DISTINCT artisan_id) as artisans_with_certificates,
        COUNT(DISTINCT course_id) as courses_with_certificates
      FROM certificates
      WHERE is_active = true
    `);
    
    return {
      courses: stats.rows[0],
      enrollments: enrollmentStats.rows[0],
      certificates: certStats.rows[0]
    };
  }
}

module.exports = TrainingService;