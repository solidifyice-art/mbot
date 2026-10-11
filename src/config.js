'use strict';

const DEFAULTS = Object.freeze({
  MC_PORT: 25565,
  MC_AUTH: 'offline',
  JUMP_INTERVAL_MS: 5 * 60 * 1000,
  JUMP_COUNT: 6,
  JUMP_GAP_MS: 1000,
  JUMP_DURATION_MS: 200,
  INVENTORY_CHECK_INTERVAL_MS: 60 * 1000,
  ANTI_AFK_INTERVAL_MS: 2 * 60 * 10,
  ANTI_AFK_MOVE_DURATION_MIN_MS: 1000,
  ANTI_AFK_MOVE_DURATION_MAX_MS: 20000,
  ANTI_AFK_LOOK_AROUND_CHANCE: 0.5,
  ANTI_AFK_JUMP_CHANCE: 0.4,
  RECONNECT_ENABLED: true,
  RECONNECT_INITIAL_MS: 5000,
  RECONNECT_MAX_MS: 5 * 60 * 1000,
  RECONNECT_FACTOR: 2,
  ENABLE_HTTP: false,
  PORT: 3000,
  LOG_LEVEL: 'info',
});

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function readString(env, name, { required = false, defaultValue = '' } = {}) {
  const raw = env[name];
  if (isBlank(raw)) {
    if (required) {
      throw new ConfigError(`Missing required environment variable ${name}.`);
    }
    return defaultValue;
  }
  return String(raw).trim();
}

function readInteger(env, name, { defaultValue, min, max } = {}) {
  const raw = env[name];
  if (isBlank(raw)) {
    return defaultValue;
  }
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) {
    throw new ConfigError(`${name} must be an integer, received "${raw}".`);
  }
  const value = Number.parseInt(text, 10);
  if (!Number.isFinite(value)) {
    throw new ConfigError(`${name} must be a finite integer, received "${raw}".`);
  }
  if (min !== undefined && value < min) {
    throw new ConfigError(`${name} must be >= ${min}, received ${value}.`);
  }
  if (max !== undefined && value > max) {
    throw new ConfigError(`${name} must be <= ${max}, received ${value}.`);
  }
  return value;
}

function readNumber(env, name, { defaultValue, min, max } = {}) {
  const raw = env[name];
  if (isBlank(raw)) {
    return defaultValue;
  }
  const text = String(raw).trim();
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new ConfigError(`${name} must be a number, received "${raw}".`);
  }
  if (min !== undefined && value < min) {
    throw new ConfigError(`${name} must be >= ${min}, received ${value}.`);
  }
  if (max !== undefined && value > max) {
    throw new ConfigError(`${name} must be <= ${max}, received ${value}.`);
  }
  return value;
}

function readBoolean(env, name, { defaultValue } = {}) {
  const raw = env[name];
  if (isBlank(raw)) {
    return defaultValue;
  }
  const text = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(text)) return false;
  throw new ConfigError(`${name} must be a boolean (true/false), received "${raw}".`);
}

/**
 * Parse and validate configuration from an environment-like object.
 * Does not read process.env directly so it can be unit tested.
 */
