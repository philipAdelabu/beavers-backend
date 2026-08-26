const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { redis, cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { logger } = require('../config/logger');
const { AppError } = require('../middleware/error.middleware');






// Paystack API configuration
let PAYSTACK_SECRET_KEY;
let PAYSTACK_BASE_URL;
if(process.env.NODE_ENV === 'production'){
    PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    PAYSTACK_BASE_URL = 'https://api.paystack.co';

}else{
    PAYSTACK_SECRET_KEY = process.env.PAYSTACK_TEST_SECRET_KEY;
    PAYSTACK_BASE_URL = 'https://api.paystack.co';
}
const paystackAxios = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

class PayStackService {
     
    static async initializePayment(userId, amount, email) {
       
        try {   
          // Create unique reference
          const reference = this.generateReference(userId);
          const totalAmount = Number(amount);
          // Prepare Paystack initialization data
          const paystackData = {
            amount: Math.round(totalAmount * 100), // Convert to kobo
            currency: 'NGN',
            email,
            reference,
            metadata: {
              reference,
              client_id: userId,
            },
            callback_url: `${process.env.APP_FRONTEND_URL}/payment/verify?refId=${reference}`,
            channels: ['card', 'bank_transfer', 'ussd', 'qr', 'mobile_money', 'bank']
          };
          
          // Call Paystack API
          const response = await paystackAxios.post('/transaction/initialize', paystackData);
          if (!response.data.status) {
            throw new AppError(400, response.data.message || 'Failed to initialize payment');
          }
          
          // Store payment intent in database
          const metadata = response.data.data;
          logger.info(`Paystack initialization response for ${userId}:`, response.data);
      
          return {
            authorizationUrl: metadata.authorization_url,
            reference,
            user_id: userId,
            payment_intent_id: metadata.reference,
            access_code: metadata.access_code,
            amount: totalAmount,
            currency: 'NGN',
            metadata,
          };
        } catch (error) {
          throw new AppError(500, error.response?.data?.message || error.message || 'Failed to initialize payment');
        } 

    }

      static async getPaymentIntent(refId, userId) {
        const client = await pool.connect();
        
        try {
          const result = await client.query(
            `SELECT job_id, client_id, payment_intent_id, client_secret, amount, currency, status, metadata, status, failure_reason, 
            paid_at, failed_at, created_at, updated_at  FROM payment_intents WHERE job_id = $1 AND client_id = $2 ORDER BY updated_at LIMIT 1`,
            [refId, userId]
          );
          
          if (result.rows.length === 0) {
            throw new AppError(404, 'Payment intent not found');
          }
          
          return result.rows;
        } catch (error) {
          throw new AppError(500, error.message || 'Failed to retrieve payment intent');
        } finally {
          client.release();
        }
      }
    
        static async getPendingPaymentIntent(clientId) {
        const client = await pool.connect();
        
        try {
          const result = await client.query(
            `SELECT job_id, 
            client_id, payment_intent_id, client_secret, amount, 
            currency, status, metadata, status, failure_reason, paid_at, 
            failed_at, created_at, updated_at  FROM payment_intents WHERE status <> 'succeeded' AND client_id = $1`,
            [clientId]
          );
          
          if (result.rows.length === 0) {
            throw new AppError(404, 'Payment intent not found');
          }
          
          return result.rows;
        } catch (error) {
          throw new AppError(500, error.message || 'Failed to retrieve payment intent');
        } finally {
          client.release();
        }
      }
    
      static async getPaymentStatus(paymentIntentId) { 
        const client = await pool.connect();
          try {
          const result = await client.query(
            `SELECT job_id, status, amount, currency, metadata  FROM payment_intents WHERE payment_intent_id = $1`,
            [paymentIntentId]
          );
          
          if (result.rows.length === 0) {
            throw new AppError(404, 'Payment intent not found');
          }
          
          return result.rows[0];
        } catch (error) {
          throw new AppError(500, error.message || 'Failed to retrieve payment status');
        } finally {
          client.release();
        }
      }
      /**
       * Verify payment after callback
       * @param {string} reference - Paystack transaction reference
       * @param {string} clientId - Client ID
       * @returns {Promise<Object>} Payment verification result
       */
      static async verifyPayment(reference, userId) {
        const client = await pool.connect();
        
        try {
          // Check if already processed
          const existingPayment = await client.query(
            `SELECT * FROM funding_payment_intents WHERE payment_intent_id = $1 AND user_id = $2`,
            [reference, userId]
          );
          
          if (existingPayment.rows.length === 0) {
            throw new AppError(404, 'Payment record not found');
          }
          
          const payment = existingPayment.rows[0];
          
          if (payment.status === 'succeeded') {
            return {
              status: 'succeeded',
              amount: payment.amount,
              message: 'Payment already verified'
            };
          }
          
          // Verify with Paystack
          const response = await paystackAxios.get(`/transaction/verify/${reference}`);
          
          if (!response.data.status) {
            throw new AppError(400, response.data.message || 'Verification failed');
          }
          
          const transaction = response.data.data;
          
          if (transaction.status === 'success') {
      
            return {
              status: 'succeeded',
              amount: transaction.amount / 100,
              reference: reference,
              message: 'Payment verified and made successfully',
            };
    
          } else {
          
            return {
              status: 'failed',
              message: transaction.gateway_response || 'Payment failed'
            };
          }
        } catch (error) {
    
          throw new AppError(500, error.response?.data?.message || error.message || 'Failed to verify payment');
        } 
      }

       static generateReference(userId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `FD-${userId.slice(0, 8)}-${timestamp}-${random}`;
  }

  static async getBankList(){
    const path = '/bank?currency=NGN';
    const response = await paystackAxios.get(path);
    return response.data;
  }

  static async verifyBankAccount(accountNumber, bankCode){
       const path = `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`
        const response = await paystackAxios.get(path);
      return response.data;
  }

  static async bankTransferrecipient(accountNumbe, bankCode, name){
       const path = '/transferrecipient';
       const pdata = {
          type: 'nuban',
          name: name,
          account_number: accountNumbe,
          bank_code: bankCode,
          currency: 'NGN'
       }
       const response = await paystackAxios.post(path, pdata);
       return response.data; 
  }

  static async initiateTransfer(amount, recipient_code, reference){
  
      const amt = Number(amount);
      try{
        const pdata = {
        source: 'balance',
        amount: Math.round(amt * 100), 
        reference: reference,
        recipient: recipient_code,
        reason: 'Cashout payment'
       }
       const path = '/transfer';
      const response = await paystackAxios.post(path, pdata);
       return response.data;
      }catch(error){
          // This log exposes Paystack's exact validation message
        if (error.response) {
            console.error("Paystack Error Data:", error.response.data);
        } else {
            console.error("Axios Configuration Error:", error.message);
        }
        throw error;
      }
  }

  
    

  static async verifyTransfer(reference){
       const path = `/transfer/verify/${reference}`;
       const response = await paystackAxios.get(path);
       return response.data;
  }

}

module.exports = PayStackService;