const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');

class Subcategory {
  /**
   * Create a new subcategory
   * @param {Object} subcategoryData - Subcategory data
   * @returns {Promise<Object>} Created subcategory
   */
  static async create(subcategoryData) {
    const { categoryId, name, description, icon, requiredCertifications, displayOrder } = subcategoryData;
    
    const result = await pool.query(
      `INSERT INTO subcategories 
       (category_id, name, description, icon, required_certifications, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [categoryId, name, description, icon, requiredCertifications, displayOrder || 0]
    );
    
    // Clear cache
    await cacheDel(`subcategories:category:${categoryId}`);
    await cacheDel('subcategories:all');
    
    logger.info(`Subcategory created: ${name} under category ${categoryId}`);
    
    return result.rows[0];
  }

  /**
   * Find subcategory by ID
   * @param {string} subcategoryId - Subcategory ID
   * @returns {Promise<Object|null>} Subcategory or null
   */
  static async findById(subcategoryId) {
    const result = await pool.query(
      `SELECT s.*, c.name as category_name, c.id as category_id
       FROM subcategories s
       JOIN categories c ON s.category_id = c.id
       WHERE s.id = $1`,
      [subcategoryId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Find subcategory by name within category
   * @param {string} categoryId - Category ID
   * @param {string} name - Subcategory name
   * @returns {Promise<Object|null>} Subcategory or null
   */
  static async findByName(categoryId, name) {
    const result = await pool.query(
      `SELECT * FROM subcategories WHERE category_id = $1 AND name = $2`,
      [categoryId, name]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get subcategories by category ID
   * @param {string} categoryId - Category ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Subcategories
   */
  static async findByCategoryId(categoryId, filters = {}) {
    const { isActive, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    const cacheKey = `subcategories:category:${categoryId}`;
    let subcategories = await cacheGet(cacheKey);
    
    if (!subcategories) {
      let query = `
        SELECT s.*, 
               COUNT(DISTINCT ap.user_id) as artisan_count
        FROM subcategories s
        LEFT JOIN artisan_profiles ap ON s.name = ANY(ap.sub_categories) AND ap.skill_category = (
          SELECT name FROM categories WHERE id = $1
        )
        WHERE s.category_id = $1
      `;
      const params = [categoryId];
      let paramIndex = 2;
      
      if (isActive !== undefined) {
        query += ` AND s.is_active = $${paramIndex}`;
        params.push(isActive);
        paramIndex++;
      }
      
      query += ` GROUP BY s.id ORDER BY s.display_order ASC, s.name ASC`;
      
      if (page && limit) {
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
      }
      
      const result = await pool.query(query, params);
      subcategories = result.rows;
      await cacheSet(cacheKey, subcategories, 3600);
    }
    
    return subcategories;
  }

  /**
   * Get all subcategories
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Subcategories
   */
  static async findAll(filters = {}) {
    const { isActive, categoryId, page = 1, limit = 100 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT s.*, c.name as category_name
      FROM subcategories s
      JOIN categories c ON s.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (isActive !== undefined) {
      query += ` AND s.is_active = $${paramIndex}`;
      params.push(isActive);
      paramIndex++;
    }
    
    if (categoryId) {
      query += ` AND s.category_id = $${paramIndex}`;
      params.push(categoryId);
      paramIndex++;
    }
    
    query += ` ORDER BY c.display_order ASC, s.display_order ASC, s.name ASC`;
    
    if (page && limit) {
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
    }
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get active subcategories for a category (cached)
   * @param {string} categoryId - Category ID
   * @returns {Promise<Array>} Active subcategories
   */
  static async getActiveSubcategories(categoryId) {
    return await this.findByCategoryId(categoryId, { isActive: true });
  }

  /**
   * Update subcategory
   * @param {string} subcategoryId - Subcategory ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated subcategory or null
   */
  static async update(subcategoryId, updates) {
    const allowedFields = ['name', 'description', 'icon', 'required_certifications', 'is_active', 'display_order'];
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
    
    values.push(subcategoryId);
    const query = `
      UPDATE subcategories 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length > 0) {
      // Clear cache
      const subcategory = result.rows[0];
      await cacheDel(`subcategories:category:${subcategory.category_id}`);
      await cacheDel('subcategories:all');
    }
    
    return result.rows[0] || null;
  }

