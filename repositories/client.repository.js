const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class ClientRepository {
  /**
   * Create client profile
   * @param {Object} profileData - Client profile data
   * @returns {Promise<Object>} Created profile
   */
  static async create(profileData) {
    const { userId, fullLegalName, nin, streetAddress, serviceAddress, verificationDocuments } = profileData;
    
    const result = await pool.query(
      `INSERT INTO client_profiles 
       (user_id, full_legal_name, nin, street_address, service_address, verification_documents)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, fullLegalName, nin, streetAddress, serviceAddress, verificationDocuments || {}]
    );
    
    return result.rows[0];
  }

  /**
   * Find client profile by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Client profile or null
   */
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT cp.*, u.email, u.phone, u.is_verified, u.verification_status, u.is_active, u.created_at
       FROM client_profiles cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.user_id = $1`,
      [userId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Find client profile by ID
   * @param {string} id - Profile ID
   * @returns {Promise<Object|null>} Client profile or null
   */
  static async findById(id) {
    const result = await pool.query(
      `SELECT cp.*, u.email, u.phone, u.is_verified, u.verification_status, u.is_active
       FROM client_profiles cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.id = $1`,
      [id]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Update client profile
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated profile or null
   */
  static async update(userId, updates) {
    const allowedFields = ['full_legal_name', 'street_address', 'service_address', 'verification_documents', 'verification_status', 'verification_notes'];
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
    
    values.push(userId);
    const query = `
      UPDATE client_profiles 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE user_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Get client addresses
   * @param {string} clientId - Client user ID
   * @returns {Promise<Array>} Addresses
   */
  static async getAddresses(clientId) {
    const result = await pool.query(
      `SELECT * FROM client_addresses 
       WHERE client_id = $1 
       ORDER BY is_default DESC, created_at DESC`,
      [clientId]
    );
    
    return result.rows;
  }

  /**
   * Add client address
   * @param {string} clientId - Client user ID
   * @param {Object} addressData - Address data
   * @returns {Promise<Object>} Created address
   */
  static async addAddress(clientId, addressData) {
    const { address, label, isDefault, latitude, longitude } = addressData;
    
    const result = await pool.query(
      `INSERT INTO client_addresses (client_id, address, label, is_default, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [clientId, address, label, isDefault || false, latitude, longitude]
    );
    
    return result.rows[0];
  }

  /**
   * Update client address
   * @param {string} addressId - Address ID
   * @param {string} clientId - Client user ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated address or null
   */
  static async updateAddress(addressId, clientId, updates) {
    const { address, label, isDefault, latitude, longitude } = updates;
    
    const result = await pool.query(
      `UPDATE client_addresses 
       SET address = COALESCE($1, address),
           label = COALESCE($2, label),
           is_default = COALESCE($3, is_default),
           latitude = COALESCE($4, latitude),
           longitude = COALESCE($5, longitude),
           updated_at = NOW()
       WHERE id = $6 AND client_id = $7
       RETURNING *`,
      [address, label, isDefault, latitude, longitude, addressId, clientId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Delete client address
   * @param {string} addressId - Address ID
   * @param {string} clientId - Client user ID
   * @returns {Promise<Object|null>} Deleted address or null
   */
  static async deleteAddress(addressId, clientId) {
    const result = await pool.query(
      `DELETE FROM client_addresses 
       WHERE id = $1 AND client_id = $2
       RETURNING *`,
      [addressId, clientId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get saved artisans
   * @param {string} clientId - Client user ID
   * @returns {Promise<Array>} Saved artisans
   */
  static async getSavedArtisans(clientId) {
    const result = await pool.query(
      `SELECT sa.*, 
              ap.full_legal_name, 
              ap.skill_category, 
              ap.tier_level, 
              ap.star_rating,
              ap.completion_rate,
              ap.trust_score
       FROM saved_artisans sa
       JOIN artisan_profiles ap ON sa.artisan_id = ap.user_id
       WHERE sa.client_id = $1
       ORDER BY sa.created_at DESC`,
      [clientId]
    );
    
    return result.rows;
  }

  /**
   * Save artisan
   * @param {string} clientId - Client user ID
   * @param {string} artisanId - Artisan user ID
   * @returns {Promise<Object|null>} Saved relation or null
   */
  static async saveArtisan(clientId, artisanId) {
    const result = await pool.query(
      `INSERT INTO saved_artisans (client_id, artisan_id)
       VALUES ($1, $2)
       ON CONFLICT (client_id, artisan_id) DO NOTHING
       RETURNING *`,
      [clientId, artisanId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Remove saved artisan
   * @param {string} clientId - Client user ID
   * @param {string} artisanId - Artisan user ID
   * @returns {Promise<Object|null>} Removed relation or null
   */
  static async removeSavedArtisan(clientId, artisanId) {
    const result = await pool.query(
      `DELETE FROM saved_artisans 
       WHERE client_id = $1 AND artisan_id = $2
       RETURNING *`,
      [clientId, artisanId]
    );
    
    return result.rows[0] || null;
  }

  /**
   * Get client statistics
   * @param {string} clientId - Client user ID
   * @returns {Promise<Object>} Statistics
   */
  static async getStatistics(clientId) {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN job_status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN job_status = 'cancelled' THEN 1 END) as cancelled_jobs,
        COALESCE(SUM(jb.total_amount), 0) as total_spent,
        COALESCE(AVG(jb.total_amount), 0) as average_spent
      FROM jobs j
      LEFT JOIN job_billing jb ON j.id = jb.job_id
      WHERE j.client_id = $1
    `, [clientId]);
    
    const favoriteCategories = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM jobs
      WHERE client_id = $1
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5
    `, [clientId]);
    
    return {
      ...result.rows[0],
      favoriteCategories: favoriteCategories.rows
    };
  }
}

module.exports = ClientRepository;