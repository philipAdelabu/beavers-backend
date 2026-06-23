const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../config/database');
const { cacheSet, cacheGet } = require('../config/redis');
const { sendEmail, sendSMS } = require('../services/notification.service');
const { logger } = require('../config/logger');
const { sendSuccess, sendError } = require('../utils/response');
const { authenticateToken, requireRole, requirePermissions } = require('../middleware/auth.middleware');

// Stripe webhook handler
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error(`Stripe webhook signature verification failed: ${err.message}`);
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
        
      case 'charge.refunded':
        const refund = event.data.object;
        await handleRefund(refund, client);
        break;
        
      case 'customer.subscription.created':
        const subscription = event.data.object;
        await handleSubscriptionCreated(subscription, client);
        break;
        
      case 'customer.subscription.updated':
        const updatedSubscription = event.data.object;
        await handleSubscriptionUpdated(updatedSubscription, client);
        break;
        
      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object;
        await handleSubscriptionDeleted(deletedSubscription, client);
        break;
        
      default:
        logger.info(`Unhandled Stripe event type: ${event.type}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Stripe webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
});

// Paystack webhook handler
router.post('/paystack', express.json(), async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');
  
  if (hash !== signature) {
    logger.error('Paystack webhook signature verification failed');
    return res.status(401).send('Unauthorized');
  }
  
  const event = req.body;
  const client = await pool.connect();
  
  try {
    switch (event.event) {
      case 'charge.success':
        await handlePaystackChargeSuccess(event.data, client);
        break;
        
      case 'charge.dispute.create':
        await handlePaystackDisputeCreated(event.data, client);
        break;
        
      case 'charge.dispute.resolve':
        await handlePaystackDisputeResolved(event.data, client);
        break;
        
      case 'transfer.success':
        await handlePaystackTransferSuccess(event.data, client);
        break;
        
      case 'transfer.failed':
        await handlePaystackTransferFailed(event.data, client);
        break;
        
      default:
        logger.info(`Unhandled Paystack event type: ${event.event}`);
    }
    
    res.sendStatus(200);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Paystack webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
});

// Flutterwave webhook handler
router.post('/flutterwave', express.json(), async (req, res) => {
  const signature = req.headers['verif-hash'];
  
  if (signature !== process.env.FLUTTERWAVE_SECRET_HASH) {
    logger.error('Flutterwave webhook signature verification failed');
    return res.status(401).send('Unauthorized');
  }
  
  const event = req.body;
  const client = await pool.connect();
  
  try {
    switch (event.event) {
      case 'charge.completed':
        await handleFlutterwaveChargeCompleted(event.data, client);
        break;
        
      case 'transfer.completed':
        await handleFlutterwaveTransferCompleted(event.data, client);
        break;
        
      default:
        logger.info(`Unhandled Flutterwave event type: ${event.event}`);
    }
    
    res.sendStatus(200);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Flutterwave webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  } finally {
    client.release();
  }
});

// Helper functions for Stripe webhooks
async function handleSuccessfulPayment(paymentIntent, client) {
  const { metadata, id, amount, currency } = paymentIntent;
  const { jobId, clientId, billingId } = metadata;
  
  await client.query('BEGIN');
  
  // Update payment intent status
  await client.query(`
    UPDATE payment_intents 
    SET status = 'succeeded', 
        paid_at = NOW(),
        stripe_payment_intent_id = $1
    WHERE job_id = $2 AND client_id = $3
  `, [id, jobId, clientId]);
  
  // Move funds to escrow
  await client.query(`
    INSERT INTO escrow_transactions (job_id, client_id, amount, transaction_type, status, dispute_buffer_until)
    VALUES ($1, $2, $3, 'full_payment', 'held', NOW() + INTERVAL '3 days')
  `, [jobId, clientId, amount / 100]);
  
  // Release base fee immediately (non-refundable)
  await client.query(`
    UPDATE escrow_transactions 
    SET status = 'released', release_date = NOW()
    WHERE job_id = $1 AND transaction_type = 'base_fee'
  `, [jobId]);
  
  // Release materials cost immediately
  await client.query(`
    UPDATE escrow_transactions 
    SET status = 'released', release_date = NOW()
    WHERE job_id = $1 AND transaction_type = 'materials'
  `, [jobId]);
  
  // Get job details for notification
  const jobResult = await client.query(`
    SELECT j.*, cp.email as client_email, cp.phone as client_phone,
           ap.email as artisan_email, ap.phone as artisan_phone
    FROM jobs j
    JOIN client_profiles cp ON j.client_id = cp.user_id
    JOIN artisan_profiles ap ON j.artisan_id = ap.user_id
    WHERE j.id = $1
  `, [jobId]);
  
  const job = jobResult.rows[0];
  
  // Send notifications
  await sendEmail(job.client_email, 'Payment Confirmed', 
    `Your payment of ₦${(amount / 100).toLocaleString()} for job #${jobId.slice(0, 8)} has been confirmed.`);
  
  await sendSMS(job.client_phone, 
    `BeaverWorks: Payment of ₦${(amount / 100).toLocaleString()} confirmed for your job.`);
  
  await client.query('COMMIT');
  
  logger.info(`Payment successful for job ${jobId}: ${amount / 100} ${currency}`);
}

