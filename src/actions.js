'use strict';

const { Vec3 } = require('vec3');

const FACE_NEIGHBORS = [
  new Vec3(0, -1, 0),
  new Vec3(0, 1, 0),
  new Vec3(1, 0, 0),
  new Vec3(-1, 0, 0),
  new Vec3(0, 0, 1),
  new Vec3(0, 0, -1),
];

function itemLabel(item) {
  if (!item) return 'unknown';
  const count = typeof item.count === 'number' ? item.count : 1;
  const enchanted = Array.isArray(item.enchants) && item.enchants.length > 0;
  return `${item.name || 'unknown'} x${count}${enchanted ? ' (enchanted)' : ''}`;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function negZero(value) {
  return value === 0 ? 0 : -value;
}

/**
 * High-level bot actions used by the bot shell: status inspection, chat,
 * gamemode/creative handling, and block break/place. Every method resolves the
 * current bot lazily so it works across reconnects.
 */
class BotActions {
  constructor({ getBot, logger = null } = {}) {
    if (typeof getBot !== 'function') {
      throw new Error('BotActions requires a getBot() function.');
    }
    this.getBot = getBot;
    this.logger = logger;
  }

  #requireBot() {
    const bot = this.getBot();
    if (!bot || !bot.entity) {
      throw new Error('Bot is not connected.');
    }
    return bot;
  }

  getStatus() {
    const bot = this.getBot();
    if (!bot || !bot.entity) return null;
    const pos = bot.entity.position;
    return {
      username: bot.username,
      position: { x: round(pos.x), y: round(pos.y), z: round(pos.z) },
      yaw: round(bot.entity.yaw, 3),
      pitch: round(bot.entity.pitch, 3),
      gamemode: this.getGamemode(),
      dimension: bot.game ? bot.game.dimension : null,
      health: typeof bot.health === 'number' ? bot.health : null,
      food: typeof bot.food === 'number' ? bot.food : null,
      onGround: !!bot.entity.onGround,
      heldItem: itemLabel(bot.heldItem),
    };
  }

  getGamemode() {
    const bot = this.getBot();
    return bot && bot.game ? bot.game.gameMode : null;
  }

  isCreative() {
    return this.getGamemode() === 'creative';
  }

  getPlayers() {
    const bot = this.getBot();
    if (!bot || !bot.players) return [];
    return Object.values(bot.players).map((p) => ({
      username: p.username,
      ping: p.ping,
      gamemode: p.gamemode,
    }));
  }

  getInventory() {
    const bot = this.getBot();
    if (!bot || !bot.inventory || typeof bot.inventory.items !== 'function') return [];
    return bot.inventory.items().map((item) => {
      const count = typeof item.count === 'number' ? item.count : 1;
      const enchanted = Array.isArray(item.enchants) && item.enchants.length > 0;
      return { name: item.name, count, enchanted };
    });
  }

  chat(message) {
    const bot = this.#requireBot();
    if (typeof message !== 'string' || message.trim() === '') {
      throw new Error('Message is empty.');
    }
    bot.chat(message);
    return message;
  }

  command(command) {
    const bot = this.#requireBot();
    const text = String(command || '').trim();
    if (text === '') throw new Error('Command is empty.');
    bot.chat(text.startsWith('/') ? text : `/${text}`);
    return text.startsWith('/') ? text : `/${text}`;
  }

  async give(name, count = 1) {
    const bot = this.#requireBot();
    if (!name) throw new Error('Item name is required.');
    if (!this.isCreative()) {
      throw new Error('Not in creative mode; cannot grant items.');
    }
    if (!bot.creative || typeof bot.creative.setInventorySlot !== 'function') {
      throw new Error('Creative inventory is unavailable.');
    }
    if (!bot.registry || !bot.registry.itemsByName) {
      throw new Error('Item registry is unavailable.');
    }
    const itemType = bot.registry.itemsByName[name];
    if (!itemType) throw new Error(`Unknown item "${name}".`);
    const Item = require('prismarine-item')(bot.version);
    const stack = new Item(itemType.id, Math.max(1, count));
    const slot = 36;
    await bot.creative.setInventorySlot(slot, stack);
    return `${name} x${count}`;
  }

  async breakBlock(x, y, z) {
    const bot = this.#requireBot();
    const pos = new Vec3(Number(x), Number(y), Number(z));
    const block = bot.blockAt(pos);
    if (!block || block.name === 'air') throw new Error('No block at that position.');
    if (typeof bot.dig !== 'function') throw new Error('Bot cannot dig.');
    await bot.dig(block);
    return `broke ${block.name} at ${pos.x} ${pos.y} ${pos.z}`;
  }

  async placeBlock(x, y, z, itemName) {
    const bot = this.#requireBot();
    const pos = new Vec3(Number(x), Number(y), Number(z));
    const existing = bot.blockAt(pos);
    if (existing && existing.name !== 'air') {
      throw new Error(`Position is occupied by ${existing.name}.`);
    }

    let reference = null;
    let face = null;
    for (const offset of FACE_NEIGHBORS) {
      const neighborPos = pos.plus(offset);
      const neighbor = bot.blockAt(neighborPos);
      if (neighbor && neighbor.name !== 'air' && neighbor.boundingBox === 'block') {
        reference = neighbor;
        face = new Vec3(negZero(offset.x), negZero(offset.y), negZero(offset.z));
        break;
      }
    }
    if (!reference) throw new Error('No solid block to place against.');

    if (itemName) {
      await this.equip(itemName);
    }
    if (typeof bot.placeBlock !== 'function') throw new Error('Bot cannot place blocks.');
    await bot.placeBlock(reference, face);
    return `placed ${itemName || bot.heldItem?.name || 'block'} at ${pos.x} ${pos.y} ${pos.z}`;
  }

  async equip(name) {
    const bot = this.#requireBot();
    if (!bot.inventory || typeof bot.inventory.items !== 'function') {
      throw new Error('No inventory available.');
    }
    const item = bot.inventory.items().find((i) => i.name === name);
    if (!item) throw new Error(`Item "${name}" is not in the inventory.`);
    await bot.equip(item, 'hand');
    return name;
  }
}

module.exports = { BotActions, itemLabel };