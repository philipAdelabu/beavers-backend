// test-redis.js
const redisModule = require('./config/redis');

console.log('Redis module loaded');
console.log('Available exports:', Object.keys(redisModule));
console.log('Type of initializeRedis:', typeof redisModule.initializeRedis);

if (typeof redisModule.initializeRedis === 'function') {
  console.log('✅ initializeRedis is a function - good to go!');
} else {
  console.log('❌ initializeRedis is NOT a function');
  console.log('Value:', redisModule.initializeRedis);
}
