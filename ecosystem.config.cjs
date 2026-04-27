/**
 * PM2 process file for production. Run on the EC2 box:
 *
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save
 *   pm2 startup   # follow the printed command to enable boot-on-restart
 *
 * Logs land in `~/.pm2/logs/padlok-api-*.log` and rotate via `pm2-logrotate`.
 */

module.exports = {
  apps: [
    {
      name: 'padlok-api',
      script: 'dist/server.js',
      instances: 1, // t3.micro has 1 vCPU; cluster mode would just thrash the scheduler
      exec_mode: 'fork',
      max_memory_restart: '500M', // box has 1GB; restart before we OOM the kernel
      kill_timeout: 16_000, // matches GRACEFUL_SHUTDOWN_TIMEOUT in src/server.ts (15s) + buffer
      env_production: {
        NODE_ENV: 'production',
        PORT: '4000',
      },
    },
  ],
};
