'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { InventoryChecker } = require('../src/inventory');
const { createFakeTimers } = require('./support/fake-timers');

function recordingLogger() {
  const messages = [];
  return {
    messages,
    debug() {},
    info(message) {
      messages.push(message);
    },
    warn() {},
    error() {},
  };
}

function makeChecker(bot, timers, overrides = {}) {
  return new InventoryChecker({
    bot,
    intervalMs: 1000,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    logger: recordingLogger(),
    ...overrides,
  });
}

function slots(stackCount, names = ['dirt', 'stone_sword', 'enchanted_golden_apple']) {
  const out = new Array(stackCount).fill(null);
  names.forEach((name, index) => {
    if (index < out.length) {
      out[index] = { name, count: index + 1, enchants: [] };
    }
  });
  return out;
}

test('requires a bot with inventory.slots', () => {
  assert.throws(
    () => new InventoryChecker({ bot: {}, intervalMs: 1000 }),
    /inventory\.slots/,
  );
});

test('checks immediately on start and reports non-empty slots', () => {
  const timers = createFakeTimers();
  const checker = makeChecker({ inventory: { slots: slots(3) } }, timers);
  checker.start();
  assert.ok(checker.timer !== null);
  const last = checker.logger.messages[checker.logger.messages.length - 1];
  assert.equal(last, 'Inventory: dirt x1, stone_sword x2, enchanted_golden_apple x3.');
});

test('reports an empty inventory', () => {
  const timers = createFakeTimers();
  const checker = makeChecker({ inventory: { slots: [null, null, null] } }, timers);
  checker.start();
  const last = checker.logger.messages[checker.logger.messages.length - 1];
  assert.equal(last, 'Inventory is empty.');
});

test('marks enchanted stacks', () => {
  const timers = createFakeTimers();
  const bot = { inventory: { slots: [{ name: 'enchanted_golden_apple', count: 1, enchants: [{ id: 0, lvl: 2 }] }] } };
  const checker = makeChecker(bot, timers);
  checker.start();
  assert.match(checker.logger.messages.at(-1), /enchanted_golden_apple x1 \(enchanted\)/);
});

test('re-checks on the interval', () => {
  const timers = createFakeTimers();
  const bot = { inventory: { slots: slots(1) } };
  const checker = makeChecker(bot, timers);
  checker.start();
  assert.equal(checker.logger.messages.length, 2);
  timers.advance(999);
  assert.equal(checker.logger.messages.length, 2);
  timers.advance(1);
  assert.ok(checker.logger.messages.length >= 3);
  assert.match(checker.logger.messages.at(-1), /^Inventory:/);
});

test('stop cancels future checks', () => {
  const timers = createFakeTimers();
  const bot = { inventory: { slots: slots(1) } };
  const checker = makeChecker(bot, timers);
  checker.start();
  assert.equal(checker.logger.messages.length, 2);
  checker.stop();
  timers.advance(5000);
  assert.equal(checker.logger.messages.length, 2);
});