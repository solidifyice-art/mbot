'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BotActions } = require('../src/actions');
const { createMockBot, nullLogger } = require('./support/mock-bot');

function makeActions(bot) {
  return new BotActions({ getBot: () => bot, logger: nullLogger });
}

test('requires a getBot function', () => {
  assert.throws(() => new BotActions({}), /getBot/);
});

test('getStatus returns null without a bot', () => {
  assert.equal(makeActions(null).getStatus(), null);
});

test('status reflects gamemode, position and creative flag', () => {
  const bot = createMockBot();
  bot.spawn();
  bot.game.gameMode = 'creative';
  const actions = makeActions(bot);
  const status = actions.getStatus();
  assert.equal(status.gamemode, 'creative');
  assert.equal(status.position.y, 64);
  assert.equal(status.health, 20);
  assert.equal(actions.isCreative(), true);
});

test('inventory lists stacks with enchantment and count', () => {
  const bot = createMockBot();
  bot.spawn();
  bot.inventory.slots = [{ name: 'stone', count: 3, enchants: [] }, { name: 'sword', count: 1, enchants: [{}] }];
  const items = makeActions(bot).getInventory();
  assert.deepEqual(items, [
    { name: 'stone', count: 3, enchanted: false },
    { name: 'sword', count: 1, enchanted: true },
  ]);
});

test('give requires creative mode', async () => {
  const bot = createMockBot();
  bot.spawn();
  bot.game.gameMode = 'survival';
  await assert.rejects(makeActions(bot).give('dirt'), /creative/);
});

test('give grants an item in creative mode', async () => {
  const bot = createMockBot();
  bot.spawn();
  bot.game.gameMode = 'creative';
  const out = await makeActions(bot).give('dirt', 5);
  assert.equal(out, 'dirt x5');
  assert.equal(bot.creativeSlots.length, 1);
  assert.equal(bot.creativeSlots[0].slot, 36);
});

test('breakBlock digs the block at a position', async () => {
  const bot = createMockBot();
  bot.spawn();
  bot.setBlock(1, 64, 0, 'stone');
  const out = await makeActions(bot).breakBlock(1, 64, 0);
  assert.deepEqual(bot.digs, ['stone']);
  assert.match(out, /broke stone/);
});

test('breakBlock rejects empty positions', async () => {
  const bot = createMockBot();
  bot.spawn();
  await assert.rejects(makeActions(bot).breakBlock(0, 64, 0), /No block/);
});

test('placeBlock equips the item and places against a neighbor', async () => {
  const bot = createMockBot();
  bot.spawn();
  bot.setBlock(0, 63, 0, 'stone');
  bot.inventory.slots = [{ name: 'dirt', count: 5, enchants: [] }];
  await makeActions(bot).placeBlock(0, 64, 0, 'dirt');
  assert.equal(bot.places.length, 1);
  assert.deepEqual(bot.places[0].face, { x: 0, y: 1, z: 0 });
  assert.equal(bot.equips[0].name, 'dirt');
});

test('placeBlock rejects occupied positions', async () => {
  const bot = createMockBot();
  bot.spawn();
  bot.setBlock(0, 64, 0, 'stone');
  await assert.rejects(makeActions(bot).placeBlock(0, 64, 0), /occupied/);
});

test('chat and command send the right text', () => {
  const bot = createMockBot();
  bot.spawn();
  const actions = makeActions(bot);
  actions.chat('hello');
  actions.command('/gamemode creative');
  actions.command('time set day');
  assert.deepEqual(bot.chatMessages, ['hello', '/gamemode creative', '/time set day']);
});

test('chat rejects empty messages', () => {
  const bot = createMockBot();
  bot.spawn();
  assert.throws(() => makeActions(bot).chat('  '), /empty/);
});
