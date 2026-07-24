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
               const { userId } = req.params;
              const { amount } = req.body;
               const ipAddress = req.ip;
               const userAgent = req.get('user-agent');
               const result = await WalletService.cashoutFund(userId, amount, {ipAddress, userAgent});
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

   


}



module.exports =  WalletController;