async function handleFailedPayment(paymentIntent, client) {
  const { metadata, id, last_payment_error } = paymentIntent;
  const { jobId, clientId } = metadata;
  
  await client.query(`
    UPDATE payment_intents 
    SET status = 'failed', 
        failure_reason = $1,
        failed_at = NOW()
    WHERE job_id = $2 AND client_id = $3
  `, [last_payment_error?.message, jobId, clientId]);
  
  // Get client email for notification
  const clientResult = await client.query(`
    SELECT email, phone FROM users WHERE id = $1
  `, [clientId]);
  
  if (clientResult.rows[0]) {
    await sendEmail(clientResult.rows[0].email, 'Payment Failed', 
      `Your payment for job #${jobId.slice(0, 8)} failed. Please try again.`);
    
    await sendSMS(clientResult.rows[0].phone, 
      `BeaverWorks: Payment failed for your job. Please check your payment method and try again.`);
  }
  
  logger.warn(`Payment failed for job ${jobId}: ${last_payment_error?.message}`);
}

async function handleProcessingPayment(paymentIntent, client) {
  const { metadata, id } = paymentIntent;
  const { jobId, clientId } = metadata;
  
  await client.query(`
    UPDATE payment_intents 
    SET status = 'processing'
    WHERE job_id = $1 AND client_id = $2
  `, [jobId, clientId]);
  
  logger.info(`Payment processing for job ${jobId}`);
}

async function handleRefund(refund, client) {
  const { payment_intent, amount, id } = refund;
  
  await client.query(`
    UPDATE refunds 
    SET status = 'completed', 
        transaction_id = $1,
        completed_at = NOW()
    WHERE payment_intent_id = $2
  `, [id, payment_intent]);
  
  logger.info(`Refund completed: ${id} for amount ${amount / 100}`);
}

async function handleSubscriptionCreated(subscription, client) {
  const { customer, items, status } = subscription;
  const plan = items.data[0].plan;
  
  // Find artisan by stripe customer ID
  const artisanResult = await client.query(`
    SELECT user_id FROM artisan_profiles WHERE stripe_customer_id = $1
  `, [customer]);
  
  if (artisanResult.rows[0]) {
    await client.query(`
      UPDATE artisan_profiles 
      SET monthly_fee_status = 'paid',
          stripe_subscription_id = $1,
          subscription_status = $2
      WHERE user_id = $3
    `, [subscription.id, status, artisanResult.rows[0].user_id]);
  }
  
  logger.info(`Subscription created for customer ${customer}`);
}

async function handleSubscriptionUpdated(subscription, client) {
  const { customer, status } = subscription;
  
  const artisanResult = await client.query(`
    SELECT user_id FROM artisan_profiles WHERE stripe_customer_id = $1
  `, [customer]);
  
  if (artisanResult.rows[0]) {
    await client.query(`
      UPDATE artisan_profiles 
      SET subscription_status = $1
      WHERE user_id = $2
    `, [status, artisanResult.rows[0].user_id]);
    
    if (status === 'past_due' || status === 'unpaid') {
      await client.query(`
        UPDATE artisan_profiles 
        SET monthly_fee_status = 'pending'
        WHERE user_id = $1
      `, [artisanResult.rows[0].user_id]);
    }
  }
  
  logger.info(`Subscription updated for customer ${customer}: ${status}`);
}

async function handleSubscriptionDeleted(subscription, client) {
  const { customer } = subscription;
  
  const artisanResult = await client.query(`
    SELECT user_id FROM artisan_profiles WHERE stripe_customer_id = $1
  `, [customer]);
  
  if (artisanResult.rows[0]) {
    await client.query(`
      UPDATE artisan_profiles 
      SET monthly_fee_status = 'pending',
          subscription_status = 'cancelled',
          is_available = false
      WHERE user_id = $1
    `, [artisanResult.rows[0].user_id]);
  }
  
  logger.info(`Subscription deleted for customer ${customer}`);
}

// Helper functions for Paystack webhooks
async function handlePaystackChargeSuccess(data, client) {
  const { reference, amount, metadata } = data;
  const { jobId, clientId } = metadata;
  
  await client.query('BEGIN');
  
  await client.query(`
    UPDATE payment_intents 
    SET status = 'succeeded', 
        paid_at = NOW(),
        paystack_reference = $1
    WHERE job_id = $2 AND client_id = $3
  `, [reference, jobId, clientId]);
  
  await client.query(`
    INSERT INTO escrow_transactions (job_id, client_id, amount, transaction_type, status, dispute_buffer_until)
    VALUES ($1, $2, $3, 'full_payment', 'held', NOW() + INTERVAL '3 days')
  `, [jobId, clientId, amount / 100]);
  
  await client.query(`
    UPDATE escrow_transactions 
    SET status = 'released', release_date = NOW()
    WHERE job_id = $1 AND transaction_type IN ('base_fee', 'materials')
  `, [jobId]);
  
  await client.query('COMMIT');
  
  logger.info(`Paystack charge successful for job ${jobId}: ${amount / 100} NGN`);
}

