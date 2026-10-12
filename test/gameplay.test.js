'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { renderMap, blockChar } = require('../src/gameplay');
const { createMockBot } = require('./support/mock-bot');

test('maps block names to characters', () => {
  assert.equal(blockChar('stone'), '#');
  assert.equal(blockChar('deepslate'), '#');
  assert.equal(blockChar('oak_log'), 'T');
  assert.equal(blockChar('oak_leaves'), 'L');
  assert.equal(blockChar('water'), '~');
  assert.equal(blockChar('lava'), '!');
  assert.equal(blockChar('diamond_ore'), '*');
  assert.equal(blockChar('grass_block'), '"');
  assert.equal(blockChar('sand'), ':');
  assert.equal(blockChar('air'), ' ');
  assert.equal(blockChar('some_unknown_block'), '?');
});

test('renders a square map with the bot at the center', () => {
  const bot = createMockBot();
  bot.spawn();
  const map = renderMap(bot, { radius: 2 });
  const lines = map.split('\n');
  assert.equal(lines.length, 5);
  for (const line of lines) assert.equal(line.length, 5);
  assert.equal(lines[2][2], '@');
});

test('shows the surface block under a column', () => {
  const bot = createMockBot();
  bot.spawn();
  bot.setBlock(1, 63, 0, 'stone');
  const lines = renderMap(bot, { radius: 2 }).split('\n');
  assert.equal(lines[2][3], '#');
});

test('throws without a connected bot', () => {
  assert.throws(() => renderMap(null, { radius: 1 }), /not connected/);
});
