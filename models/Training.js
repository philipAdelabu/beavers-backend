const { pool } = require('../config/database');

class Training {
  static async createCourse(courseData) {
    const { name, description, tierLevel, duration, modules, price, certificationProvided } = courseData;
    
    const result = await pool.query(
      `INSERT INTO training_courses 
       (name, description, tier_level, duration_hours, modules, price, certification_provided)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, description, tierLevel, duration, modules, price, certificationProvided]
    );
    
    return result.rows[0];
  }

  static async findCourseById(courseId) {
    const result = await pool.query(
      `SELECT * FROM training_courses WHERE id = $1`,
      [courseId]
    );
    return result.rows[0];
  }

  static async getAllCourses(filters = {}) {
    const { tierLevel, isActive, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM training_courses WHERE 1=1`;
    const params = [];
    let paramIndex = 1;
    
    if (tierLevel) {
      query += ` AND tier_level = $${paramIndex}`;
      params.push(tierLevel);
      paramIndex++;
    }
    
    if (isActive !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(isActive);
      paramIndex++;
    }
    
    query += ` ORDER BY tier_level ASC, name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    const countQuery = `
      SELECT COUNT(*) FROM training_courses WHERE 1=1
      ${tierLevel ? 'AND tier_level = $1' : ''}
      ${isActive !== undefined ? `AND is_active = $${tierLevel ? 2 : 1}` : ''}
    `;
    const countParams = [];
    if (tierLevel) countParams.push(tierLevel);
    if (isActive !== undefined) countParams.push(isActive);
    
    const countResult = await pool.query(countQuery, countParams);
    
    return {
      courses: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit
    };
  }

  static async updateCourse(courseId, updates) {
    const allowedFields = ['name', 'description', 'duration_hours', 'modules', 'price', 'is_active'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (setClause.length === 0) return null;
    
    values.push(courseId);
    const query = `
      UPDATE training_courses 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async enrollArtisan(artisanId, courseId) {
    const result = await pool.query(
      `INSERT INTO course_enrollments (artisan_id, course_id, status)
       VALUES ($1, $2, 'enrolled')
       ON CONFLICT (artisan_id, course_id) DO UPDATE
       SET status = 'enrolled', enrolled_at = NOW()
       RETURNING *`,
      [artisanId, courseId]
    );
    return result.rows[0];
  }

  static async getArtisanEnrollments(artisanId) {
    const result = await pool.query(
      `SELECT ce.*, tc.name, tc.description, tc.duration_hours, tc.certification_provided,
              tc.tier_level,
              (SELECT COUNT(*) FROM course_modules WHERE course_id = tc.id) as total_modules,
              (SELECT COUNT(*) FROM module_completions mc 
               WHERE mc.enrollment_id = ce.id AND mc.completed = true) as completed_modules
       FROM course_enrollments ce
       JOIN training_courses tc ON ce.course_id = tc.id
       WHERE ce.artisan_id = $1
       ORDER BY ce.enrolled_at DESC`,
      [artisanId]
    );
    return result.rows;
  }

  static async completeModule(enrollmentId, moduleIndex) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Mark module as completed
      const result = await client.query(
        `INSERT INTO module_completions (enrollment_id, module_index, completed)
         VALUES ($1, $2, true)
         ON CONFLICT (enrollment_id, module_index) DO UPDATE
         SET completed = true, completed_at = NOW()
         RETURNING *`,
        [enrollmentId, moduleIndex]
      );
      
      // Check if all modules are completed
      const enrollmentResult = await client.query(
        `SELECT ce.*, tc.modules
         FROM course_enrollments ce
         JOIN training_courses tc ON ce.course_id = tc.id
         WHERE ce.id = $1`,
        [enrollmentId]
      );
      
      const totalModules = enrollmentResult.rows[0].modules.length;
      
      const completedResult = await client.query(
        `SELECT COUNT(*) as count
         FROM module_completions
         WHERE enrollment_id = $1 AND completed = true`,
        [enrollmentId]
      );
      
      const completedCount = parseInt(completedResult.rows[0].count);
      
      if (completedCount === totalModules) {
        // Complete the course
        await client.query(
          `UPDATE course_enrollments 
           SET status = 'completed', completed_at = NOW()
           WHERE id = $1`,
          [enrollmentId]
        );
        
        // Grant certification if applicable
        const course = enrollmentResult.rows[0];
        if (course.certification_provided) {
          await client.query(
            `INSERT INTO certificates (artisan_id, course_id, enrollment_id, certificate_number)
             VALUES ($1, $2, $3, $4)`,
            [course.artisan_id, course.course_id, enrollmentId, 
             `CERT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`]
          );
        }
      }
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getCourseProgress(artisanId, courseId) {
    const result = await pool.query(
      `SELECT ce.*, tc.modules,
              (SELECT json_agg(json_build_object('module_index', module_index, 'completed', completed, 'completed_at', completed_at))
               FROM module_completions mc
               WHERE mc.enrollment_id = ce.id) as module_progress
       FROM course_enrollments ce
       JOIN training_courses tc ON ce.course_id = tc.id
       WHERE ce.artisan_id = $1 AND ce.course_id = $2`,
      [artisanId, courseId]
    );
    
    if (result.rows.length === 0) return null;
    
    const enrollment = result.rows[0];
    const totalModules = enrollment.modules.length;
    const completedModules = enrollment.module_progress?.filter(m => m.completed).length || 0;
    
    return {
      ...enrollment,
      totalModules,
      completedModules,
      progressPercentage: (completedModules / totalModules) * 100
    };
  }

  static async getCertificate(artisanId, courseId) {
    const result = await pool.query(
      `SELECT c.*, tc.name as course_name, tc.description,
              ap.full_legal_name as artisan_name
       FROM certificates c
       JOIN training_courses tc ON c.course_id = tc.id
       JOIN artisan_profiles ap ON c.artisan_id = ap.user_id
       WHERE c.artisan_id = $1 AND c.course_id = $2
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [artisanId, courseId]
    );
    return result.rows[0];
  }

  static async deleteCourse(courseId) {
    const result = await pool.query(
      `UPDATE training_courses SET is_active = false WHERE id = $1 RETURNING *`,
      [courseId]
    );
    return result.rows[0];
  }
}

module.exports = Training;