  /**
   * Delete subcategory (soft delete)
   * @param {string} subcategoryId - Subcategory ID
   * @returns {Promise<Object|null>} Deleted subcategory or null
   */
  static async delete(subcategoryId) {
    const result = await pool.query(
      `UPDATE subcategories SET is_active = false WHERE id = $1 RETURNING *`,
      [subcategoryId]
    );
    
    if (result.rows.length > 0) {
      const subcategory = result.rows[0];
      await cacheDel(`subcategories:category:${subcategory.category_id}`);
      await cacheDel('subcategories:all');
    }
    
    return result.rows[0] || null;
  }

  /**
   * Get subcategories by artisan ID (artisan's specialties)
   * @param {string} artisanId - Artisan ID
   * @returns {Promise<Array>} Subcategories
   */
  static async getByArtisanId(artisanId) {
    const result = await pool.query(
      `SELECT s.*, c.name as category_name
       FROM subcategories s
       JOIN categories c ON s.category_id = c.id
       WHERE s.name = ANY(
         SELECT unnest(sub_categories) 
         FROM artisan_profiles 
         WHERE user_id = $1
       )
       AND s.is_active = true`,
      [artisanId]
    );
    
    return result.rows;
  }

  /**
   * Get artisans by subcategory
   * @param {string} subcategoryId - Subcategory ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Artisans
   */
  static async getArtisansBySubcategory(subcategoryId, filters = {}) {
    const { location, radius = 10, limit = 20 } = filters;
    
    const subcategory = await this.findById(subcategoryId);
    if (!subcategory) return [];
    
    let query = `
      SELECT ap.user_id, ap.full_legal_name, ap.star_rating, ap.tier_level,
             ap.completion_rate, ap.trust_score, ap.current_location
      FROM artisan_profiles ap
      JOIN users u ON ap.user_id = u.id
      WHERE $1 = ANY(ap.sub_categories)
        AND ap.is_available = true
        AND u.is_active = true
        AND ap.monthly_fee_status = 'paid'
    `;
    
    const params = [subcategory.name];
    
    if (location) {
      query += `
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint($2, $3), 4326),
          ST_SetSRID(ST_MakePoint(
            (ap.current_location->>'longitude')::float,
            (ap.current_location->>'latitude')::float
          ), 4326),
          $4 * 1000
        )
      `;
      params.push(location.longitude, location.latitude, radius);
    }
    
    query += ` ORDER BY ap.tier_level DESC, ap.star_rating DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get subcategory statistics
   * @returns {Promise<Object>} Statistics
   */
  static async getStatistics() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_subcategories,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_subcategories,
        COUNT(DISTINCT category_id) as categories_with_subcategories,
        (
          SELECT COUNT(DISTINCT ap.user_id)
          FROM artisan_profiles ap
          WHERE array_length(ap.sub_categories, 1) > 0
        ) as artisans_with_specialties
      FROM subcategories
    `);
    
    const topSubcategories = await pool.query(`
      SELECT 
        s.name,
        c.name as category_name,
        COUNT(DISTINCT ap.user_id) as artisan_count
      FROM subcategories s
      JOIN categories c ON s.category_id = c.id
      LEFT JOIN artisan_profiles ap ON s.name = ANY(ap.sub_categories)
      WHERE s.is_active = true
      GROUP BY s.id, c.name
      ORDER BY artisan_count DESC
      LIMIT 10
    `);
    
    return {
      ...result.rows[0],
      topSubcategories: topSubcategories.rows
    };
  }

  /**
   * Bulk create subcategories for a category
   * @param {string} categoryId - Category ID
   * @param {Array} subcategories - Array of subcategory data
   * @returns {Promise<Array>} Created subcategories
   */
  static async bulkCreate(categoryId, subcategories) {
    const results = [];
    
    for (const subcategory of subcategories) {
      const existing = await this.findByName(categoryId, subcategory.name);
      if (!existing) {
        const created = await this.create({
          categoryId,
          ...subcategory
        });
        results.push(created);
      }
    }
    
    await cacheDel(`subcategories:category:${categoryId}`);
    
    return results;
  }

  /**
   * Get subcategories with artisan count
   * @returns {Promise<Array>} Subcategories with counts
   */
  static async getWithArtisanCount() {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.description,
        c.name as category_name,
        COUNT(DISTINCT ap.user_id) as artisan_count
      FROM subcategories s
      JOIN categories c ON s.category_id = c.id
      LEFT JOIN artisan_profiles ap ON s.name = ANY(ap.sub_categories)
      WHERE s.is_active = true
      GROUP BY s.id, c.name
      ORDER BY artisan_count DESC, s.name ASC
    `);
    
    return result.rows;
  }
}

module.exports = Subcategory;