'use strict';

const http = require('http');

/**
 * Minimal HTTP health endpoint. This reflects only process/bot state and never
 * exposes environment variables, credentials, or raw error details.
 *
 * Note: a 200 response means the worker process is alive. It does NOT prove the
 * Minecraft connection is healthy; check `bot.connected` for that.
 */
function createHealthServer({ botManager, logger = null, host = '0.0.0.0' } = {}) {
  const startedAt = Date.now();

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || !['/health', '/healthz', '/'].includes(req.url)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    const status = botManager.getStatus();
    const body = {
      status: 'ok',
      uptimeMs: Date.now() - startedAt,
      processUptimeMs: Math.round(process.uptime() * 1000),
      bot: {
        state: status.state,
        connected: status.connected,
        reconnectPending: status.reconnectPending,
        connectionAttempts: status.connectionAttempts,
        connectedForMs: status.connectedForMs,
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });

  server.on('error', (err) => logger?.error(`HTTP server error: ${err.message}`));
  server.host = host;

  return server;
}

module.exports = { createHealthServer };
