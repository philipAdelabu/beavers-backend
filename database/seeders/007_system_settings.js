/**
 * Seed system settings
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  const settings = [
    {
      category: 'pricing',
      key: 'base_fee',
      value: JSON.stringify(2500)
    },
    {
      category: 'pricing',
      key: 'diagnostics_rate_per_minute',
      value: JSON.stringify(500)
    },
    {
      category: 'pricing',
      key: 'execution_rate_per_minute',
      value: JSON.stringify(1000)
    },
    {
      category: 'pricing',
      key: 'platform_commission_percent',
      value: JSON.stringify(10)
    },
    {
      category: 'pricing',
      key: 'monthly_technology_fee',
      value: JSON.stringify(5000)
    },
    {
      category: 'pricing',
      key: 'onboarding_fee',
      value: JSON.stringify(5000)
    },
    {
      category: 'pricing',
      key: 'cancellation_fee',
      value: JSON.stringify(0)
    },
    {
      category: 'pricing',
      key: 'dispute_fee',
      value: JSON.stringify(0)
    },
    {
      category: 'geofence',
      key: 'arrival_radius_meters',
      value: JSON.stringify(100)
    },
    {
      category: 'geofence',
      key: 'verification_radius_meters',
      value: JSON.stringify(50)
    },
    {
      category: 'timing',
      key: 'job_offer_expiry_seconds',
      value: JSON.stringify(120)
    },
    {
      category: 'timing',
      key: 'arrival_pin_expiry_seconds',
      value: JSON.stringify(1800)
    },
    {
      category: 'timing',
      key: 'dispute_buffer_days',
      value: JSON.stringify(3)
    },
    {
      category: 'notification',
      key: 'enable_email_notifications',
      value: JSON.stringify(true)
    },
    {
      category: 'notification',
      key: 'enable_sms_notifications',
      value: JSON.stringify(true)
    },
    {
      category: 'notification',
      key: 'enable_push_notifications',
      value: JSON.stringify(true)
    },
    {
      category: 'maintenance',
      key: 'app_version',
      value: JSON.stringify('1.0.0')
    },
    {
      category: 'maintenance',
      key: 'maintenance_mode',
      value: JSON.stringify(false)
    },
    {
      category: 'maintenance',
      key: 'force_update',
      value: JSON.stringify(false)
    },
    {
      category: 'limits',
      key: 'max_jobs_per_day',
      value: JSON.stringify(10)
    },
    {
      category: 'limits',
      key: 'max_distance_km',
      value: JSON.stringify(50)
    }
  ];
  
  for (const setting of settings) {
    const existing = await queryInterface.query(
      `SELECT id FROM system_settings WHERE category = $1 AND key = $2`,
      [setting.category, setting.key]
    );
    
    if (existing.rows.length === 0) {
      await queryInterface.query(`
        INSERT INTO system_settings (category, key, value, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
      `, [setting.category, setting.key, setting.value]);
      console.log(`Setting created: ${setting.category}.${setting.key}`);
    } else {
      console.log(`Setting already exists: ${setting.category}.${setting.key}`);
    }
  }
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`DELETE FROM system_settings WHERE category IN ('pricing', 'geofence', 'timing', 'notification', 'maintenance', 'limits')`);
  console.log('System settings removed');
};