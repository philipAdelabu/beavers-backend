module.exports = {
  apps: [
    {
      name: 'beaverworks-api',
      script: 'server.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        DEBUG: 'beaverworks:*'
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      
      // Error logs
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      
      // Restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      
      // Kill timeout
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Merge logs
      merge_logs: true,
      
      // Instance count for different environments
      instance_var: 'INSTANCE_ID',
      
      // Graceful shutdown
      shutdown_with_message: true,
      
      // Watch settings (disabled in production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads', 'backups', '.git'],
      
      // Cron restart (optional - restart at 4 AM daily)
      cron_restart: '0 4 * * *',
      
      // Source map support
      source_map_support: true,
      
      // Instance name format
      instance_name: 'beaverworks-api-{instance_id}',
      
      // Log date format
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Custom action
      post_update: ['npm install', 'npm run migrate:up'],
      
      // Force kill after timeout
      force: false,
      
      // Node.js arguments
      node_args: '--max-old-space-size=512',
      
      // Trace
      trace: true,
      
      // Disable logging for specific exit codes
      disable_logs: false
    },
    
    // Optional: Worker process for background jobs
    {
      name: 'beaverworks-worker',
      script: 'jobs/worker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        WORKER_TYPE: 'background'
      },
      env_development: {
        NODE_ENV: 'development',
        WORKER_TYPE: 'background'
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    
    // Optional: Cron job process
    {
      name: 'beaverworks-cron',
      script: 'jobs/cron.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        CRON_ENABLED: 'true'
      },
      env_development: {
        NODE_ENV: 'development',
        CRON_ENABLED: 'false'
      },
      error_file: './logs/cron-error.log',
      out_file: './logs/cron-out.log',
      log_file: './logs/cron-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 10000,
      kill_timeout: 30000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['api.beaverworks.com'],
      ref: 'origin/main',
      repo: 'git@github.com:beaverworks/backend.git',
      path: '/var/www/beaverworks',
      'post-deploy': 'npm install && npm run migrate:up && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    },
    staging: {
      user: 'deploy',
      host: ['staging-api.beaverworks.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:beaverworks/backend.git',
      path: '/var/www/beaverworks-staging',
      'post-deploy': 'npm install && npm run migrate:up && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};