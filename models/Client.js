const { pool } = require('../config/database');

class Client {
  static async create(clientData) {
    const { userId, fullLegalName, nin, streetAddress, serviceAddress, verificationDocuments } = clientData;
    
    const result = await pool.query(
      `INSERT INTO client_profiles 
       (user_id, full_legal_name, nin, street_address, service_address, verification_documents)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, fullLegalName, nin, streetAddress, serviceAddress, verificationDocuments || {}]
    );
    
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT cp.*, u.email, u.phone, u.is_verified, u.verification_status, u.is_active
       FROM client_profiles cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT cp.*, u.email, u.phone, u.is_verified, u.verification_status, u.is_active
       FROM client_profiles cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  }

  static async update(userId, updates) {
    const allowedFields = ['full_legal_name', 'street_address', 'service_address', 'verification_documents'];
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
    return result.rows[0];
  }

  static async updateVerificationStatus(userId, status, notes = null) {
    const result = await pool.query(
      `UPDATE client_profiles 
       SET verification_status = $1, verification_notes = $2, updated_at = NOW()
       WHERE user_id = $3
       RETURNING *`,
      [status, notes, userId]
    );
    return result.rows[0];
  }

  static async getSavedArtisans(clientId) {
    const result = await pool.query(
      `SELECT sa.*, ap.full_legal_name, ap.skill_category, ap.tier_level, ap.star_rating
       FROM saved_artisans sa
       JOIN artisan_profiles ap ON sa.artisan_id = ap.user_id
       WHERE sa.client_id = $1
       ORDER BY sa.created_at DESC`,
      [clientId]
    );
    return result.rows;
  }

  static async saveArtisan(clientId, artisanId) {
    const result = await pool.query(
      `INSERT INTO saved_artisans (client_id, artisan_id)
       VALUES ($1, $2)
       ON CONFLICT (client_id, artisan_id) DO NOTHING
       RETURNING *`,
      [clientId, artisanId]
    );
    return result.rows[0];
  }

  static async removeSavedArtisan(clientId, artisanId) {
    const result = await pool.query(
      `DELETE FROM saved_artisans 
       WHERE client_id = $1 AND artisan_id = $2
       RETURNING *`,
      [clientId, artisanId]
    );
    return result.rows[0];
  }

  static async getAddresses(clientId) {
    const result = await pool.query(
      `SELECT * FROM client_addresses 
       WHERE client_id = $1 
       ORDER BY is_default DESC, created_at DESC`,
      [clientId]
    );
    return result.rows;
  }

  static async addAddress(clientId, addressData) {
    const { address, label, isDefault, latitude, longitude } = addressData;
    
    if (isDefault) {
      await pool.query(
        `UPDATE client_addresses SET is_default = false WHERE client_id = $1`,
        [clientId]
      );
    }
    
    const result = await pool.query(
      `INSERT INTO client_addresses (client_id, address, label, is_default, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [clientId, address, label, isDefault || false, latitude, longitude]
    );
    
    return result.rows[0];
  }

  static async updateAddress(addressId, updates) {
    const { address, label, isDefault, latitude, longitude } = updates;
    
    if (isDefault) {
      await pool.query(
        `UPDATE client_addresses SET is_default = false WHERE id = $1`,
        [addressId]
      );
    }
    
    const result = await pool.query(
      `UPDATE client_addresses 
       SET address = COALESCE($1, address),
           label = COALESCE($2, label),
           is_default = COALESCE($3, is_default),
           latitude = COALESCE($4, latitude),
           longitude = COALESCE($5, longitude),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [address, label, isDefault, latitude, longitude, addressId]
    );
    
    return result.rows[0];
  }

  static async deleteAddress(addressId) {
    const result = await pool.query(
      `DELETE FROM client_addresses WHERE id = $1 RETURNING *`,
      [addressId]
    );
    return result.rows[0];
  }
}

module.exports = Client;