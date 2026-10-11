'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

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
    };
  },
};

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

test('health endpoint returns bot state without sensitive data', async (t) => {
  const server = createHealthServer({ botManager: fakeBotManager, logger: nullLogger });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const res = await get(server, '/does-not-exist');
  assert.equal(res.status, 404);
});