function parseConfig(env = {}) {
  const logLevel = readString(env, 'LOG_LEVEL', { defaultValue: DEFAULTS.LOG_LEVEL }).toLowerCase();
  if (!LOG_LEVELS.includes(logLevel)) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, received "${logLevel}".`);
  }

  const auth = readString(env, 'MC_AUTH', { defaultValue: DEFAULTS.MC_AUTH }).toLowerCase();

  const config = {
    minecraft: {
      host: readString(env, 'MC_HOST', { required: true }),
      port: readInteger(env, 'MC_PORT', { defaultValue: DEFAULTS.MC_PORT, min: 1, max: 65535 }),
      username: readString(env, 'MC_USERNAME', { required: true }),
      version: readString(env, 'MC_VERSION', { defaultValue: '' }) || undefined,
      auth,
    },
    jump: {
      intervalMs: readInteger(env, 'JUMP_INTERVAL_MS', {
        defaultValue: DEFAULTS.JUMP_INTERVAL_MS,
        min: 1000,
      }),
      count: readInteger(env, 'JUMP_COUNT', { defaultValue: DEFAULTS.JUMP_COUNT, min: 1, max: 100 }),
      gapMs: readInteger(env, 'JUMP_GAP_MS', { defaultValue: DEFAULTS.JUMP_GAP_MS, min: 50 }),
      durationMs: readInteger(env, 'JUMP_DURATION_MS', {
        defaultValue: DEFAULTS.JUMP_DURATION_MS,
        min: 10,
        max: 5000,
      }),
    },
    inventory: {
      intervalMs: readInteger(env, 'INVENTORY_CHECK_INTERVAL_MS', {
        defaultValue: DEFAULTS.INVENTORY_CHECK_INTERVAL_MS,
        min: 0,
      }),
    },
    antiAfk: {
      intervalMs: readInteger(env, 'ANTI_AFK_INTERVAL_MS', {
        defaultValue: DEFAULTS.ANTI_AFK_INTERVAL_MS,
        min: 0,
      }),
      moveDurationMinMs: readInteger(env, 'ANTI_AFK_MOVE_DURATION_MIN_MS', {
        defaultValue: DEFAULTS.ANTI_AFK_MOVE_DURATION_MIN_MS,
        min: 100,
      }),
      moveDurationMaxMs: readInteger(env, 'ANTI_AFK_MOVE_DURATION_MAX_MS', {
        defaultValue: DEFAULTS.ANTI_AFK_MOVE_DURATION_MAX_MS,
        min: 100,
      }),
      lookAroundChance: readNumber(env, 'ANTI_AFK_LOOK_AROUND_CHANCE', {
        defaultValue: DEFAULTS.ANTI_AFK_LOOK_AROUND_CHANCE,
        min: 0,
        max: 1,
      }),
      jumpChance: readNumber(env, 'ANTI_AFK_JUMP_CHANCE', {
        defaultValue: DEFAULTS.ANTI_AFK_JUMP_CHANCE,
        min: 0,
        max: 1,
      }),
    },
    reconnect: {
      enabled: readBoolean(env, 'RECONNECT_ENABLED', { defaultValue: DEFAULTS.RECONNECT_ENABLED }),
      initialMs: readInteger(env, 'RECONNECT_INITIAL_MS', {
        defaultValue: DEFAULTS.RECONNECT_INITIAL_MS,
        min: 1000,
      }),
      maxMs: readInteger(env, 'RECONNECT_MAX_MS', {
        defaultValue: DEFAULTS.RECONNECT_MAX_MS,
        min: 1000,
      }),
      factor: readNumber(env, 'RECONNECT_FACTOR', {
        defaultValue: DEFAULTS.RECONNECT_FACTOR,
        min: 1,
        max: 10,
      }),
    },
    http: {
      enabled: readBoolean(env, 'ENABLE_HTTP', { defaultValue: DEFAULTS.ENABLE_HTTP }),
      port: readInteger(env, 'PORT', { defaultValue: DEFAULTS.PORT, min: 1, max: 65535 }),
    },
    logLevel,
  };

  if (config.reconnect.maxMs < config.reconnect.initialMs) {
    throw new ConfigError(
      `RECONNECT_MAX_MS (${config.reconnect.maxMs}) must be >= RECONNECT_INITIAL_MS (${config.reconnect.initialMs}).`,
    );
  }

  if (config.jump.durationMs >= config.jump.gapMs) {
    throw new ConfigError(
      `JUMP_DURATION_MS (${config.jump.durationMs}) must be less than JUMP_GAP_MS (${config.jump.gapMs}).`,
    );
  }

  return Object.freeze(config);
}

module.exports = { parseConfig, ConfigError, DEFAULTS, LOG_LEVELS };
