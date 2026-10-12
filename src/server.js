'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

function sendJson(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function providedToken(req, url) {
  const fromQuery = url.searchParams.get('token');
  if (fromQuery) return fromQuery;
  const header = req.headers['x-shell-token'];
  if (header) return header;
  const auth = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1] : null;
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Minimal HTTP endpoint exposing the health check and, when a shell and token
 * are configured, the remote bot shell over HTTP and WebSocket. Refuses every
 * shell route when no token is set. Never exposes environment variables,
 * credentials, or raw error details.
 *
 * Note: a 200 response means the worker process is alive. It does NOT prove the
 * Minecraft connection is healthy; check `bot.connected` for that.
 */
function createHealthServer({
  botManager,
  logger = null,
  host = '0.0.0.0',
  shell = null,
  token = null,
  wsPath = '/ws',
} = {}) {
  const startedAt = Date.now();
  const shellEnabled = Boolean(shell && token);
  const wss = new WebSocketServer({ noServer: true });

  const healthBody = () => {
    const status = botManager.getStatus();
    return {
      status: 'ok',
      uptimeMs: Date.now() - startedAt,
      processUptimeMs: Math.round(process.uptime() * 1000),
      bot: {
        state: status.state,
        connected: status.connected,
        reconnectPending: status.reconnectPending,
        connectionAttempts: status.connectionAttempts,
        connectedForMs: status.connectedForMs,
        jumpEnabled: status.jumpEnabled,
        antiAfkEnabled: status.antiAfkEnabled,
      },
      shell: shellEnabled,
    };
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && ['/health', '/healthz', '/'].includes(path)) {
      sendJson(res, 200, healthBody());
      return;
    }

    const shellRoute = ['/status', '/map', '/feed', '/shell'].includes(path);
    if (shellRoute) {
      if (!shellEnabled) {
        sendJson(res, 403, { error: 'Shell disabled. Set SHELL_TOKEN to enable it.' });
        return;
      }
      if (providedToken(req, url) !== token) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      try {
        if (path === '/status') {
          sendJson(res, 200, shell.getStatus());
        } else if (path === '/feed') {
          const count = url.searchParams.get('count');
          sendJson(res, 200, { feed: shell.getFeed(count ? Number(count) : undefined) });
        } else if (path === '/map') {
          const radius = url.searchParams.get('radius') || '8';
          sendJson(res, 200, await shell.execute(`map ${radius}`));
        } else if (req.method === 'POST') {
          const raw = await readBody(req);
          let command = raw;
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.command === 'string') command = parsed.command;
          } catch {
            command = raw;
          }
          sendJson(res, 200, await shell.execute(command));
        } else {
          sendJson(res, 405, { error: 'Use POST /shell with a command.' });
        }
      } catch (err) {
        sendJson(res, 400, { error: err && err.message ? err.message : 'shell error' });
      }
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== wsPath || !shellEnabled || providedToken(req, url) !== token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  if (shell) {
    shell.on('feed', (entry) => {
      const message = JSON.stringify({ type: 'feed', entry });
      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(message);
      }
    });
  }

  wss.on('connection', (ws) => {
    if (shell) ws.send(JSON.stringify({ type: 'hello', feed: shell.getFeed(20) }));
    ws.on('message', async (data) => {
      let command;
      try {
        const parsed = JSON.parse(data.toString('utf8'));
        command = parsed && typeof parsed.command === 'string' ? parsed.command : data.toString('utf8');
      } catch {
        command = data.toString('utf8');
      }
      const result = await shell.execute(command);
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', ...result }));
    });
    ws.on('error', (err) => logger?.debug(`WebSocket error: ${err.message}`));
  });

  server.on('error', (err) => logger?.error(`HTTP server error: ${err.message}`));
  server.on('close', () => {
    for (const client of wss.clients) client.terminate();
    wss.close();
  });

  server.shutdown = () =>
    new Promise((resolve) => {
      for (const client of wss.clients) client.terminate();
      wss.close();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      server.close(() => resolve());
    });

  server.host = host;
  server.wss = wss;
  server.shellEnabled = shellEnabled;

  return server;
}

module.exports = { createHealthServer };