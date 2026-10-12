'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { BotShell } = require('../src/shell');
const { BotActions } = require('../src/actions');
const { createMockBot, nullLogger } = require('./support/mock-bot');

function makeShell({ spawn = true } = {}) {
  const bot = createMockBot();
  if (spawn) bot.spawn();
  const manager = new EventEmitter();
  manager._bot = bot;
  manager.jumpToggles = [];
  manager.walkToggles = [];
  manager.getBot = () => manager._bot;
  manager.getStatus = () => ({ state: 'connected', connected: true });
  manager.setJumpEnabled = (value) => {
    manager.jumpToggles.push(value);
    return value;
  };
  manager.setAntiAfkEnabled = (value) => {
    manager.walkToggles.push(value);
    return value;
  };
  const actions = new BotActions({ getBot: () => manager.getBot(), logger: nullLogger });
  const shell = new BotShell({ manager, actions, logger: nullLogger });
  return { shell, manager, bot };
}

test('requires a manager with getBot', () => {
  assert.throws(() => new BotShell({ manager: {}, actions: {} }), /getBot/);
});

test('reports unknown commands', async () => {
  const { shell } = makeShell();
  const result = await shell.execute('frobnicate');
  assert.equal(result.ok, false);
  assert.match(result.output, /Unknown command/);
});

test('empty input is rejected', async () => {
  const { shell } = makeShell();
  assert.equal((await shell.execute('   ')).ok, false);
});

test('help lists commands', async () => {
  const { shell } = makeShell();
  const result = await shell.execute('help');
  assert.equal(result.ok, true);
  assert.match(result.output, /walk on\|off/);
});

test('where reports the position', async () => {
  const { shell } = makeShell();
  const result = await shell.execute('where');
  assert.equal(result.ok, true);
  assert.match(result.output, /x=0 y=64 z=0/);
});

test('status includes manager and bot detail', async () => {
  const { shell } = makeShell();
  const result = await shell.execute('status');
  const parsed = JSON.parse(result.output);
  assert.equal(parsed.state, 'connected');
  assert.equal(parsed.detail.position.y, 64);
});

test('inventory lists items', async () => {
  const { shell, bot } = makeShell();
  bot.inventory.slots = [{ name: 'stone', count: 2, enchants: [] }];
  const result = await shell.execute('inventory');
  assert.match(result.output, /stone x2/);
});

test('walk and jump toggles update the manager', async () => {
  const { shell, manager } = makeShell();
  await shell.execute('walk off');
  await shell.execute('jump off');
  await shell.execute('walk on');
  assert.deepEqual(manager.walkToggles, [false, true]);
  assert.deepEqual(manager.jumpToggles, [false]);
  assert.match((await shell.execute('jumps')).output, /jump=false walk=true/);
});

test('say sends chat and records it in the feed', async () => {
  const { shell, bot } = makeShell();
  await shell.execute('say hi there');
  assert.deepEqual(bot.chatMessages, ['hi there']);
  assert.match(shell.getFeed().at(-1).text, /hi there/);
});

test('incoming chat is captured in the feed', () => {
  const { shell, manager, bot } = makeShell({ spawn: false });
  manager.emit('spawn', bot);
  bot.emit('chat', 'Alice', 'hello bot');
  assert.equal(shell.getFeed().at(-1).type, 'chat');
  assert.match(shell.getFeed().at(-1).text, /<Alice> hello bot/);
});

test('clear empties the feed', async () => {
  const { shell, manager, bot } = makeShell({ spawn: false });
  manager.emit('spawn', bot);
  await shell.execute('clear');
  assert.equal(shell.getFeed().length, 0);
});

test('map returns an ascii grid', async () => {
  const { shell } = makeShell();
  const result = await shell.execute('map 1');
  assert.equal(result.ok, true);
  assert.match(result.output, /@/);
});

test('give works in creative mode', async () => {
  const { shell, bot } = makeShell();
  bot.game.gameMode = 'creative';
  const result = await shell.execute('give dirt 3');
  assert.equal(result.ok, true);
  assert.match(result.output, /dirt x3/);
});
