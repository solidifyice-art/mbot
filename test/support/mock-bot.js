'use strict';

const { EventEmitter } = require('events');

/** A minimal stand-in for a Mineflayer bot, used to avoid live connections. */
function createMockBot({ username = 'TestBot' } = {}) {
  const bot = new EventEmitter();
  bot.username = username;
  bot.entity = null;
  bot.ended = false;
  bot.controlStates = [];
  bot.quitCalls = 0;
  bot.inventory = { slots: [] };

  bot.setControlState = (control, state) => {
    bot.controlStates.push({ control, state });
  };

  bot.quit = () => {
    bot.quitCalls += 1;
    bot.ended = true;
    bot.emit('end', 'quit');
  };

  bot.spawn = () => {
    bot.entity = { position: { x: 0, y: 64, z: 0 } };
    bot.emit('spawn');
  };

  return bot;
}

/** Create a createBot function that records every instance it produces. */
function createBotFactory(options = {}) {
  const instances = [];
  function createBot(createOptions) {
    const bot = createMockBot(options);
    bot.createOptions = createOptions;
    instances.push(bot);
    return bot;
  }
  createBot.instances = instances;
  return createBot;
}

const nullLogger = {
  level: 'silent',
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return nullLogger;
  },
};

/** Build a config object shaped like parseConfig() output for manager tests. */
function testConfig(overrides = {}) {
  const base = {
    minecraft: {
      host: 'localhost',
      port: 25565,
      username: 'TestBot',
      version: undefined,
      auth: 'offline',
    },
    jump: { intervalMs: 1000, count: 2, gapMs: 1000, durationMs: 200 },
    inventory: { intervalMs: 60000 },
    reconnect: { enabled: true, initialMs: 1000, maxMs: 8000, factor: 2 },
    http: { enabled: false, port: 3000 },
    logLevel: 'error',
  };

  return {
    ...base,
    ...overrides,
    minecraft: { ...base.minecraft, ...(overrides.minecraft || {}) },
    jump: { ...base.jump, ...(overrides.jump || {}) },
    inventory: { ...base.inventory, ...(overrides.inventory || {}) },
    reconnect: { ...base.reconnect, ...(overrides.reconnect || {}) },
    http: { ...base.http, ...(overrides.http || {}) },
  };
}

module.exports = { createMockBot, createBotFactory, nullLogger, testConfig };
