exports.up = async (queryInterface) => {
  await queryInterface.query(`
    -- Add missing foreign key constraints
    ALTER TABLE job_billing 
      ADD CONSTRAINT fk_job_billing_job 
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
    
    ALTER TABLE bill_of_quantities 
      ADD CONSTRAINT fk_boq_job 
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
    
    ALTER TABLE bill_of_quantities 
      ADD CONSTRAINT fk_boq_artisan 
      FOREIGN KEY (artisan_id) REFERENCES users(id);
    
    ALTER TABLE job_offers 
      ADD CONSTRAINT fk_job_offers_job 
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
    
    ALTER TABLE job_offers 
      ADD CONSTRAINT fk_job_offers_artisan 
      FOREIGN KEY (artisan_id) REFERENCES users(id);
    
    ALTER TABLE arrival_pins 
      ADD CONSTRAINT fk_arrival_pins_job 
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
    
    ALTER TABLE job_timeline 
      ADD CONSTRAINT fk_job_timeline_job 
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
    
    ALTER TABLE disputes 
      ADD CONSTRAINT fk_disputes_job 
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
    
    ALTER TABLE dispute_messages 
      ADD CONSTRAINT fk_dispute_messages_dispute 
      FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE;
    
    ALTER TABLE escrow_transactions 
      ADD CONSTRAINT fk_escrow_job 
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
    
    ALTER TABLE artisan_payouts 
      ADD CONSTRAINT fk_artisan_payouts_job 
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
    
    ALTER TABLE notifications 
      ADD CONSTRAINT fk_notifications_user 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    
    ALTER TABLE user_devices 
      ADD CONSTRAINT fk_user_devices_user 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    
    ALTER TABLE location_history 
      ADD CONSTRAINT fk_location_history_artisan 
      FOREIGN KEY (artisan_id) REFERENCES users(id) ON DELETE CASCADE;
    
    ALTER TABLE location_history 
      ADD CONSTRAINT fk_location_history_job 
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    ALTER TABLE job_billing DROP CONSTRAINT IF EXISTS fk_job_billing_job;
    ALTER TABLE bill_of_quantities DROP CONSTRAINT IF EXISTS fk_boq_job;
    ALTER TABLE bill_of_quantities DROP CONSTRAINT IF EXISTS fk_boq_artisan;
    ALTER TABLE job_offers DROP CONSTRAINT IF EXISTS fk_job_offers_job;
    ALTER TABLE job_offers DROP CONSTRAINT IF EXISTS fk_job_offers_artisan;
    ALTER TABLE arrival_pins DROP CONSTRAINT IF EXISTS fk_arrival_pins_job;
    ALTER TABLE job_timeline DROP CONSTRAINT IF EXISTS fk_job_timeline_job;
    ALTER TABLE disputes DROP CONSTRAINT IF EXISTS fk_disputes_job;
    ALTER TABLE dispute_messages DROP CONSTRAINT IF EXISTS fk_dispute_messages_dispute;
    ALTER TABLE escrow_transactions DROP CONSTRAINT IF EXISTS fk_escrow_job;
    ALTER TABLE artisan_payouts DROP CONSTRAINT IF EXISTS fk_artisan_payouts_job;
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_user;
    ALTER TABLE user_devices DROP CONSTRAINT IF EXISTS fk_user_devices_user;
    ALTER TABLE location_history DROP CONSTRAINT IF EXISTS fk_location_history_artisan;
    ALTER TABLE location_history DROP CONSTRAINT IF EXISTS fk_location_history_job;
  `);
};