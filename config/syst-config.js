const { pool } = require('./database');
const { cacheGet, cacheSet, cacheDel} = require('./redis');

class SysConfig {


   static async getSysConfig(){
      const data = await this.getSystemConfigs();
      return data;
   }

  static async getSystemConfigs(){
    
  const SYS_CONF_KEY_VALUE  = 'admin:system_configs_keys';
   const REDIS_TTL = 3600; // Cache for 1 hour (in seconds)
   
      try {
        const cachedData = await cacheGet(SYS_CONF_KEY_VALUE );
        if (cachedData) {
          return cachedData; // Return parsed object immediately
          }
        } catch (redisError) {
        console.error('Redis read error, falling back to DB:', redisError);
       }

      const configs = {};

      try {
        const results =  await pool.query(`SELECT key, value FROM system_configurations`)

        if(results.rows.length > 0){
         const len = results.rows.length;
         for(let i = 0; i < len; i++){
            const key = results.rows[i].key;
            const value = results.rows[i].value;
               if(key && value)  configs[key] = value;
          }
        }
        try {
          await cacheSet(SYS_CONF_KEY_VALUE , configs, REDIS_TTL);
        } catch (redisWriteError) {
          console.error('Failed to write configurations to Redis:', redisWriteError);
        }
        console.log(configs);
        return configs;
      } catch (dbError) {
        console.error('Database fetch error:', dbError);
        throw dbError;
      }
    };
    
    static async updateConfigValue (){
      const SYS_CONF_KEY_VALUE  = 'admin:system_configs_keys';
      await cacheDel(SYS_CONF_KEY_VALUE);
    };

}


module.exports = SysConfig