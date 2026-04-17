const { pool } = require('../config/database');

class User {
  static async create(userData) {
    const { email, phone, passwordHash, userType } = userData;
    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, user_type, verification_status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [email, phone, passwordHash, userType]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      `SELECT u.*, 
              CASE WHEN u.user_type = 'client' THEN cp.full_legal_name 
                   WHEN u.user_type = 'artisan' THEN ap.full_legal_name 
              END as full_name
       FROM users u
       LEFT JOIN client_profiles cp ON u.id = cp.user_id AND u.user_type = 'client'
       LEFT JOIN artisan_profiles ap ON u.id = ap.user_id AND u.user_type = 'artisan'
       WHERE u.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async update(id, updates) {
    const allowedFields = ['email', 'phone', 'is_active', 'is_verified', 'verification_status'];
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
    
    values.push(id);
    const query = `
      UPDATE users 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(
      'UPDATE users SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }
}

module.exports = User;