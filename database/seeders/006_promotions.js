const { v4: uuidv4 } = require('uuid');

/**
 * Seed promotional offers
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  const promotions = [
    {
      id: uuidv4(),
      name: 'Welcome Discount',
      code: 'WELCOME20',
      type: 'percentage',
      value: 20,
      start_date: new Date(),
      end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      max_uses: 1000,
      user_type: 'client',
      is_new_users_only: true,
      min_spend: 5000,
      max_discount: 10000,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'First Job Bonus',
      code: 'FIRSTJOB10',
      type: 'percentage',
      value: 10,
      start_date: new Date(),
      end_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months
      max_uses: 500,
      user_type: 'client',
      is_new_users_only: true,
      min_spend: 2000,
      max_discount: 5000,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Festive Season Special',
      code: 'FESTIVE15',
      type: 'percentage',
      value: 15,
      start_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 1 month from now
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months from now
      max_uses: 2000,
      user_type: null,
      is_new_users_only: false,
      min_spend: 10000,
      max_discount: 15000,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Emergency Service Discount',
      code: 'EMERGENCY10',
      type: 'percentage',
      value: 10,
      start_date: new Date(),
      end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      max_uses: 500,
      user_type: 'client',
      is_new_users_only: false,
      min_spend: 3000,
      max_discount: 3000,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Referral Bonus',
      code: 'REFER5000',
      type: 'fixed',
      value: 5000,
      start_date: new Date(),
      end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      max_uses: 100,
      user_type: 'client',
      is_new_users_only: false,
      min_spend: 15000,
      max_discount: 5000,
      is_active: true
    },
    {
      id: uuidv4(),
      name: 'Artisan Onboarding Discount',
      code: 'ARTISAN50',
      type: 'percentage',
      value: 50,
      start_date: new Date(),
      end_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      max_uses: 200,
      user_type: 'artisan',
      is_new_users_only: true,
      min_spend: null,
      max_discount: 2500,
      is_active: true
    }
  ];
  
  for (const promotion of promotions) {
    const existing = await queryInterface.query(
      `SELECT id FROM promotions WHERE code = $1`,
      [promotion.code]
    );
    
    if (existing.rows.length === 0) {
      await queryInterface.query(`
        INSERT INTO promotions (id, name, code, type, value, start_date, end_date, max_uses, user_type, is_new_users_only, min_spend, max_discount, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      `, [
        promotion.id, promotion.name, promotion.code, promotion.type,
        promotion.value, promotion.start_date, promotion.end_date,
        promotion.max_uses, promotion.user_type, promotion.is_new_users_only,
        promotion.min_spend, promotion.max_discount, promotion.is_active
      ]);
      console.log(`Promotion created: ${promotion.name} (${promotion.code})`);
    } else {
      console.log(`Promotion already exists: ${promotion.code}`);
    }
  }
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`DELETE FROM promotions WHERE code IN ('WELCOME20', 'FIRSTJOB10', 'FESTIVE15', 'EMERGENCY10', 'REFER5000', 'ARTISAN50')`);
  console.log('Promotions removed');
};