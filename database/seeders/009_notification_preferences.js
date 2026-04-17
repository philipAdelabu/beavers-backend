/**
 * Seed default notification preferences for existing users
 * @param {Object} queryInterface - Database query interface
 * @returns {Promise<void>}
 */
exports.up = async (queryInterface) => {
  // Get all users without notification preferences
  const users = await queryInterface.query(`
    SELECT u.id FROM users u
    LEFT JOIN notification_preferences np ON u.id = np.user_id
    WHERE np.id IS NULL
  `);
  
  for (const user of users.rows) {
    await queryInterface.query(`
      INSERT INTO notification_preferences (user_id, email_enabled, sms_enabled, push_enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [user.id, true, true, true]);
    console.log(`Notification preferences created for user: ${user.id}`);
  }
  
  if (users.rows.length === 0) {
    console.log('All users already have notification preferences');
  }
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`DELETE FROM notification_preferences`);
  console.log('Notification preferences removed');
};