async function handlePaystackDisputeCreated(data, client) {
  const { transaction, reason } = data;
  const { reference } = transaction;
  
  const paymentResult = await client.query(`
    SELECT job_id, client_id FROM payment_intents WHERE paystack_reference = $1
  `, [reference]);
  
  if (paymentResult.rows[0]) {
    const { job_id, client_id } = paymentResult.rows[0];
    
    await client.query(`
      INSERT INTO disputes (job_id, client_id, reason, description, status)
      VALUES ($1, $2, $3, 'Payment dispute from Paystack', 'pending')
    `, [job_id, client_id, reason]);
    
    // Freeze escrow funds
    await client.query(`
      UPDATE escrow_transactions 
      SET status = 'frozen', frozen_at = NOW(), freeze_reason = 'payment_dispute'
      WHERE job_id = $1 AND status = 'held'
    `, [job_id]);
  }
  
  logger.info(`Paystack dispute created for transaction ${reference}`);
}

async function handlePaystackDisputeResolved(data, client) {
  const { transaction, resolution } = data;
  const { reference } = transaction;
  
  const paymentResult = await client.query(`
    SELECT job_id FROM payment_intents WHERE paystack_reference = $1
  `, [reference]);
  
  if (paymentResult.rows[0]) {
    const { job_id } = paymentResult.rows[0];
    
    await client.query(`
      UPDATE disputes 
      SET status = 'resolved', resolution = $1, resolved_at = NOW()
      WHERE job_id = $2 AND status = 'pending'
    `, [resolution, job_id]);
  }
  
  logger.info(`Paystack dispute resolved for transaction ${reference}`);
}

async function handlePaystackTransferSuccess(data, client) {
  const { reference, amount, recipient } = data;
  
  await client.query(`
    UPDATE artisan_payouts 
    SET status = 'completed', 
        transfer_reference = $1,
        completed_at = NOW()
    WHERE transfer_reference = $2
  `, [reference, reference]);
  
  logger.info(`Paystack transfer successful: ${reference} for amount ${amount / 100}`);
}

async function handlePaystackTransferFailed(data, client) {
  const { reference, reason } = data;
  
  await client.query(`
    UPDATE artisan_payouts 
    SET status = 'failed', 
        failure_reason = $1,
        failed_at = NOW()
    WHERE transfer_reference = $2
  `, [reason, reference]);
  
  logger.error(`Paystack transfer failed: ${reference} - ${reason}`);
}

// Helper functions for Flutterwave webhooks
async function handleFlutterwaveChargeCompleted(data, client) {
  const { tx_ref, amount, currency, status } = data;
  
  if (status === 'successful') {
    await client.query(`
      UPDATE payment_intents 
      SET status = 'succeeded', 
          paid_at = NOW(),
          flutterwave_reference = $1
      WHERE id = $2
    `, [tx_ref, tx_ref]);
    
    logger.info(`Flutterwave charge completed: ${tx_ref} for amount ${amount} ${currency}`);
  }
}

async function handleFlutterwaveTransferCompleted(data, client) {
  const { reference, amount, currency } = data;
  
  await client.query(`
    UPDATE artisan_payouts 
    SET status = 'completed', 
        completed_at = NOW()
    WHERE transfer_reference = $1
  `, [reference]);
  
  logger.info(`Flutterwave transfer completed: ${reference} for amount ${amount} ${currency}`);
}

// Generic webhook test endpoint
router.post('/test', express.json(), async (req, res) => {
  const { event, data } = req.body;
  const webhookSecret = req.headers['x-webhook-secret'];
  
  // Verify webhook secret
  if (webhookSecret !== process.env.WEBHOOK_TEST_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  
  logger.info(`Test webhook received: ${event}`, data);
  
  // Process based on event type
  switch (event) {
    case 'test.payment':
      console.log('Test payment webhook:', data);
      break;
    case 'test.job':
      console.log('Test job webhook:', data);
      break;
    default:
      console.log('Unknown test webhook event:', event);
  }
  
  sendSuccess(res, { received: true, event }, 'Webhook received successfully');
});

// Webhook status endpoint
router.get('/status', authenticateToken, requireRole(['admin']), async (req, res) => {
  const webhooks = {
    stripe: {
      configured: !!process.env.STRIPE_WEBHOOK_SECRET,
      lastEvent: await cacheGet('webhook:stripe:last'),
      status: 'active'
    },
    paystack: {
      configured: !!process.env.PAYSTACK_SECRET_KEY,
      lastEvent: await cacheGet('webhook:paystack:last'),
      status: 'active'
    },
    flutterwave: {
      configured: !!process.env.FLUTTERWAVE_SECRET_HASH,
      lastEvent: await cacheGet('webhook:flutterwave:last'),
      status: 'active'
    }
  };
  
  sendSuccess(res, webhooks, 'Webhook status retrieved');
});

module.exports = router;