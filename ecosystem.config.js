module.exports = {
  apps: [{
    name: "iec-exhibition-platform",
    script: "scripts/start.mjs",
    cwd: __dirname,
    env: { NODE_ENV: "production", PORT: 3000 },
    instances: 1,
    autorestart: true,
    max_memory_restart: "750M",
  }],
};
