const { pool } = require('../config/database');

class JobBilling {
  static async create(jobId) {
    const result = await pool.query(
      `INSERT INTO job_billing (job_id, billing_status)
       VALUES ($1, 'pending')
       RETURNING *`,
      [jobId]
    );
    return result.rows[0];
  }

  static async findByJobId(jobId) {
    const result = await pool.query(
      `SELECT * FROM job_billing WHERE job_id = $1`,
      [jobId]
    );
    return result.rows[0];
  }

  static async update(jobId, updates) {
    const allowedFields = [
      'base_fee', 'diagnostics_fee', 'execution_fee', 
      'materials_cost', 'workmanship_cost', 'total_amount', 
      'billing_status', 'escrow_hold_id'
    ];
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
    
    // Calculate total amount
    if (updates.base_fee !== undefined || updates.diagnostics_fee !== undefined ||
        updates.execution_fee !== undefined || updates.materials_cost !== undefined ||
        updates.workmanship_cost !== undefined) {
      
      const current = await this.findByJobId(jobId);
      const baseFee = updates.base_fee !== undefined ? updates.base_fee : current.base_fee;
      const diagnosticsFee = updates.diagnostics_fee !== undefined ? updates.diagnostics_fee : current.diagnostics_fee;
      const executionFee = updates.execution_fee !== undefined ? updates.execution_fee : current.execution_fee;
      const materialsCost = updates.materials_cost !== undefined ? updates.materials_cost : current.materials_cost;
      const workmanshipCost = updates.workmanship_cost !== undefined ? updates.workmanship_cost : current.workmanship_cost;
      
      const totalAmount = (baseFee || 0) + (diagnosticsFee || 0) + (executionFee || 0) + 
                         (materialsCost || 0) + (workmanshipCost || 0);
      
      setClause.push(`total_amount = $${paramIndex}`);
      values.push(totalAmount);
      paramIndex++;
    }
    
    values.push(jobId);
    const query = `
      UPDATE job_billing 
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE job_id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async addBaseFee(jobId, amount) {
    const result = await pool.query(
      `UPDATE job_billing 
       SET base_fee = $1, billing_status = 'base_charged'
       WHERE job_id = $2
       RETURNING *`,
      [amount, jobId]
    );
    return result.rows[0];
  }

  static async addDiagnosticsFee(jobId, amount, duration) {
    const result = await pool.query(
      `UPDATE job_billing 
       SET diagnostics_fee = $1, diagnostics_duration = $2, billing_status = 'diagnostics_charged'
       WHERE job_id = $3
       RETURNING *`,
      [amount, duration, jobId]
    );
    return result.rows[0];
  }

  static async addExecutionFee(jobId, amount, mode, duration = null) {
    const result = await pool.query(
      `UPDATE job_billing 
       SET execution_fee = $1, execution_mode = $2, execution_duration = $3, 
           billing_status = 'execution_charged'
       WHERE job_id = $4
       RETURNING *`,
      [amount, mode, duration, jobId]
    );
    return result.rows[0];
  }

  static async addMaterialsCost(jobId, amount) {
    const result = await pool.query(
      `UPDATE job_billing 
       SET materials_cost = $1
       WHERE job_id = $2
       RETURNING *`,
      [amount, jobId]
    );
    return result.rows[0];
  }

  static async addWorkmanshipCost(jobId, amount) {
    const result = await pool.query(
      `UPDATE job_billing 
       SET workmanship_cost = $1
       WHERE job_id = $2
       RETURNING *`,
      [amount, jobId]
    );
    return result.rows[0];
  }

  static async updateStatus(jobId, status) {
    const result = await pool.query(
      `UPDATE job_billing 
       SET billing_status = $1, updated_at = NOW()
       WHERE job_id = $2
       RETURNING *`,
      [status, jobId]
    );
    return result.rows[0];
  }

  static async getInvoice(jobId) {
    const result = await pool.query(
      `SELECT jb.*, j.category, j.description, j.service_type,
              cp.full_legal_name as client_name, cp.email as client_email,
              ap.full_legal_name as artisan_name
       FROM job_billing jb
       JOIN jobs j ON jb.job_id = j.id
       JOIN client_profiles cp ON j.client_id = cp.user_id
       LEFT JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
       WHERE jb.job_id = $1`,
      [jobId]
    );
    return result.rows[0];
  }
}

module.exports = JobBilling;