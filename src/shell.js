'use strict';

const { EventEmitter } = require('events');
const { renderMap } = require('./gameplay');

const HELP = [
  'Commands:',
  '  status                 bot state (position, gamemode, health, held item)',
  '  where                  current position',
  '  map [radius]           ASCII map of nearby surface blocks',
  '  inv | inventory        list inventory stacks',
  '  players                list online players',
  '  gamemode               show current gamemode',
  '  give <item> [count]    creative-mode item grant',
  '  break <x> <y> <z>      break the block at a position',
  '  place <x> <y> <z> [item]  place a block at a position',
  '  say <message>          send chat',
  '  cmd <command...>       run a server command (leading / optional)',
  '  walk on|off            enable/disable random walking (anti-AFK)',
  '  jump on|off            enable/disable the jump routine',
  '  jumps                  show jump + walk enabled state',
  '  feed [count]           recent chat/event feed',
  '  clear                  clear the feed buffer',
  '  help                   show this help',
];

/**
 * Remote bot shell. Parses textual commands, executes them against the current
 * bot, and keeps a rolling feed of chat/events plus runtime on/off toggles for
 * the jump routine and anti-AFK walking.
 */
class BotShell extends EventEmitter {
  constructor({ manager, actions, logger = null, feedLimit = 100 } = {}) {
    super();
    if (typeof manager?.getBot !== 'function') {
      throw new Error('BotShell requires a manager with getBot().');
    }
    if (!actions) {
      throw new Error('BotShell requires actions.');
    }
    this.manager = manager;
    this.actions = actions;
    this.logger = logger;
    this.feedLimit = feedLimit;
    this.feed = [];
    this.attachedBot = null;

    this.jumpEnabled = true;
    this.walkEnabled = true;

    if (typeof manager.on === 'function') {
      manager.on('spawn', (bot) => this.#attach(bot));
      manager.on('end', (reason) => this.#push('system', `disconnected (${reason || 'unknown'})`));
    }
  }

  #push(type, text) {
    const entry = { type, text, at: Date.now() };
    this.feed.push(entry);
    while (this.feed.length > this.feedLimit) this.feed.shift();
    this.emit('feed', entry);
  }

  #attach(bot) {
    if (!bot || typeof bot.on !== 'function') return;
    if (this.attachedBot === bot) return;
    this.attachedBot = bot;
    this.#push('system', `spawned as ${bot.username || 'unknown'}`);
    if (typeof bot.on === 'function') {
      bot.on('chat', (username, message) => {
        if (username === bot.username) return;
        this.#push('chat', `<${username}> ${message}`);
      });
      bot.on('message', (json) => {
        const text = json && typeof json.toString === 'function' ? json.toString() : String(json);
        if (text) this.#push('message', text);
      });
    }
  }

  getFeed(count) {
    const n = Number.isFinite(count) ? Math.max(1, count) : this.feed.length;
    return this.feed.slice(-n);
  }

  getStatus() {
    const status = this.manager.getStatus();
    const detail = this.actions.getStatus();
    return { ...status, detail };
  }

  async execute(line) {
    const raw = String(line || '').trim();
    if (raw === '') return { ok: false, output: 'Empty command. Type "help".' };

    const spaceIndex = raw.indexOf(' ');
    const name = (spaceIndex === -1 ? raw : raw.slice(0, spaceIndex)).toLowerCase();
    const rest = spaceIndex === -1 ? '' : raw.slice(spaceIndex + 1).trim();
    const args = rest === '' ? [] : rest.split(/\s+/);

    try {
      return await this.#run(name, args, rest);
    } catch (err) {
      return { ok: false, output: `Error: ${err && err.message ? err.message : err}` };
    }
  }

  async #run(name, args, rest) {
    switch (name) {
      case 'help':
        return { ok: true, output: HELP.join('\n') };
      case 'status':
        return { ok: true, output: JSON.stringify(this.getStatus(), null, 2) };
      case 'where': {
        const detail = this.actions.getStatus();
        if (!detail) return { ok: false, output: 'Bot is not connected.' };
        const p = detail.position;
        return { ok: true, output: `x=${p.x} y=${p.y} z=${p.z} (${detail.dimension})` };
      }
      case 'map': {
        const radius = args[0] ? Number(args[0]) : 8;
        const bot = this.manager.getBot();
        if (!bot || !bot.entity) return { ok: false, output: 'Bot is not connected.' };
        return { ok: true, output: renderMap(bot, { radius }) };
      }
      case 'inv':
      case 'inventory': {
        const items = this.actions.getInventory();
        if (items.length === 0) return { ok: true, output: 'Inventory is empty.' };
        return {
          ok: true,
          output: items.map((i) => `${i.name} x${i.count}${i.enchanted ? ' (enchanted)' : ''}`).join('\n'),
        };
      }
      case 'players': {
        const players = this.actions.getPlayers();
        if (players.length === 0) return { ok: true, output: 'No players.' };
        return { ok: true, output: players.map((p) => `${p.username}${p.ping != null ? ` (${p.ping}ms)` : ''}`).join('\n') };
      }
      case 'gamemode':
        return { ok: true, output: this.actions.getGamemode() || 'unknown' };
      case 'give': {
        const out = await this.actions.give(args[0], args[1] ? Number(args[1]) : 1);
        return { ok: true, output: `Gave ${out}` };
      }
      case 'break': {
        const out = await this.actions.breakBlock(args[0], args[1], args[2]);
        return { ok: true, output: out };
      }
      case 'place': {
        const out = await this.actions.placeBlock(args[0], args[1], args[2], args[3]);
        return { ok: true, output: out };
      }
      case 'say': {
        const out = this.actions.chat(rest);
        this.#push('say', out);
        return { ok: true, output: `Said: ${out}` };
      }
      case 'cmd': {
        const out = this.actions.command(rest);
        this.#push('cmd', out);
        return { ok: true, output: `Ran: ${out}` };
      }
      case 'walk': {
        const on = args[0] !== 'off';
        this.walkEnabled = on;
        this.manager.setAntiAfkEnabled(on);
        return { ok: true, output: `Random walking ${on ? 'enabled' : 'disabled'}.` };
      }
      case 'jump': {
        const on = args[0] !== 'off';
        this.jumpEnabled = on;
        this.manager.setJumpEnabled(on);
        return { ok: true, output: `Jump routine ${on ? 'enabled' : 'disabled'}.` };
      }
      case 'jumps':
        return { ok: true, output: `jump=${this.jumpEnabled} walk=${this.walkEnabled}` };
      case 'feed': {
        const count = args[0] ? Number(args[0]) : undefined;
        const entries = this.getFeed(count);
        return {
          ok: true,
          output: entries.length
            ? entries.map((e) => `[${e.type}] ${e.text}`).join('\n')
            : 'Feed is empty.',
        };
      }
      case 'clear':
        this.feed = [];
        return { ok: true, output: 'Feed cleared.' };
      default:
        return { ok: false, output: `Unknown command "${name}". Type "help".` };
    }
  }
}

module.exports = { BotShell, HELP };