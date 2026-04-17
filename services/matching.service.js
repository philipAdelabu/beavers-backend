const { pool } = require('../config/database');
const { getNearbyArtisans, cacheSet, cacheGet } = require('../config/redis');
const { logger } = require('../config/logger');

class MatchingService {
  static async findBestMatches(jobId, jobData) {
    const { category, location, serviceType, clientId } = jobData;
    
    // Get nearby artisans
    const nearbyArtisans = await getNearbyArtisans(location.longitude, location.latitude, 15);
    
    if (nearbyArtisans.length === 0) {
      return [];
    }
    
    const artisanIds = nearbyArtisans.map(([id]) => id);
    
    // Get artisan details from database
    const artisans = await pool.query(
      `SELECT ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, 
              ap.star_rating, ap.completion_rate, ap.trust_score,
              ap.total_ratings, ap.monthly_fee_status,
              u.is_active
       FROM artisan_profiles ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.user_id = ANY($1::uuid[])
         AND ap.is_available = true
         AND u.is_active = true
         AND ap.monthly_fee_status = 'paid'
         AND ap.skill_category = $2
       ORDER BY ap.tier_level DESC, ap.star_rating DESC`,
      [artisanIds, category]
    );
    
    // Calculate match scores
    const matches = artisans.rows.map(artisan => {
      const distance = nearbyArtisans.find(([id]) => id === artisan.user_id)[1];
      const score = this.calculateMatchScore(artisan, parseFloat(distance), serviceType);
      
      return {
        artisan,
        distance: parseFloat(distance),
        score,
        eta: this.calculateETA(parseFloat(distance))
      };
    });
    
    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    
    // Cache matches for this job
    await cacheSet(`job:matches:${jobId}`, matches, 300); // 5 minutes
    
    return matches;
  }
  
  static calculateMatchScore(artisan, distance, serviceType) {
    // Weights for different factors
    const weights = {
      tier: 0.30,
      rating: 0.25,
      distance: 0.20,
      completionRate: 0.15,
      trustScore: 0.10
    };
    
    // Adjust weights for emergency jobs
    if (serviceType === 'emergency') {
      weights.distance = 0.35;
      weights.tier = 0.20;
      weights.rating = 0.20;
      weights.completionRate = 0.15;
      weights.trustScore = 0.10;
    }
    
    // Calculate individual scores (0-100)
    const tierScore = (artisan.tier_level / 3) * 100;
    const ratingScore = (artisan.star_rating / 5) * 100;
    const distanceScore = Math.max(0, 100 - (distance / 10) * 100); // 0km = 100, 10km = 0
    const completionScore = artisan.completion_rate;
    const trustScore = artisan.trust_score;
    
    // Calculate weighted score
    const score = 
      (tierScore * weights.tier) +
      (ratingScore * weights.rating) +
      (distanceScore * weights.distance) +
      (completionScore * weights.completionRate) +
      (trustScore * weights.trustScore);
    
    return Math.round(score);
  }
  
  static calculateETA(distanceKm) {
    // Average speeds for different distances
    let speedKmh = 30; // Default city speed
    
    if (distanceKm < 2) {
      speedKmh = 20; // Short distances, traffic lights
    } else if (distanceKm > 10) {
      speedKmh = 50; // Longer distances, highway
    }
    
    const etaMinutes = Math.ceil((distanceKm / speedKmh) * 60);
    
    return {
      minutes: etaMinutes,
      formatted: `${etaMinutes} min`,
      estimatedArrival: new Date(Date.now() + etaMinutes * 60000).toISOString()
    };
  }
  
  static async getTopMatches(jobId, limit = 5) {
    // Check cache first
    let matches = await cacheGet(`job:matches:${jobId}`);
    
    if (!matches) {
      // Get job details
      const jobResult = await pool.query(
        `SELECT category, location, service_type, client_id FROM jobs WHERE id = $1`,
        [jobId]
      );
      
      if (jobResult.rows.length === 0) {
        return [];
      }
      
      const job = jobResult.rows[0];
      matches = await this.findBestMatches(jobId, job);
    }
    
    return matches.slice(0, limit);
  }
  
  static async sendJobOffers(jobId, matches) {
    const offers = [];
    
    for (const match of matches.slice(0, 5)) {
      const offerResult = await pool.query(
        `INSERT INTO job_offers (job_id, artisan_id, status, expires_at, match_score, distance)
         VALUES ($1, $2, 'pending', NOW() + INTERVAL '2 minutes', $3, $4)
         RETURNING *`,
        [jobId, match.artisan.user_id, match.score, match.distance]
      );
      
      offers.push({
        ...offerResult.rows[0],
        artisan: match.artisan,
        eta: match.eta
      });
    }
    
    return offers;
  }
  
  static async handleOfferResponse(jobId, artisanId, accept, responseTime) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const offerResult = await client.query(
        `SELECT * FROM job_offers 
         WHERE job_id = $1 AND artisan_id = $2 AND status = 'pending'
         FOR UPDATE`,
        [jobId, artisanId]
      );
      
      if (offerResult.rows.length === 0) {
        throw new Error('Offer not found or already expired');
      }
      
      const offer = offerResult.rows[0];
      
      if (offer.expires_at < new Date()) {
        throw new Error('Offer has expired');
      }
      
