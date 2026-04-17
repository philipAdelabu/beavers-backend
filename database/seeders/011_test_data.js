const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * Seed test data for development
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  // Only seed in development environment
  if (process.env.NODE_ENV !== 'development') {
    console.log('Test data seeding skipped (not in development environment)');
    return;
  }
  
  // Create test client
  const clientId = uuidv4();
  const clientPassword = await bcrypt.hash('client123', 10);
  
  const existingClient = await queryInterface.query(
    `SELECT id FROM users WHERE email = 'testclient@example.com'`
  );
  
  if (existingClient.rows.length === 0) {
    await queryInterface.query(`
      INSERT INTO users (id, email, phone, password_hash, user_type, is_verified, verification_status, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `, [clientId, 'testclient@example.com', '+2349012345678', clientPassword, 'client', true, 'verified', true]);
    
    await queryInterface.query(`
      INSERT INTO client_profiles (user_id, full_legal_name, nin, street_address, service_address, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    `, [clientId, 'Test Client', '12345678901', '123 Test Street, Lagos', '123 Test Street, Lagos']);
    
    console.log('Test client created');
  }
  
  // Create test artisan
  const artisanId = uuidv4();
  const artisanPassword = await bcrypt.hash('artisan123', 10);
  
  const existingArtisan = await queryInterface.query(
    `SELECT id FROM users WHERE email = 'testartisan@example.com'`
  );
  
  if (existingArtisan.rows.length === 0) {
    await queryInterface.query(`
      INSERT INTO users (id, email, phone, password_hash, user_type, is_verified, verification_status, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `, [artisanId, 'testartisan@example.com', '+2349123456789', artisanPassword, 'artisan', true, 'verified', true]);
    
    await queryInterface.query(`
      INSERT INTO artisan_profiles (user_id, full_legal_name, nin, residential_address, skill_category, tier_level, star_rating, completion_rate, onboarding_fee_paid, monthly_fee_status, is_available, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [artisanId, 'Test Artisan', '98765432109', '456 Artisan Avenue, Lagos', 'Plumbing', 2, 4.5, 95, true, 'paid', true]);
    
    console.log('Test artisan created');
  }
  
  // Create test job
  const jobId = uuidv4();
  
  const existingJob = await queryInterface.query(
    `SELECT id FROM jobs WHERE client_id = $1 AND description LIKE '%Test Job%'`,
    [clientId]
  );
  
  if (existingJob.rows.length === 0) {
    await queryInterface.query(`
      INSERT INTO jobs (id, client_id, category, description, service_type, job_status, location, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `, [jobId, clientId, 'Plumbing', 'Test Job - Leaking faucet repair', 'repair', 'completed', JSON.stringify({ latitude: 6.5244, longitude: 3.3792 })]);
    
    await queryInterface.query(`
      INSERT INTO job_billing (job_id, base_fee, diagnostics_fee, execution_fee, total_amount, billing_status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [jobId, 2500, 1500, 5000, 9000, 'paid']);
    
    console.log('Test job created');
  }
  
  // Create test rating
  const existingRating = await queryInterface.query(
    `SELECT id FROM ratings WHERE job_id = $1`,
    [jobId]
  );
  
  if (existingRating.rows.length === 0) {
    await queryInterface.query(`
      INSERT INTO ratings (job_id, reviewer_id, reviewee_id, rating, review, categories, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [jobId, clientId, artisanId, 5, 'Excellent work! Very professional.', JSON.stringify({ punctuality: 5, quality: 5, communication: 5 })]);
    
    console.log('Test rating created');
  }
  
  console.log('Test data seeding completed');
};

exports.down = async (queryInterface) => {
  if (process.env.NODE_ENV !== 'development') {
    console.log('Test data removal skipped (not in development environment)');
    return;
  }
  
  await queryInterface.query(`DELETE FROM ratings WHERE review LIKE '%Test%'`);
  await queryInterface.query(`DELETE FROM job_billing WHERE job_id IN (SELECT id FROM jobs WHERE description LIKE '%Test Job%')`);
  await queryInterface.query(`DELETE FROM jobs WHERE description LIKE '%Test Job%'`);
  await queryInterface.query(`DELETE FROM artisan_profiles WHERE full_legal_name = 'Test Artisan'`);
  await queryInterface.query(`DELETE FROM users WHERE email = 'testartisan@example.com'`);
  await queryInterface.query(`DELETE FROM client_profiles WHERE full_legal_name = 'Test Client'`);
  await queryInterface.query(`DELETE FROM users WHERE email = 'testclient@example.com'`);
  
  console.log('Test data removed');
};