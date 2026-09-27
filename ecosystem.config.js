module.exports = {
  apps: [{
    name: 'wa-academic-agent',
    script: 'agent.js',
    watch: false,
    max_memory_restart: '450M',
    restart_delay: 4000,
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    time: true,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