      if (accept) {
        // Accept the offer
        await client.query(
          `UPDATE job_offers SET status = 'accepted', responded_at = NOW(), response_time = $3
           WHERE job_id = $1 AND artisan_id = $2`,
          [jobId, artisanId, responseTime]
        );
        
        // Reject all other offers for this job
        await client.query(
          `UPDATE job_offers SET status = 'rejected', responded_at = NOW()
           WHERE job_id = $1 AND artisan_id != $2 AND status = 'pending'`,
          [jobId, artisanId]
        );
        
        // Update job with selected artisan
        await client.query(
          `UPDATE jobs SET artisan_id = $1, job_status = 'accepted', accepted_at = NOW()
           WHERE id = $2`,
          [artisanId, jobId]
        );
        
        // Set artisan as unavailable
        await client.query(
          `UPDATE artisan_profiles SET is_available = false WHERE user_id = $1`,
          [artisanId]
        );
      } else {
        // Reject the offer
        await client.query(
          `UPDATE job_offers SET status = 'rejected', responded_at = NOW(), response_time = $3
           WHERE job_id = $1 AND artisan_id = $2`,
          [jobId, artisanId, responseTime]
        );
        
        // Check if there are any pending offers left
        const pendingCount = await client.query(
          `SELECT COUNT(*) FROM job_offers 
           WHERE job_id = $1 AND status = 'pending'`,
          [jobId]
        );
        
        if (parseInt(pendingCount.rows[0].count) === 0) {
          // No artisans accepted, resend offers to next batch
          await this.resendOffers(jobId, client);
        }
      }
      
      await client.query('COMMIT');
      
      return { accepted: accept };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  static async resendOffers(jobId, client) {
    // Get job details
    const jobResult = await client.query(
      `SELECT category, location, service_type, client_id FROM jobs WHERE id = $1`,
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      return;
    }
    
    const job = jobResult.rows[0];
    
    // Get previously offered artisans
    const offeredArtisans = await client.query(
      `SELECT artisan_id FROM job_offers WHERE job_id = $1`,
      [jobId]
    );
    
    const excludedIds = offeredArtisans.rows.map(row => row.artisan_id);
    
    // Find next batch of artisans
    const nearbyArtisans = await getNearbyArtisans(job.location.longitude, job.location.latitude, 15);
    
    const newArtisanIds = nearbyArtisans
      .map(([id]) => id)
      .filter(id => !excludedIds.includes(id))
      .slice(0, 5);
    
    if (newArtisanIds.length === 0) {
      // No more artisans available, mark job as failed
      await client.query(
        `UPDATE jobs SET job_status = 'failed_matching' WHERE id = $1`,
        [jobId]
      );
      return;
    }
    
    // Get artisan details
    const artisans = await client.query(
      `SELECT ap.user_id, ap.full_legal_name, ap.skill_category, ap.tier_level, 
              ap.star_rating, ap.completion_rate
       FROM artisan_profiles ap
       WHERE ap.user_id = ANY($1::uuid[]) AND ap.is_available = true`,
      [newArtisanIds]
    );
    
    // Create new offers
    for (const artisan of artisans.rows) {
      const distance = nearbyArtisans.find(([id]) => id === artisan.user_id)[1];
      const score = this.calculateMatchScore(artisan, parseFloat(distance), job.service_type);
      
      await client.query(
        `INSERT INTO job_offers (job_id, artisan_id, status, expires_at, match_score, distance, is_resend)
         VALUES ($1, $2, 'pending', NOW() + INTERVAL '2 minutes', $3, $4, true)
         RETURNING *`,
        [jobId, artisan.user_id, score, distance]
      );
    }
  }
  
  static async getMatchingStats() {
    const stats = await pool.query(`
      SELECT 
        AVG(match_score) as avg_match_score,
        AVG(response_time) as avg_response_time,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_offers,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_offers,
        COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_offers,
        AVG(distance) as avg_distance
      FROM job_offers
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);
    
    const tierDistribution = await pool.query(`
      SELECT 
        ap.tier_level,
        COUNT(jo.id) as offers_sent,
        COUNT(CASE WHEN jo.status = 'accepted' THEN 1 END) as offers_accepted
      FROM job_offers jo
      JOIN artisan_profiles ap ON jo.artisan_id = ap.user_id
      WHERE jo.created_at > NOW() - INTERVAL '7 days'
      GROUP BY ap.tier_level
      ORDER BY ap.tier_level ASC
    `);
    
    return {
      overall: stats.rows[0],
      byTier: tierDistribution.rows
    };
  }
  
  static async updateArtisanPriority(artisanId) {
    // Calculate priority score based on recent performance
    const result = await pool.query(`
      SELECT 
        star_rating,
        completion_rate,
        trust_score,
        tier_level,
        (SELECT COUNT(*) FROM jobs WHERE artisan_id = $1 AND job_status = 'completed' AND created_at > NOW() - INTERVAL '30 days') as recent_completions,
        (SELECT AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))) FROM jobs WHERE artisan_id = $1 AND accepted_at IS NOT NULL AND created_at > NOW() - INTERVAL '30 days') as avg_response_time
      FROM artisan_profiles
      WHERE user_id = $1
    `, [artisanId]);
    
    if (result.rows.length === 0) {
      return;
    }
    
    const data = result.rows[0];
    
    // Calculate priority score (0-1000)
    let score = 0;
    score += data.tier_level * 200;
    score += data.star_rating * 100;
    score += (data.completion_rate / 100) * 200;
    score += (data.trust_score / 100) * 150;
    score += Math.min(data.recent_completions * 10, 150);
    
    // Response time bonus (faster is better)
    if (data.avg_response_time) {
      const responseBonus = Math.max(0, 100 - (data.avg_response_time / 60) * 10);
      score += responseBonus;
    }
    
    // Update priority score in Redis for fast matching
    await cacheSet(`artisan:priority:${artisanId}`, Math.round(score), 3600);
    
    return Math.round(score);
  }
}

module.exports = MatchingService;