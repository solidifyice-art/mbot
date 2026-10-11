'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Backoff, ReconnectManager } = require('../src/reconnect');
const { createFakeTimers } = require('./support/fake-timers');

test('Backoff grows exponentially and caps at maxMs', () => {
  const backoff = new Backoff({ initialMs: 1000, maxMs: 4000, factor: 2 });

  assert.equal(backoff.next(), 1000);
  assert.equal(backoff.next(), 2000);
  assert.equal(backoff.next(), 4000);
  assert.equal(backoff.next(), 4000);
  assert.equal(backoff.attempts, 4);
});

test('Backoff reset restores the initial delay', () => {
  const backoff = new Backoff({ initialMs: 1000, maxMs: 8000, factor: 2 });
  backoff.next();
  backoff.next();
  backoff.reset();

  assert.equal(backoff.attempts, 0);
  assert.equal(backoff.next(), 1000);
});

test('Backoff validates its inputs', () => {
  assert.throws(() => new Backoff({ initialMs: 10, maxMs: 1000 }), /initialMs/);
  assert.throws(() => new Backoff({ initialMs: 1000, maxMs: 100 }), /maxMs/);
  assert.throws(() => new Backoff({ initialMs: 1000, maxMs: 1000, factor: 0.5 }), /factor/);
});

test('ReconnectManager returns null when disabled', () => {
  const manager = new ReconnectManager({ enabled: false, initialMs: 1000, maxMs: 4000 });
  assert.equal(manager.schedule(() => {}), null);
  assert.equal(manager.pending, false);
});

test('ReconnectManager schedules and fires the callback', () => {
  const timers = createFakeTimers();
  const manager = new ReconnectManager({
    enabled: true,
    initialMs: 1000,
    maxMs: 4000,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  let fired = 0;
  const delay = manager.schedule(() => {
    fired += 1;
  });

  assert.equal(delay, 1000);
  assert.equal(manager.pending, true);
  assert.equal(fired, 0);

  timers.advance(999);
  assert.equal(fired, 0);
  timers.advance(1);
  assert.equal(fired, 1);
  assert.equal(manager.pending, false);
});

test('ReconnectManager prevents duplicate pending timers', () => {
  const timers = createFakeTimers();
  const manager = new ReconnectManager({
    enabled: true,
    initialMs: 1000,
    maxMs: 4000,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  assert.equal(manager.schedule(() => {}), 1000);
  assert.equal(manager.schedule(() => {}), null);
  assert.equal(timers.pendingCount(), 1);
});

test('ReconnectManager increases the delay after repeated schedules', () => {
  const timers = createFakeTimers();
  const manager = new ReconnectManager({
    enabled: true,
    initialMs: 1000,
    maxMs: 4000,
    factor: 2,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  assert.equal(manager.schedule(() => {}), 1000);
  timers.advance(1000);
  assert.equal(manager.schedule(() => {}), 2000);
  timers.advance(2000);
  assert.equal(manager.schedule(() => {}), 4000);
});

test('ReconnectManager cancel clears a pending timer', () => {
  const timers = createFakeTimers();
  const manager = new ReconnectManager({
    enabled: true,
    initialMs: 1000,
    maxMs: 4000,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  let fired = false;
  manager.schedule(() => {
    fired = true;
  });
  manager.cancel();

  assert.equal(manager.pending, false);
  timers.advance(10000);
  assert.equal(fired, false);
});

test('ReconnectManager resetBackoff restores the initial delay', () => {
  const timers = createFakeTimers();
  const manager = new ReconnectManager({
    enabled: true,
    initialMs: 1000,
    maxMs: 8000,
    factor: 2,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  manager.schedule(() => {});
  timers.advance(1000);
  manager.schedule(() => {});
  manager.resetBackoff();

  assert.equal(manager.backoff.attempts, 0);
});
