'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocket } = require('ws');

const { createHealthServer } = require('../src/server');
const { nullLogger } = require('./support/mock-bot');

const fakeBotManager = {
  getStatus() {
    return {
      state: 'connected',
      connected: true,
      reconnectPending: false,
      connectionAttempts: 1,
      lastDisconnectReason: null,
      connectedForMs: 1234,
      jumpEnabled: true,
      antiAfkEnabled: true,
    };
  },
};

function makeFakeShell() {
  return {
    getStatus() {
      return { state: 'connected', connected: true, detail: { position: { x: 1, y: 2, z: 3 } } };
    },
    getFeed() {
      return [{ type: 'system', text: 'hello', at: 1 }];
    },
    async execute(command) {
      return { ok: true, output: `ran:${command}` };
    },
    on() {},
  };
}

const TOKEN = 's3cret';

function get(server, path) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

function post(server, path, payload, headers = {}) {
  const { port } = server.address();
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

async function listen(server, t) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.shutdown());
}

test('health endpoint returns bot state without sensitive data', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger });
  await listen(server, t);

  const res = await get(server, '/health');
  assert.equal(res.status, 200);

  const body = JSON.parse(res.body);
  assert.equal(body.status, 'ok');
  assert.equal(body.bot.state, 'connected');
  assert.equal(body.bot.connected, true);
  assert.equal(typeof body.uptimeMs, 'number');

  assert.equal(res.body.includes('password'), false);
  assert.equal(res.body.toLowerCase().includes('host'), false);
});

test('unknown paths return 404', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger });
  await listen(server, t);

  const res = await get(server, '/does-not-exist');
  assert.equal(res.status, 404);
});

test('shell routes are disabled without a token', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger, shell: makeFakeShell() });
  await listen(server, t);

  const res = await get(server, '/status');
  assert.equal(res.status, 403);
});

test('shell routes reject a wrong token', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger, shell: makeFakeShell(), token: TOKEN });
  await listen(server, t);

  assert.equal((await get(server, '/status?token=nope')).status, 401);
  assert.equal((await get(server, '/feed')).status, 401);
});

test('GET /status and /feed return shell data with a valid token', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger, shell: makeFakeShell(), token: TOKEN });
  await listen(server, t);

  const status = await get(server, `/status?token=${TOKEN}`);
  assert.equal(status.status, 200);
  assert.equal(JSON.parse(status.body).state, 'connected');

  const feed = await get(server, `/feed?token=${TOKEN}`);
  assert.equal(feed.status, 200);
  assert.equal(JSON.parse(feed.body).feed.length, 1);
});

test('GET /map runs the map command', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger, shell: makeFakeShell(), token: TOKEN });
  await listen(server, t);

  const res = await get(server, `/map?token=${TOKEN}&radius=3`);
  assert.equal(JSON.parse(res.body).output, 'ran:map 3');
});

test('POST /shell executes a command', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger, shell: makeFakeShell(), token: TOKEN });
  await listen(server, t);

  const res = await post(server, '/shell', { command: 'walk off' }, { 'x-shell-token': TOKEN });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).output, 'ran:walk off');
});

test('websocket streams command output', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger, shell: makeFakeShell(), token: TOKEN });
  await listen(server, t);

  const { port } = server.address();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${TOKEN}`);
  const messages = [];
  const waiters = [];
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    messages.push(message);
    for (const waiter of waiters.slice()) {
      if (waiter.pred(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });
  t.after(() => ws.terminate());

  const waitFor = (pred, timeout = 2000) =>
    new Promise((resolve, reject) => {
      const existing = messages.find(pred);
      if (existing) return resolve(existing);
      const waiter = { pred, resolve };
      waiters.push(waiter);
      setTimeout(() => reject(new Error('websocket timeout')), timeout);
    });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  await waitFor((m) => m.type === 'hello');
  ws.send(JSON.stringify({ command: 'help' }));

  const output = await waitFor((m) => m.type === 'output');
  assert.equal(output.output, 'ran:help');
});

test('websocket rejects a bad token', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger, shell: makeFakeShell(), token: TOKEN });
  await listen(server, t);

  const { port } = server.address();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=wrong`);
  t.after(() => ws.terminate());
  const failed = await new Promise((resolve) => {
    ws.on('error', () => resolve(true));
    ws.on('open', () => resolve(false));
  });
  assert.equal(failed, true);
});
