'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseConfig, ConfigError, DEFAULTS } = require('../src/config');

const REQUIRED = { MC_HOST: 'mc.example.com', MC_USERNAME: 'IdleBot' };

test('throws when MC_HOST is missing', () => {
  assert.throws(() => parseConfig({ MC_USERNAME: 'Bot' }), ConfigError);
});

test('throws when MC_USERNAME is missing', () => {
  assert.throws(() => parseConfig({ MC_HOST: 'mc.example.com' }), ConfigError);
});

test('applies safe defaults for optional values', () => {
  const config = parseConfig({ ...REQUIRED });

  assert.equal(config.minecraft.port, DEFAULTS.MC_PORT);
  assert.equal(config.minecraft.auth, 'offline');
  assert.equal(config.minecraft.version, undefined);
  assert.equal(config.jump.intervalMs, DEFAULTS.JUMP_INTERVAL_MS);
  assert.equal(config.jump.count, DEFAULTS.JUMP_COUNT);
  assert.equal(config.jump.gapMs, DEFAULTS.JUMP_GAP_MS);
  assert.equal(config.jump.durationMs, DEFAULTS.JUMP_DURATION_MS);
  assert.equal(config.inventory.intervalMs, DEFAULTS.INVENTORY_CHECK_INTERVAL_MS);
  assert.equal(config.reconnect.enabled, true);
  assert.equal(config.reconnect.initialMs, DEFAULTS.RECONNECT_INITIAL_MS);
  assert.equal(config.reconnect.maxMs, DEFAULTS.RECONNECT_MAX_MS);
  assert.equal(config.reconnect.factor, DEFAULTS.RECONNECT_FACTOR);
  assert.equal(config.http.enabled, false);
  assert.equal(config.http.port, DEFAULTS.PORT);
  assert.equal(config.shell.token, '');
  assert.equal(config.logLevel, 'info');
});

test('trims string values', () => {
  const config = parseConfig({ MC_HOST: '  mc.example.com  ', MC_USERNAME: ' Bot ' });
  assert.equal(config.minecraft.host, 'mc.example.com');
  assert.equal(config.minecraft.username, 'Bot');
});

test('reads the shell token', () => {
  const config = parseConfig({ ...REQUIRED, SHELL_TOKEN: '  sekret  ' });
  assert.equal(config.shell.token, 'sekret');
});

test('parses numeric environment variables', () => {
  const config = parseConfig({
    ...REQUIRED,
    MC_PORT: '25566',
    JUMP_INTERVAL_MS: '60000',
    JUMP_COUNT: '5',
    JUMP_GAP_MS: '2000',
    JUMP_DURATION_MS: '300',
    INVENTORY_CHECK_INTERVAL_MS: '15000',
    RECONNECT_INITIAL_MS: '2000',
    RECONNECT_MAX_MS: '60000',
    RECONNECT_FACTOR: '3',
    PORT: '8080',
  });

  assert.equal(config.minecraft.port, 25566);
  assert.equal(config.jump.intervalMs, 60000);
  assert.equal(config.jump.count, 5);
  assert.equal(config.jump.gapMs, 2000);
  assert.equal(config.jump.durationMs, 300);
  assert.equal(config.inventory.intervalMs, 15000);
  assert.equal(config.reconnect.factor, 3);
  assert.equal(config.http.port, 8080);
});

test('rejects non-numeric integer values', () => {
  assert.throws(() => parseConfig({ ...REQUIRED, MC_PORT: 'abc' }), ConfigError);
});

test('rejects out-of-range port', () => {
  assert.throws(() => parseConfig({ ...REQUIRED, MC_PORT: '70000' }), ConfigError);
  assert.throws(() => parseConfig({ ...REQUIRED, MC_PORT: '0' }), ConfigError);
});

test('parses boolean variants', () => {
  const on = parseConfig({ ...REQUIRED, RECONNECT_ENABLED: 'yes', ENABLE_HTTP: '1' });
  assert.equal(on.reconnect.enabled, true);
  assert.equal(on.http.enabled, true);

  const off = parseConfig({ ...REQUIRED, RECONNECT_ENABLED: 'false', ENABLE_HTTP: 'off' });
  assert.equal(off.reconnect.enabled, false);
  assert.equal(off.http.enabled, false);
});

test('rejects invalid boolean values', () => {
  assert.throws(() => parseConfig({ ...REQUIRED, RECONNECT_ENABLED: 'maybe' }), ConfigError);
});

test('rejects reconnect max below initial', () => {
  assert.throws(
    () =>
      parseConfig({
        ...REQUIRED,
        RECONNECT_INITIAL_MS: '10000',
        RECONNECT_MAX_MS: '5000',
      }),
    ConfigError,
  );
});

test('rejects jump duration greater than or equal to gap', () => {
  assert.throws(
    () => parseConfig({ ...REQUIRED, JUMP_DURATION_MS: '1000', JUMP_GAP_MS: '1000' }),
    ConfigError,
  );
});

test('rejects unknown log level', () => {
  assert.throws(() => parseConfig({ ...REQUIRED, LOG_LEVEL: 'verbose' }), ConfigError);
});

test('sets protocol version when provided', () => {
  const config = parseConfig({ ...REQUIRED, MC_VERSION: '1.20.4' });
  assert.equal(config.minecraft.version, '1.20.4');
});

test('returns a frozen configuration object', () => {
  const config = parseConfig({ ...REQUIRED });
  assert.equal(Object.isFrozen(config), true);
});
