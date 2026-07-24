const express = require('express');
const router = express.Router();
const { body, param, query} = require('express-validator');
const AdminController = require('../controllers/admin.controller');
const TrainingController = require('../controllers/training.controller');
const { authenticateToken, requireRole, requirePermissions } = require('../middleware/auth.middleware');
const { adminLimiter } = require('../middleware/rateLimit.middleware');
const NotificationController = require('../controllers/notification.controller');
const WalletController = require('../controllers/wallet.controller');


router.use(authenticateToken);

// Get enrollment details
router.post('/add-fund/users/:userId', [
  param('userId').isUUID(), 
  body('amount').notEmpty().isNumeric(),
], WalletController.fundWallet);

router.post('/cashout-fund/users/:userId', [
  param('userId').isUUID(),
  body('amount').notEmpty().isNumeric()
], WalletController.cashoutFund);

router.get('/balance/:userId',[
     param('userId').isUUID(), 
], WalletController.getBalance);

router.get('/:userId/history',[
     param('userId').isUUID(), 
], WalletController.getWalletHistory);

router.get('/list/banks', WalletController.getBankList);


module.exports = router;