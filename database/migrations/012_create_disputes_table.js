exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS disputes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id),
      client_id UUID NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      description TEXT,
      evidence TEXT[],
      status VARCHAR(50) DEFAULT 'pending',
      resolution TEXT,
      resolved_by UUID REFERENCES users(id),
      escalated BOOLEAN DEFAULT FALSE,
      escalation_reason TEXT,
      escalated_at TIMESTAMP,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS dispute_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      attachments TEXT[],
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_disputes_job_id ON disputes(job_id);
    CREATE INDEX idx_disputes_client_id ON disputes(client_id);
    CREATE INDEX idx_disputes_status ON disputes(status);
    CREATE INDEX idx_dispute_messages_dispute_id ON dispute_messages(dispute_id);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS dispute_messages CASCADE;
    DROP TABLE IF EXISTS disputes CASCADE;
  `);
};