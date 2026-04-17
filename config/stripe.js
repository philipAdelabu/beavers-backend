const Stripe = require('stripe');
const { logger } = require('./logger');

let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
    maxNetworkRetries: 3,
    timeout: 30000,
    appInfo: {
      name: 'BeaverWorks',
      version: '1.0.0',
      url: 'https://beaverworks.com'
    }
  });
  logger.info('Stripe initialized');
} else {
  logger.warn('Stripe secret key not found. Stripe features disabled.');
}

/**
 * Create a payment intent
 * @param {Object} params - Payment intent parameters
 * @returns {Promise<Object>} Payment intent
 */
const createPaymentIntent = async (params) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.paymentIntents.create(params);
  } catch (error) {
    logger.error('Create payment intent error:', error);
    throw error;
  }
};

/**
 * Retrieve a payment intent
 * @param {string} paymentIntentId - Payment intent ID
 * @returns {Promise<Object>} Payment intent
 */
const retrievePaymentIntent = async (paymentIntentId) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    logger.error('Retrieve payment intent error:', error);
    throw error;
  }
};

/**
 * Update a payment intent
 * @param {string} paymentIntentId - Payment intent ID
 * @param {Object} params - Update parameters
 * @returns {Promise<Object>} Updated payment intent
 */
const updatePaymentIntent = async (paymentIntentId, params) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.paymentIntents.update(paymentIntentId, params);
  } catch (error) {
    logger.error('Update payment intent error:', error);
    throw error;
  }
};

/**
 * Confirm a payment intent
 * @param {string} paymentIntentId - Payment intent ID
 * @param {Object} params - Confirmation parameters
 * @returns {Promise<Object>} Confirmed payment intent
 */
const confirmPaymentIntent = async (paymentIntentId, params = {}) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.paymentIntents.confirm(paymentIntentId, params);
  } catch (error) {
    logger.error('Confirm payment intent error:', error);
    throw error;
  }
};

/**
 * Cancel a payment intent
 * @param {string} paymentIntentId - Payment intent ID
 * @returns {Promise<Object>} Cancelled payment intent
 */
const cancelPaymentIntent = async (paymentIntentId) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (error) {
    logger.error('Cancel payment intent error:', error);
    throw error;
  }
};

/**
 * Create a refund
 * @param {Object} params - Refund parameters
 * @returns {Promise<Object>} Refund object
 */
const createRefund = async (params) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.refunds.create(params);
  } catch (error) {
    logger.error('Create refund error:', error);
    throw error;
  }
};

/**
 * Create a customer
 * @param {Object} params - Customer parameters
 * @returns {Promise<Object>} Customer object
 */
const createCustomer = async (params) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.customers.create(params);
  } catch (error) {
    logger.error('Create customer error:', error);
    throw error;
  }
};

/**
 * Retrieve a customer
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>} Customer object
 */
const retrieveCustomer = async (customerId) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.customers.retrieve(customerId);
  } catch (error) {
    logger.error('Retrieve customer error:', error);
    throw error;
  }
};

/**
 * Attach payment method to customer
 * @param {string} paymentMethodId - Payment method ID
 * @param {string} customerId - Customer ID
 * @returns {Promise<Object>} Attached payment method
 */
const attachPaymentMethod = async (paymentMethodId, customerId) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId
    });
  } catch (error) {
    logger.error('Attach payment method error:', error);
    throw error;
  }
};

/**
 * Detach payment method
 * @param {string} paymentMethodId - Payment method ID
 * @returns {Promise<Object>} Detached payment method
 */
const detachPaymentMethod = async (paymentMethodId) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.paymentMethods.detach(paymentMethodId);
  } catch (error) {
    logger.error('Detach payment method error:', error);
    throw error;
  }
};

/**
 * List customer payment methods
 * @param {string} customerId - Customer ID
 * @param {string} type - Payment method type
 * @returns {Promise<Array>} List of payment methods
 */
const listPaymentMethods = async (customerId, type = 'card') => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    const methods = await stripe.paymentMethods.list({
      customer: customerId,
      type: type
    });
    return methods.data;
  } catch (error) {
    logger.error('List payment methods error:', error);
    return [];
  }
};

/**
 * Create a subscription
 * @param {Object} params - Subscription parameters
 * @returns {Promise<Object>} Subscription object
 */
const createSubscription = async (params) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.subscriptions.create(params);
  } catch (error) {
    logger.error('Create subscription error:', error);
    throw error;
  }
};

/**
 * Cancel a subscription
 * @param {string} subscriptionId - Subscription ID
 * @returns {Promise<Object>} Cancelled subscription
 */
const cancelSubscription = async (subscriptionId) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return await stripe.subscriptions.cancel(subscriptionId);
  } catch (error) {
    logger.error('Cancel subscription error:', error);
    throw error;
  }
};

/**
 * Construct webhook event
 * @param {Buffer} payload - Request body
 * @param {string} signature - Stripe signature header
 * @param {string} secret - Webhook secret
 * @returns {Object} Webhook event
 */
const constructWebhookEvent = (payload, signature, secret) => {
  if (!stripe) throw new Error('Stripe not configured');
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    logger.error('Webhook construction error:', error);
    throw error;
  }
};

module.exports = {
  stripe,
  createPaymentIntent,
  retrievePaymentIntent,
  updatePaymentIntent,
  confirmPaymentIntent,
  cancelPaymentIntent,
  createRefund,
  createCustomer,
  retrieveCustomer,
  attachPaymentMethod,
  detachPaymentMethod,
  listPaymentMethods,
  createSubscription,
  cancelSubscription,
  constructWebhookEvent
};