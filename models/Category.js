const { pool } = require('../config/database');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');

class Category {
  /**
   * Create a new category
   * @param {Object} categoryData - Category data
   * @returns {Promise<Object>} Created category
   */
  static async create(categoryData) {
    const { name, description, requiredCertifications, billingRules, icon, displayOrder, parentCategoryId } = categoryData;
    
    const result = await pool.query(
      `INSERT INTO categories 
       (name, description, required_certifications, billing_rules, icon, display_order, parent_category_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING *`,
      [name, description, requiredCertifications, billingRules, icon, displayOrder || 0, parentCategoryId || null]
    );
    
    // Clear cache
    await cacheDel('categories:all');
    await cacheDel('categories:active');
    await cacheDel('categories:tree');
    
    logger.info(`Category created: ${name}`);
    
    return result.rows[0];
  }

  /**
   * Find category by ID
   * @param {string} categoryId - Category ID
   * @returns {Promise<Object|null>} Category or null
   */
  static async findById(categoryId) {
    const result = await pool.query(
      `SELECT c.*, 
              COUNT(DISTINCT sc.id) as subcategory_count,
              COUNT(DISTINCT ap.user_id) as artisan_count
       FROM categories c
       LEFT JOIN subcategories sc ON c.id = sc.category_id AND sc.is_active = true
       LEFT JOIN artisan_profiles ap ON c.name = ap.skill_category AND ap.is_available = true
       WHERE c.id = $1
       GROUP BY c.id`,
      [categoryId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Find category by name
   * @param {string} name - Category name
   * @returns {Promise<Object|null>} Category or null
   */
  static async findByName(name) {
    const result = await pool.query(
      `SELECT * FROM categories WHERE name = $1`,
      [name]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get all categories
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Categories
   */
  static async findAll(filters = {}) {
    const { isActive, parentCategoryId, includeSubcategories = false, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT c.*, 
             COUNT(DISTINCT sc.id) as subcategory_count,
             COUNT(DISTINCT ap.user_id) as artisan_count
      FROM categories c
      LEFT JOIN subcategories sc ON c.id = sc.category_id AND sc.is_active = true
      LEFT JOIN artisan_profiles ap ON c.name = ap.skill_category AND ap.is_available = true
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (isActive !== undefined) {
      query += ` AND c.is_active = $${paramIndex}`;
      params.push(isActive);
      paramIndex++;
    }
    
    if (parentCategoryId !== undefined) {
      if (parentCategoryId === null) {
        query += ` AND c.parent_category_id IS NULL`;
      } else {
        query += ` AND c.parent_category_id = $${paramIndex}`;
        params.push(parentCategoryId);
        paramIndex++;
      }
    }
    
    query += ` GROUP BY c.id ORDER BY c.display_order ASC, c.name ASC`;
    
    if (page && limit) {
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
    }
    
    const result = await pool.query(query, params);
    
    if (includeSubcategories && result.rows.length > 0) {
      for (const category of result.rows) {
        category.subcategories = await Subcategory.findByCategoryId(category.id, { isActive: true });
      }
    }
    
    return result.rows;
  }

  /**
   * Get all active categories (cached)
   * @returns {Promise<Array>} Active categories
   */
  static async getActiveCategories() {
    const cacheKey = 'categories:active';
    let categories = await cacheGet(cacheKey);
    
    if (!categories) {
      categories = await this.findAll({ isActive: true });
      await cacheSet(cacheKey, categories, 3600);
    }
    
    return categories;
  }

  /**
   * Get category tree (hierarchical)
   * @returns {Promise<Array>} Category tree
   */
  static async getCategoryTree() {
    const cacheKey = 'categories:tree';
    let tree = await cacheGet(cacheKey);
    
    if (!tree) {
      const allCategories = await this.findAll({ isActive: true });
      
      // Build tree structure
      const categoryMap = {};
      const roots = [];
      
      for (const category of allCategories) {
        category.children = [];
        categoryMap[category.id] = category;
      }
      
      for (const category of allCategories) {
        if (category.parent_category_id && categoryMap[category.parent_category_id]) {
          categoryMap[category.parent_category_id].children.push(category);
        } else {
          roots.push(category);
        }
      }
      
      tree = roots;
      await cacheSet(cacheKey, tree, 3600);
    }
    
    return tree;
  }

  /**
   * Update category
   * @param {string} categoryId - Category ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated category or null
   */
  static async update(categoryId, updates) {
    const allowedFields = ['name', 'description', 'required_certifications', 'billing_rules', 'icon', 'is_active', 'display_order', 'parent_category_id'];
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
    
    values.push(categoryId);
    const query = `
      UPDATE categories 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length > 0) {
      // Clear cache
      await cacheDel('categories:all');
      await cacheDel('categories:active');
      await cacheDel('categories:tree');
    }
    
    return result.rows[0] || null;
  }

  /**
   * Delete category (soft delete)
   * @param {string} categoryId - Category ID
   * @returns {Promise<Object|null>} Deleted category or null
   */
  static async delete(categoryId) {
    const result = await pool.query(
      `UPDATE categories SET is_active = false WHERE id = $1 RETURNING *`,
      [categoryId]
    );
    
    if (result.rows.length > 0) {
      // Clear cache
      await cacheDel('categories:all');
      await cacheDel('categories:active');
      await cacheDel('categories:tree');
    }
    
    return result.rows[0] || null;
  }

  /**
   * Get categories with artisan count
   * @returns {Promise<Array>} Categories with counts
   */
  static async getCategoriesWithArtisanCount() {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.icon,
        COUNT(DISTINCT ap.user_id) as artisan_count,
        COUNT(DISTINCT j.id) as job_count_30_days
      FROM categories c
      LEFT JOIN artisan_profiles ap ON c.name = ap.skill_category AND ap.is_available = true
      LEFT JOIN jobs j ON c.name = j.category AND j.created_at > NOW() - INTERVAL '30 days'
      WHERE c.is_active = true
      GROUP BY c.id
      ORDER BY c.display_order ASC, c.name ASC
    `);
    
    return result.rows;
  }

  /**
   * Get popular categories (most jobs in last 30 days)
   * @param {number} limit - Limit
   * @returns {Promise<Array>} Popular categories
   */
  static async getPopularCategories(limit = 10) {
    const result = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.icon,
        COUNT(j.id) as job_count
      FROM categories c
      JOIN jobs j ON c.name = j.category
      WHERE j.created_at > NOW() - INTERVAL '30 days'
        AND c.is_active = true
      GROUP BY c.id
      ORDER BY job_count DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }

  /**
   * Get category statistics
   * @returns {Promise<Object>} Statistics
   */
  static async getStatistics() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_categories,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_categories,
        COUNT(CASE WHEN parent_category_id IS NULL THEN 1 END) as parent_categories,
        (SELECT COUNT(*) FROM subcategories WHERE is_active = true) as total_subcategories
      FROM categories
    `);
    
    return result.rows[0];
  }
}

module.exports = Category;