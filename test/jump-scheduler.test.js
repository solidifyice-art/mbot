'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { JumpScheduler } = require('../src/jump-scheduler');
const { createFakeTimers } = require('./support/fake-timers');
const { createMockBot, nullLogger } = require('./support/mock-bot');

function makeScheduler(bot, timers, overrides = {}) {
  return new JumpScheduler({
    bot,
    intervalMs: 1000,
    count: 3,
    gapMs: 1000,
    durationMs: 200,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    logger: nullLogger,
    ...overrides,
  });
}

test('requires a bot with setControlState', () => {
  assert.throws(() => new JumpScheduler({ bot: {}, intervalMs: 1000, count: 1, gapMs: 1000, durationMs: 100 }), /setControlState/);
});

test('waits the interval before the first routine', () => {
  const timers = createFakeTimers();
  const bot = createMockBot();
  bot.spawn();
  const scheduler = makeScheduler(bot, timers);

  scheduler.start();
  assert.equal(bot.controlStates.length, 0);

  timers.advance(999);
  assert.equal(bot.controlStates.length, 0);

  timers.advance(1);
  assert.deepEqual(bot.controlStates[0], { control: 'jump', state: true });
});

test('performs the configured number of jumps spaced by the gap', () => {
  const timers = createFakeTimers();
  const bot = createMockBot();
  bot.spawn();
  const scheduler = makeScheduler(bot, timers);

  scheduler.start();
  timers.advance(4000);

  assert.deepEqual(bot.controlStates, [
    { control: 'jump', state: true },
    { control: 'jump', state: false },
    { control: 'jump', state: true },
    { control: 'jump', state: false },
    { control: 'jump', state: true },
    { control: 'jump', state: false },
  ]);

  const pressTimes = [1000, 2000, 3000];
  for (let i = 1; i < pressTimes.length; i += 1) {
    assert.equal(pressTimes[i] - pressTimes[i - 1], 1000);
  }
});

test('stop cancels pending timers and releases the jump control', () => {
  const timers = createFakeTimers();
  const bot = createMockBot();
  bot.spawn();
  const scheduler = makeScheduler(bot, timers);

  scheduler.start();
  timers.advance(1000);
  assert.deepEqual(bot.controlStates, [{ control: 'jump', state: true }]);

  scheduler.stop();
  assert.equal(bot.controlStates[1].state, false);

  timers.advance(100000);
  assert.equal(bot.controlStates.length, 2);
  assert.equal(scheduler.running, false);
});

test('stops when the bot is no longer spawned', () => {
  const timers = createFakeTimers();
  const bot = createMockBot();
  const scheduler = makeScheduler(bot, timers);

  scheduler.start();
  timers.advance(1000);

  assert.equal(bot.controlStates.length, 0);
  assert.equal(scheduler.running, false);
});

test('stops if setting the control state throws', () => {
  const timers = createFakeTimers();
  const bot = createMockBot();
  bot.spawn();
  bot.setControlState = () => {
    throw new Error('not connected');
  };
  const scheduler = makeScheduler(bot, timers);

  scheduler.start();
  assert.doesNotThrow(() => timers.advance(1000));
  assert.equal(scheduler.running, false);
});

test('start is idempotent', () => {
  const timers = createFakeTimers();
  const bot = createMockBot();
  bot.spawn();
  const scheduler = makeScheduler(bot, timers);

  scheduler.start();
  scheduler.start();
  timers.advance(1000);

  assert.equal(timers.pendingCount(), 1);
});
