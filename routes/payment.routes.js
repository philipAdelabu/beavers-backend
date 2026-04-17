// routes/payment.routes.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const { cacheSet, cacheGet } = require('../config/redis');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Initialize payment for job
router.post('/initialize/:jobId', authenticateToken, requireRole(['client']), async (req, res) => {
  const { jobId } = req.params;
  const clientId = req.user.id;

  const client = await pool.connect();
  try {
    // Get job billing details
    const billingResult = await client.query(
      `SELECT jb.*, j.client_id, j.artisan_id
       FROM job_billing jb
       JOIN jobs j ON jb.job_id = j.id
       WHERE jb.job_id = $1 AND j.client_id = $2`,
      [jobId, clientId]
    );

    if (billingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job billing not found' });
    }

    const billing = billingResult.rows[0];
    const totalAmount = (billing.base_fee || 0) + 
                       (billing.diagnostics_fee || 0) + 
                       (billing.execution_fee || 0) + 
                       (billing.materials_cost || 0) + 
                       (billing.workmanship_cost || 0);

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to kobo/cents
      currency: 'ngn',
      metadata: {
        jobId: jobId,
        clientId: clientId,
        billingId: billing.id
      },
      payment_method_types: ['card', 'bank_transfer']
    });

    // Store payment intent in database
    await client.query(
      `INSERT INTO payment_intents (job_id, payment_intent_id, client_secret, amount, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [jobId, paymentIntent.id, paymentIntent.client_secret, totalAmount, 'pending']
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: totalAmount
    });
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize payment' });
  } finally {
    client.release();
  }
});

// Webhook for Stripe events
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const client = await pool.connect();
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        await handleSuccessfulPayment(paymentIntent, client);
        break;
      
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        await handleFailedPayment(failedPayment, client);
        break;
      
      case 'payment_intent.processing':
        const processingPayment = event.data.object;
        await handleProcessingPayment(processingPayment, client);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
});

async function handleSuccessfulPayment(paymentIntent, client) {
  const { jobId, clientId, billingId } = paymentIntent.metadata;

  // Update payment intent status
  await client.query(
    `UPDATE payment_intents 
     SET status = 'succeeded', paid_at = NOW()
     WHERE payment_intent_id = $1`,
    [paymentIntent.id]
  );

  // Move funds to escrow
  await client.query(
    `INSERT INTO escrow_transactions (job_id, client_id, amount, transaction_type, status, dispute_buffer_until)
     VALUES ($1, $2, $3, 'full_payment', 'held', NOW() + INTERVAL '3 days')`,
    [jobId, clientId, paymentIntent.amount / 100]
  );

  // Release base fee immediately
  await client.query(
    `UPDATE escrow_transactions 
     SET status = 'released', release_date = NOW()
     WHERE job_id = $1 AND transaction_type = 'base_fee'`,
    [jobId]
  );

  // Release materials cost immediately
  await client.query(
    `UPDATE escrow_transactions 
     SET status = 'released', release_date = NOW()
     WHERE job_id = $1 AND transaction_type = 'materials'`,
    [jobId]
  );
}

async function handleFailedPayment(paymentIntent, client) {
  await client.query(
    `UPDATE payment_intents 
     SET status = 'failed', failure_reason = $1
     WHERE payment_intent_id = $2`,
    [paymentIntent.last_payment_error?.message, paymentIntent.id]
  );
}

async function handleProcessingPayment(paymentIntent, client) {
  await client.query(
    `UPDATE payment_intents 
     SET status = 'processing'
     WHERE payment_intent_id = $1`,
    [paymentIntent.id]
  );
}

// Release escrow funds to artisan
router.post('/release-funds/:jobId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { jobId } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if dispute buffer has passed
    const escrowResult = await client.query(
      `SELECT * FROM escrow_transactions 
       WHERE job_id = $1 AND status = 'held'
       AND dispute_buffer_until < NOW()`,
      [jobId]
    );

    if (escrowResult.rows.length === 0) {
      return res.status(400).json({ error: 'No funds available for release or dispute buffer not passed' });
    }

    // Release workmanship payment
    await client.query(
      `UPDATE escrow_transactions 
       SET status = 'released', release_date = NOW()
       WHERE job_id = $1 AND transaction_type = 'workmanship'`,
      [jobId]
    );

    // Create payout record
    await client.query(
      `INSERT INTO artisan_payouts (job_id, artisan_id, amount, status)
       SELECT $1, artisan_id, workmanship_cost, 'pending'
       FROM jobs j
       JOIN job_billing jb ON j.id = jb.job_id
       WHERE j.id = $1`,
      [jobId]
    );

    await client.query('COMMIT');

    res.json({ message: 'Funds released successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Release funds error:', error);
    res.status(500).json({ error: 'Failed to release funds' });
  } finally {
    client.release();
  }
});

// Dispute a payment
router.post('/dispute/:jobId', authenticateToken, requireRole(['client']), [
  body('reason').notEmpty(),
  body('description').notEmpty()
], async (req, res) => {
  const { jobId } = req.params;
  const { reason, description } = req.body;
  const clientId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create dispute record
    await client.query(
      `INSERT INTO disputes (job_id, client_id, reason, description, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [jobId, clientId, reason, description]
    );

    // Freeze escrow funds
    await client.query(
      `UPDATE escrow_transactions 
       SET status = 'frozen', frozen_at = NOW()
       WHERE job_id = $1 AND status = 'held'`,
      [jobId]
    );

    await client.query('COMMIT');

    // Notify admin
    // (Implement admin notification)

    res.json({ message: 'Dispute filed successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Dispute creation error:', error);
    res.status(500).json({ error: 'Failed to file dispute' });
  } finally {
    client.release();
  }
});

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10 } = req.query;

  try {
    let query;
    let params;

    if (req.user.user_type === 'client') {
      query = `
        SELECT pi.*, j.category, j.service_type, j.job_status
        FROM payment_intents pi
        JOIN jobs j ON pi.job_id = j.id
        WHERE j.client_id = $1
        ORDER BY pi.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [userId, limit, (page - 1) * limit];
    } else if (req.user.user_type === 'artisan') {
      query = `
        SELECT ap.*, j.category, j.service_type, j.job_status
        FROM artisan_payouts ap
        JOIN jobs j ON ap.job_id = j.id
        WHERE j.artisan_id = $1
        ORDER BY ap.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [userId, limit, (page - 1) * limit];
    } else {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(query, params);
    res.json({
      transactions: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ error: 'Failed to get payment history' });
  }
});

module.exports = router;