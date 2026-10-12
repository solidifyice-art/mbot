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
  bot.version = '1.21.11';
  bot.game = { gameMode: 'survival', dimension: 'minecraft:overworld' };
  bot.health = 20;
  bot.food = 20;
  bot.heldItem = null;
  bot.players = {};
  bot.chatMessages = [];
  bot.digs = [];
  bot.places = [];
  bot.equips = [];
  bot.creativeSlots = [];
  bot.looks = [];

  const key = (v) => `${Math.floor(v.x)},${Math.floor(v.y)},${Math.floor(v.z)}`;
  bot.blocks = new Map();
  bot.setBlock = (x, y, z, name, boundingBox = 'block') => {
    bot.blocks.set(key({ x, y, z }), { name, position: { x, y, z }, boundingBox });
  };
  bot.blockAt = (pos) => bot.blocks.get(key(pos)) || { name: 'air', position: pos, boundingBox: 'empty' };

  bot.inventory = {
    slots: [],
    items() {
      return this.slots.filter(Boolean);
    },
  };

  bot.registry = {
    itemsByName: {
      dirt: { id: 1, name: 'dirt' },
      stone: { id: 2, name: 'stone' },
      glass: { id: 3, name: 'glass' },
      oak_planks: { id: 4, name: 'oak_planks' },
      enchanted_golden_apple: { id: 5, name: 'enchanted_golden_apple' },
    },
  };

  bot.creative = {
    setInventorySlot: async (slot, item) => {
      bot.creativeSlots.push({ slot, item });
    },
  };

  bot.setControlState = (control, state) => {
    bot.controlStates.push({ control, state });
  };

  bot.dig = async (block) => {
    bot.digs.push(block.name);
  };

  bot.placeBlock = async (ref, face) => {
    bot.places.push({ ref: ref.name, face: { x: face.x, y: face.y, z: face.z } });
  };

  bot.equip = async (item, dest) => {
    bot.equips.push({ name: item.name, dest });
    bot.heldItem = item;
  };

  bot.chat = (message) => {
    bot.chatMessages.push(message);
  };

  bot.look = (yaw, pitch) => {
    bot.looks.push({ yaw, pitch });
    if (bot.entity) {
      bot.entity.yaw = yaw;
      bot.entity.pitch = pitch;
    }
  };

  bot.quit = () => {
    bot.quitCalls += 1;
    bot.ended = true;
    bot.emit('end', 'quit');
  };

  bot.spawn = () => {
    bot.entity = { position: { x: 0, y: 64, z: 0 }, yaw: 0, pitch: 0, onGround: true };
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
    antiAfk: { intervalMs: 120000, moveDurationMinMs: 1000, moveDurationMaxMs: 2000, lookAroundChance: 0.4, jumpChance: 0.3 },
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
