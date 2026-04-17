const express = require('express');
const StripeWebhook = require('./stripe.webhook');
const PaystackWebhook = require('./paystack.webhook');
const FlutterwaveWebhook = require('./flutterwave.webhook');
const { logger } = require('../config/logger');

const router = express.Router();

// Stripe webhook - needs raw body for signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), StripeWebhook.handleWebhook);

// Paystack webhook
router.post('/paystack', express.json(), PaystackWebhook.handleWebhook);

// Flutterwave webhook
router.post('/flutterwave', express.json(), FlutterwaveWebhook.handleWebhook);

// Test webhook endpoint
router.post('/test', express.json(), async (req, res) => {
  const webhookSecret = req.headers['x-webhook-secret'];
  
  if (webhookSecret !== process.env.WEBHOOK_TEST_SECRET) {
    logger.warn('Invalid test webhook secret');
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  
  const { event, data } = req.body;
  logger.info(`Test webhook received: ${event}`, data);
  
  res.json({ 
    success: true, 
    message: 'Webhook received successfully',
    data: { received: true, event }
  });
});

// Webhook status endpoint
router.get('/status', async (req, res) => {
  const { redis } = require('../config/redis');
  
  const webhooks = {
    stripe: {
      configured: !!process.env.STRIPE_WEBHOOK_SECRET,
      lastEvent: await redis.get('webhook:stripe:last'),
      status: 'active'
    },
    paystack: {
      configured: !!process.env.PAYSTACK_SECRET_KEY,
      lastEvent: await redis.get('webhook:paystack:last'),
      status: 'active'
    },
    flutterwave: {
      configured: !!process.env.FLUTTERWAVE_SECRET_HASH,
      lastEvent: await redis.get('webhook:flutterwave:last'),
      status: 'active'
    }
  };
  
  res.json({
    success: true,
    message: 'Webhook status retrieved successfully',
    data: webhooks,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;