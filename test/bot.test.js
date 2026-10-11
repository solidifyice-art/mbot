'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BotManager } = require('../src/bot');
const { createFakeTimers } = require('./support/fake-timers');
const { createBotFactory, createMockBot, nullLogger, testConfig } = require('./support/mock-bot');

function makeManager(overrides = {}, deps = {}) {
  const timers = createFakeTimers();
  const createBot = deps.createBot || createBotFactory();
  const manager = new BotManager(testConfig(overrides), {
    createBot,
    logger: nullLogger,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  return { manager, timers, createBot };
}

test('start creates exactly one bot with the configured options', () => {
  const { manager, createBot } = makeManager();

  manager.start();

  assert.equal(createBot.instances.length, 1);
  const options = createBot.instances[0].createOptions;
  assert.equal(options.host, 'localhost');
  assert.equal(options.port, 25565);
  assert.equal(options.username, 'TestBot');
  assert.equal(options.auth, 'offline');
});

test('duplicate start is ignored', () => {
  const { manager, createBot } = makeManager();
  manager.start();
  manager.start();
  assert.equal(createBot.instances.length, 1);
});

test('spawn marks the bot connected and starts the jump schedule', () => {
  const { manager, timers, createBot } = makeManager();

  manager.start();
  createBot.instances[0].spawn();

  assert.equal(manager.getStatus().connected, true);
  assert.equal(manager.reconnect.backoff.attempts, 0);

  timers.advance(1000);
  assert.deepEqual(createBot.instances[0].controlStates[0], { control: 'jump', state: true });
});

test('spawn starts the inventory checker and stop tears it down', async () => {
  const { manager, createBot } = makeManager();

  manager.start();
  assert.equal(manager.inventoryChecker, null);

  const bot = createBot.instances[0];
  bot.inventory.slots = [{ name: 'enchanted_golden_apple', count: 1, enchants: [] }];
  bot.spawn();

  assert.ok(manager.inventoryChecker instanceof require('../src/inventory').InventoryChecker);

  await manager.stop();
  assert.equal(manager.inventoryChecker, null);
});

test('does not start the inventory checker when its interval is zero', () => {
  const { manager, createBot } = makeManager({ inventory: { intervalMs: 0 } });

  manager.start();
  createBot.instances[0].spawn();

  assert.equal(manager.inventoryChecker, null);
});

test('unexpected disconnect schedules a reconnect', () => {
  const { manager, createBot } = makeManager();

  manager.start();
  createBot.instances[0].spawn();
  createBot.instances[0].emit('end', 'socket closed');

  assert.equal(manager.state, 'reconnecting');
  assert.equal(manager.reconnect.pending, true);
  assert.equal(manager.getStatus().connected, false);
});

test('reconnect creates a fresh bot after the initial delay', () => {
  const { manager, timers, createBot } = makeManager();

  manager.start();
  createBot.instances[0].spawn();
  createBot.instances[0].emit('end');

  timers.advance(999);
  assert.equal(createBot.instances.length, 1);
  timers.advance(1);
  assert.equal(createBot.instances.length, 2);
});

test('repeated failures increase the reconnect delay', () => {
  const { manager, timers, createBot } = makeManager();

  manager.start();
  createBot.instances[0].emit('end');
  timers.advance(1000);
  assert.equal(createBot.instances.length, 2);

  // Second bot never spawns and then fails: next delay should be 2000ms.
  createBot.instances[1].emit('end');
  assert.equal(manager.reconnect.pending, true);

  timers.advance(1999);
  assert.equal(createBot.instances.length, 2);
  timers.advance(1);
  assert.equal(createBot.instances.length, 3);
});

test('a successful spawn resets the reconnect backoff', () => {
  const { manager, timers, createBot } = makeManager();

  manager.start();
  createBot.instances[0].emit('end');
  timers.advance(1000);
  createBot.instances[1].emit('end');
  assert.equal(manager.reconnect.backoff.attempts, 2);

  timers.advance(2000);
  createBot.instances[2].spawn();

  assert.equal(manager.reconnect.backoff.attempts, 0);
  assert.equal(manager.reconnect.backoff.currentMs, 1000);
});

test('does not schedule two reconnect timers at once', () => {
  const { manager, timers, createBot } = makeManager();

  manager.start();
  createBot.instances[0].emit('end');
  createBot.instances[0].emit('end');
  assert.equal(timers.pendingCount(), 1);

  timers.advance(10000);
  assert.equal(createBot.instances.length, 2);
});

test('reconnect disabled leaves the bot disconnected', () => {
  const { manager, timers, createBot } = makeManager({ reconnect: { enabled: false } });

  manager.start();
  createBot.instances[0].emit('end');

  assert.equal(manager.state, 'disconnected');
  assert.equal(manager.reconnect.pending, false);

  timers.advance(60000);
  assert.equal(createBot.instances.length, 1);
});

test('synchronous createBot errors schedule a reconnect', () => {
  const timers = createFakeTimers();
  let calls = 0;
  const createBot = () => {
    calls += 1;
    if (calls === 1) throw new Error('ECONNREFUSED');
    return createMockBot();
  };
  const manager = new BotManager(testConfig(), {
    createBot,
    logger: nullLogger,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  manager.start();
  assert.equal(manager.state, 'reconnecting');
  assert.equal(manager.reconnect.pending, true);

  timers.advance(1000);
  assert.equal(calls, 2);
});

test('disconnect stops the jump schedule', () => {
  const { manager, timers, createBot } = makeManager();

  manager.start();
  createBot.instances[0].spawn();
  timers.advance(1000);

  createBot.instances[0].emit('end');
  const statesAfterDisconnect = createBot.instances[0].controlStates.length;
  timers.advance(100000);

  assert.equal(createBot.instances[0].controlStates.length, statesAfterDisconnect);
  assert.equal(createBot.instances[0].controlStates.at(-1).state, false);
});

test('shutdown cancels reconnects, removes listeners and stops connecting', async () => {
  const { manager, timers, createBot } = makeManager();

  manager.start();
  createBot.instances[0].spawn();
  createBot.instances[0].emit('end');
  assert.equal(manager.reconnect.pending, true);

  await manager.stop();

  assert.equal(manager.state, 'stopped');
  assert.equal(manager.reconnect.pending, false);
  assert.equal(createBot.instances[0].listenerCount('end'), 0);
  assert.equal(createBot.instances[0].listenerCount('spawn'), 0);

  timers.advance(600000);
  assert.equal(createBot.instances.length, 1);
});

test('events from a replaced bot are ignored', () => {
  const { manager, timers, createBot } = makeManager();

  manager.start();
  createBot.instances[0].spawn();
  createBot.instances[0].emit('end');
  timers.advance(1000);

  const oldBot = createBot.instances[0];
  const newBot = createBot.instances[1];
  newBot.spawn();

  oldBot.emit('end');
  oldBot.emit('spawn');

  assert.equal(manager.state, 'connected');
  assert.equal(manager.reconnect.pending, false);
});
