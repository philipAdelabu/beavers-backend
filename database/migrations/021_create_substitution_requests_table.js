exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS substitution_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      boq_id UUID NOT NULL REFERENCES bill_of_quantities(id),
      item_index INTEGER NOT NULL,
      alternative_item JSONB NOT NULL,
      reason TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      rejection_reason TEXT,
      approved_by UUID REFERENCES users(id),
      approved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID NOT NULL REFERENCES jobs(id),
      sender_id UUID NOT NULL REFERENCES users(id),
      message TEXT,
      attachments TEXT[],
      read_at TIMESTAMP,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_substitution_requests_boq_id ON substitution_requests(boq_id);
    CREATE INDEX idx_chat_messages_job_id ON chat_messages(job_id);
    CREATE INDEX idx_chat_messages_sender_id ON chat_messages(sender_id);
    CREATE INDEX idx_chat_messages_sent_at ON chat_messages(sent_at);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS chat_messages CASCADE;
    DROP TABLE IF EXISTS substitution_requests CASCADE;
  `);
};