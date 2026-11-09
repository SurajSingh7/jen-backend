// PM2 config for local development: `npm run pm2` starts (or restarts) the backend on port 5400.
module.exports = {
  apps: [
    {
      name: "jen-backend",
      script: "src/server.js",
      cwd: __dirname,
      watch: ["src", ".env"],
      watch_delay: 500,
      ignore_watch: ["node_modules"],
      env: { NODE_ENV: "development" },
    },
  ],
};
