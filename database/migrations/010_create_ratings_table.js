exports.up = async (queryInterface) => {
  await queryInterface.query(`
    CREATE TABLE IF NOT EXISTS ratings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      reviewer_id UUID NOT NULL REFERENCES users(id),
      reviewee_id UUID NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      review TEXT,
      categories JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_ratings_reviewee_id ON ratings(reviewee_id);
    CREATE INDEX idx_ratings_reviewer_id ON ratings(reviewer_id);
    CREATE INDEX idx_ratings_job_id ON ratings(job_id);
    CREATE INDEX idx_ratings_rating ON ratings(rating);
    CREATE INDEX idx_ratings_created_at ON ratings(created_at);
  `);
};

exports.down = async (queryInterface) => {
  await queryInterface.query(`
    DROP TABLE IF EXISTS ratings CASCADE;
  `);
};