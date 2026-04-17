const { pool } = require('../config/database');

class BillOfQuantities {
  static async create(boqData) {
    const { jobId, artisanId, items, totalMaterialsCost, totalWorkmanshipCost, notes } = boqData;
    
    // Get current version
    const versionResult = await pool.query(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version 
       FROM bill_of_quantities WHERE job_id = $1`,
      [jobId]
    );
    const version = versionResult.rows[0].next_version;
    
    const result = await pool.query(
      `INSERT INTO bill_of_quantities 
       (job_id, artisan_id, items, total_materials_cost, total_workmanship_cost, notes, version, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
       RETURNING *`,
      [jobId, artisanId, items, totalMaterialsCost, totalWorkmanshipCost, notes, version]
    );
    
    return result.rows[0];
  }

  static async findById(boqId) {
    const result = await pool.query(
      `SELECT b.*, j.client_id, cp.full_legal_name as client_name,
              ap.full_legal_name as artisan_name
       FROM bill_of_quantities b
       JOIN jobs j ON b.job_id = j.id
       LEFT JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON b.artisan_id = ap.user_id
       WHERE b.id = $1`,
      [boqId]
    );
    return result.rows[0];
  }

  static async findByJobId(jobId, version = null) {
    let query = `
      SELECT * FROM bill_of_quantities 
      WHERE job_id = $1
    `;
    const params = [jobId];
    
    if (version) {
      query += ` AND version = $2`;
      params.push(version);
    } else {
      query += ` ORDER BY version DESC LIMIT 1`;
    }
    
    const result = await pool.query(query, params);
    return version ? result.rows : result.rows[0];
  }

  static async getHistory(jobId) {
    const result = await pool.query(
      `SELECT * FROM bill_of_quantities 
       WHERE job_id = $1 
       ORDER BY version DESC`,
      [jobId]
    );
    return result.rows;
  }

  static async update(boqId, updates) {
    const allowedFields = ['items', 'total_materials_cost', 'total_workmanship_cost', 'notes'];
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
    
    values.push(boqId);
    const query = `
      UPDATE bill_of_quantities 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async submitForApproval(boqId) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET status = 'pending_client_approval', submitted_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [boqId]
    );
    return result.rows[0];
  }

  static async clientApprove(boqId, clientId) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET client_approved = true, status = 'pending_admin_approval', 
           client_approved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [boqId]
    );
    return result.rows[0];
  }

  static async clientReject(boqId, clientId, reason) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET client_approved = false, status = 'rejected_by_client', 
           rejection_reason = $1, rejected_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reason, boqId]
    );
    return result.rows[0];
  }

  static async adminApprove(boqId, adminId) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET admin_approved = true, status = 'approved', 
           admin_approved_at = NOW(), admin_id = $1
       WHERE id = $2
       RETURNING *`,
      [adminId, boqId]
    );
    return result.rows[0];
  }

  static async adminReject(boqId, adminId, reason) {
    const result = await pool.query(
      `UPDATE bill_of_quantities 
       SET admin_approved = false, status = 'rejected_by_admin', 
           rejection_reason = $1, rejected_at = NOW(), admin_id = $2
       WHERE id = $3
       RETURNING *`,
      [reason, adminId, boqId]
    );
    return result.rows[0];
  }

  static async requestSubstitution(boqId, itemIndex, alternativeItem, reason) {
    const result = await pool.query(
      `INSERT INTO substitution_requests (boq_id, item_index, alternative_item, reason, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [boqId, itemIndex, alternativeItem, reason]
    );
    return result.rows[0];
  }

  static async approveSubstitution(requestId, adminId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get substitution request
      const requestResult = await client.query(
        `SELECT * FROM substitution_requests WHERE id = $1`,
        [requestId]
      );
      
      if (requestResult.rows.length === 0) {
        throw new Error('Substitution request not found');
      }
      
      const request = requestResult.rows[0];
      
      // Update the BoQ item
      const boq = await this.findById(request.boq_id);
      const items = boq.items;
      items[request.item_index] = request.alternative_item;
      
      // Recalculate totals
      const totalMaterialsCost = items.reduce((sum, item) => sum + (item.totalCost || 0), 0);
      
      await client.query(
        `UPDATE bill_of_quantities 
         SET items = $1, total_materials_cost = $2, updated_at = NOW()
         WHERE id = $3`,
        [items, totalMaterialsCost, request.boq_id]
      );
      
      // Update substitution request status
      await client.query(
        `UPDATE substitution_requests 
         SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2`,
        [adminId, requestId]
      );
      
      await client.query('COMMIT');
      
      const result = await client.query(
        `SELECT * FROM substitution_requests WHERE id = $1`,
        [requestId]
      );
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async rejectSubstitution(requestId, adminId, reason) {
    const result = await pool.query(
      `UPDATE substitution_requests 
       SET status = 'rejected', rejection_reason = $1, 
           approved_by = $2, approved_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [reason, adminId, requestId]
    );
    return result.rows[0];
  }
}

module.exports = BillOfQuantities;