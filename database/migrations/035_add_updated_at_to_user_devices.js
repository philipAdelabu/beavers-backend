exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Add updated_at column if it doesn't exist
    ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
    
    -- Update existing rows with current timestamp
    UPDATE user_devices SET updated_at = created_at WHERE updated_at IS NULL;
    
    -- Make updated_at NOT NULL after setting initial values
    ALTER TABLE user_devices ALTER COLUMN updated_at SET NOT NULL;
    
    -- Create trigger for updated_at
    CREATE OR REPLACE FUNCTION update_user_devices_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Drop existing trigger if it exists
    DROP TRIGGER IF EXISTS update_user_devices_updated_at ON user_devices;
    
    -- Create trigger
    CREATE TRIGGER update_user_devices_updated_at 
      BEFORE UPDATE ON user_devices 
      FOR EACH ROW 
      EXECUTE FUNCTION update_user_devices_updated_at();
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TRIGGER IF EXISTS update_user_devices_updated_at ON user_devices;
    DROP FUNCTION IF EXISTS update_user_devices_updated_at();
    ALTER TABLE user_devices DROP COLUMN IF EXISTS updated_at;
  `);
};