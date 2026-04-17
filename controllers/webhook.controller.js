const PaymentService = require('../services/payment.service');
const { sendSuccess, sendError } = require('../utils/response');
const { logger } = require('../config/logger');
const crypto = require('crypto');

class WebhookController {
  static async stripeWebhook(req, res, next) {
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
    
    try {
      await PaymentService.processWebhook(event);
      res.json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  static async paystackWebhook(req, res, next) {
    const signature = req.headers['x-paystack-signature'];
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (hash !== signature) {
      logger.error('Paystack webhook signature verification failed');
      return res.status(401).send('Unauthorized');
    }
    
    const event = req.body;
    
    try {
      await PaymentService.processPaystackWebhook(event);
      res.sendStatus(200);
    } catch (error) {
      logger.error('Paystack webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  static async flutterwaveWebhook(req, res, next) {
    const signature = req.headers['verif-hash'];
    
    if (signature !== process.env.FLUTTERWAVE_SECRET_HASH) {
      logger.error('Flutterwave webhook signature verification failed');
      return res.status(401).send('Unauthorized');
    }
    
    const event = req.body;
    
    try {
      await PaymentService.processFlutterwaveWebhook(event);
      res.sendStatus(200);
    } catch (error) {
      logger.error('Flutterwave webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  static async testWebhook(req, res, next) {
    const { event, data } = req.body;
    const webhookSecret = req.headers['x-webhook-secret'];
    
    if (webhookSecret !== process.env.WEBHOOK_TEST_SECRET) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
    
    logger.info(`Test webhook received: ${event}`, data);
    
    sendSuccess(res, { received: true, event }, 'Webhook received successfully');
  }

  static async getWebhookStatus(req, res, next) {
    const webhooks = {
      stripe: {
        configured: !!process.env.STRIPE_WEBHOOK_SECRET,
        lastEvent: await PaymentService.getLastWebhookEvent('stripe'),
        status: 'active'
      },
      paystack: {
        configured: !!process.env.PAYSTACK_SECRET_KEY,
        lastEvent: await PaymentService.getLastWebhookEvent('paystack'),
        status: 'active'
      },
      flutterwave: {
        configured: !!process.env.FLUTTERWAVE_SECRET_HASH,
        lastEvent: await PaymentService.getLastWebhookEvent('flutterwave'),
        status: 'active'
      }
    };
    
    sendSuccess(res, webhooks, 'Webhook status retrieved successfully');
  }
}

module.exports = WebhookController;