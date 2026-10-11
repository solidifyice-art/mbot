'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLogger } = require('../src/logger');

function captureSink() {
  const lines = [];
  return {
    lines,
    log: (...args) => lines.push(args.join(' ')),
    debug: (...args) => lines.push(args.join(' ')),
    info: (...args) => lines.push(args.join(' ')),
    warn: (...args) => lines.push(args.join(' ')),
    error: (...args) => lines.push(args.join(' ')),
  };
}

test('formats lines with a timestamp and level', () => {
  const sink = captureSink();
  const logger = createLogger('info', sink);

  logger.info('hello world');

  assert.equal(sink.lines.length, 1);
  assert.match(sink.lines[0], /^\d{4}-\d{2}-\d{2}T.*\[INFO\] hello world$/);
});

test('filters messages below the configured level', () => {
  const sink = captureSink();
  const logger = createLogger('warn', sink);

  logger.debug('nope');
  logger.info('nope');
  logger.warn('yes');
  logger.error('yes');

  assert.equal(sink.lines.length, 2);
  assert.match(sink.lines[0], /\[WARN\]/);
  assert.match(sink.lines[1], /\[ERROR\]/);
});

test('appends serializable metadata', () => {
  const sink = captureSink();
  const logger = createLogger('info', sink);

  logger.info('connected', { port: 25565 });

  assert.match(sink.lines[0], /\{"port":25565\}$/);
});

test('renders Error objects without leaking stack noise into the message', () => {
  const sink = captureSink();
  const logger = createLogger('info', sink);

  logger.error('failed', new Error('boom'));

  assert.match(sink.lines[0], /failed boom/);
});
