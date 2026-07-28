 const { validationResult } = require('express-validator');
const PaymentService = require('../services/payment.service');
const EscrowService = require('../services/escrow.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const WalletService = require('../services/wallet.service');

class WalletController {

      static async fundWallet(req, res, next){
            const errors = validationResult(req);
        if (!errors.isEmpty()) {
        return sendError(res, 'Validation error', 400, errors.array());
        }

         try {
               const { userId } = req.params;
              const { amount } = req.body;
               const ipAddress = req.ip;
               const userAgent = req.get('user-agent');
               const result = await WalletService.fundWallet(userId, amount,  {ipAddress, userAgent} );
              sendSuccess(res, result, 'Fund added successfully');
            } catch (error) {
                  sendError(res, error.message || 'Failed to fund wallet', error.statusCode || 500);
                  next(error);
            }

      }

      static async cashoutFund(req, res, next){
            const errors = validationResult(req);
        if (!errors.isEmpty()) {
        return sendError(res, 'Validation error', 400, errors.array());
        }

       try {
              const userId = req.user.id;

              const { amount, bankCode, accountNumber, bankName, accountName } = req.body;
                
               const ipAddress = req.ip;
               const userAgent = req.get('user-agent');
               const result = await WalletService.initiateTransfer(bankCode, accountNumber, bankName, accountName, userId, amount, {ipAddress, userAgent});
              sendSuccess(res, result, 'Fund cashout successfully');
            } catch (error) {
                  sendError(res, error.message || 'Failed to cashout fund', error.statusCode || 500);
                  next(error);
            }
      }

        static async getBankList(req, res, next){
       try {
              const result = await WalletService.getBankList();
              sendSuccess(res, result, 'Available banks list');
            } catch (error) {
            sendError(res, error.message || 'Failed to retrieve bank list', error.statusCode || 500);
            next(error);
            }
      }

       static async getBalance(req, res, next){
            const errors = validationResult(req);
           if(!errors.isEmpty()) {
             return sendError(res, 'Validation error', 400, errors.array());
          }

       try {
                 const { userId } = req.params;
               const result = await WalletService.getWalletBalance(userId);
              sendSuccess(res, result, 'Available banks list');
            } catch (error) {
                  sendError(res, error.message || 'Failed to retrieve bank list', error.statusCode || 500);
                  next(error);
            }
      }

          static async getWalletHistory(req, res, next){
            const errors = validationResult(req);
           if(!errors.isEmpty()) {
             return sendError(res, 'Validation error', 400, errors.array());
          }

       try {
                 const { userId } = req.params;
               const result = await WalletService.getWalletHistory(userId);
              sendPaginated(res, result, 'Available banks list');
            } catch (error) {
                  sendError(res, error.message || 'Failed to retrieve bank list', error.statusCode || 500);
                  next(error);
            }
      }
      
          static async getWithdrawalHistory(req, res, next){
          try {
               const result = await WalletService.getWithdrawalHistory(req.user.id);
                sendPaginated(res, result, 'Withdrawal history');
            } catch (error) {
                  sendError(res, error.message || 'Failed to retrieve withdrawal history', error.statusCode || 500);
                  next(error);
            }
         }

          static async initializeFunding(req, res, next) {
            const errors = validationResult(req);
              if (!errors.isEmpty()) {
                  return sendError(res, 'Validation error', 400, errors.array());
              }
            try {
                  const { amount } = req.body;
                  const { email, id } = req.user;
               
                  const result = await WalletService.initializeWalletFunding(amount, id, email);
                  sendSuccess(res, result, 'Funding initialized successfully');
            } catch (error) {
                  sendError(res, error.message || 'Failed to initialize payment', error.statusCode || 500);
                  next(error);
            }
          }
        
       
    static async getFundingIntent(req, res, next) {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const userId = req.user.id;
      const { status } = req.query;
      const result = await WalletService.getFundingIntents(userId, status);
      sendSuccess(res, result, 'Funding intent retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve payment intent', error.statusCode || 500);
      next(error);
    }
  }


  static async getFundingStatus(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { paymentIntentId } = req.params;
      const result = await WalletService.getFundingStatus(paymentIntentId);
      sendSuccess(res, result, 'Payment status retrieved successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to retrieve funding status', error.statusCode || 500);
      next(error);
    }
  }

  /**
   * Verify payment after callback
   * @route GET /api/v1/payments/verify
   */
  static async verifyFunding(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { paymentIntentId } = req.params;
      const userId = req.user.id;
         
         const ipAgent = {
             ipAddress: req.ip,
            userAgent: req.get('user-agent'),
         }
      
      const result = await WalletService.verifyFunding(paymentIntentId, userId, ipAgent);
      sendSuccess(res, result, 'Funding verified successfully');
    } catch (error) {
      sendError(res, error.message || 'Failed to verify payment', error.statusCode || 500);
      next(error);
    }
  }

  static async verifyBank(req, res, next){
        const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { accountNumber, bankCode } = req.body;
      const result = await WalletService.verifyBankAccount(accountNumber, bankCode);
      sendSuccess(res, result, 'Bank account verification succeeded');
     } catch (error) {
      sendError(res, error.message || 'Failed to verify bank account', error.statusCode || 500);
      next(error);
    }
  }

   static async bankTransferrecipient(req, res, next){
        const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { accountNumber, bankCode, name } = req.body;
      const result = await WalletService.bankTransferrecipient(accountNumber, bankCode, name, req.user.id);
      sendSuccess(res, result, 'Transfer recipient created successfully');
     } catch (error) {
      sendError(res, error.message || 'Failed to create recipient', error.statusCode || 500);
      next(error);
    }
  }
  
   static async initializeTransfer(req, res, next){
        const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { accountNumber, bankCode, name } = req.body;
      const ipAgent = {
            ipAddress: req.ip, 
            userAgent: req.get('user-agent'),
          }
      const result = await WalletService.initializeTransfer(accountNumber, bankCode, name, req.user.id, ipAgent);
      sendSuccess(res, result, 'Transfer recipient created successfully');
     } catch (error) {
      sendError(res, error.message || 'Failed to  initiate transfer', error.statusCode || 500);
      next(error);
    }
  }

   static async payCompletedJob(req, res, next){
        const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'Validation error', 400, errors.array());
    }

    try {
      const { jobId } = req.params;
      const { email, id } = req.user;
      const { amount } = req.body;
        const ipAgent = {
            ipAddress: req.ip, 
            userAgent: req.get('user-agent'),
          }
      const result = await WalletService.payCompletedJob(jobId, amount, id, email, ipAgent);
      sendSuccess(res, result, 'Payment made successfully');
     } catch (error) {
      sendError(res, error.message || 'Failed to make payment', error.statusCode || 500);
      next(error);
    }
  }



   


}



module.exports =  WalletController;
