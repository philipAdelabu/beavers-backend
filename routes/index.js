const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const clientRoutes = require('./client.routes');
const artisanRoutes = require('./artisan.routes');
const jobRoutes = require('./job.routes');
const paymentRoutes = require('./payment.routes');
const locationRoutes = require('./location.routes');
const boqRoutes = require('./boq.routes');
const warehouseRoutes = require('./warehouse.routes');
const adminRoutes = require('./admin.routes');
const notificationRoutes = require('./notification.routes');
const reviewRoutes = require('./review.routes');
const supportRoutes = require('./support.routes');
const analyticsRoutes = require('./analytics.routes');
const webhookRoutes = require('./webhook.routes');
const feeRoutes = require('./fee.routes');
const zoneRoutes = require('./zone.routes');
const trainingRoutes = require('./training.routes');


router.use('/auth', authRoutes);
router.use('/clients', clientRoutes);
router.use('/artisans', artisanRoutes);
router.use('/jobs', jobRoutes);
router.use('/fees', feeRoutes);
router.use('/payments', paymentRoutes);
router.use('/location', locationRoutes);
router.use('/boq', boqRoutes);
router.use('/warehouse', warehouseRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reviews', reviewRoutes);
router.use('/support', supportRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/zones', zoneRoutes);
router.use('/training', trainingRoutes);

module.exports = router;
