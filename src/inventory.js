'use strict';

/**
 * Periodically reads the bot's inventory window and logs a compact summary of
 * every non-empty stack (item name, count, and an "enchanted" marker when the
 * stack has enchantments). Uses a single tracked timer at a time so the next
 * check can be cancelled deterministically.
 *
 * Lifecycle: a checker is created for one bot instance, started on spawn and
 * stopped on disconnect/shutdown. It is never reused across bot instances.
 */
class InventoryChecker {
  constructor({
    bot,
    intervalMs,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    logger = null,
  }) {
    if (!bot || !bot.inventory || !Array.isArray(bot.inventory.slots)) {
      throw new Error('InventoryChecker requires a bot with inventory.slots.');
    }

    this.bot = bot;
    this.intervalMs = intervalMs;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.logger = logger;

    this.running = false;
    this.timer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.logger?.info(`Inventory checker started; checking every ${this.intervalMs}ms.`);
    this.#check();
    this.#schedule();
  }

  stop() {
    if (!this.running && this.timer === null) return;
    this.running = false;
    this.#clearTimer();
    this.logger?.debug('Inventory checker stopped.');
  }

  #schedule() {
    if (!this.running) return;
    this.#clearTimer();
    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      if (!this.running) return;
      this.#check();
      this.#schedule();
    }, this.intervalMs);
  }

  #clearTimer() {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
  }

  #check() {
    if (!this.running) return;

    const slots = this.bot.inventory.slots;
    const stacks = [];

    for (const item of slots) {
      if (!item) continue;
      const count = typeof item.count === 'number' ? item.count : 1;
      const enchanted = Array.isArray(item.enchants) && item.enchants.length > 0;
      stacks.push(`${item.name || 'unknown'} x${count}${enchanted ? ' (enchanted)' : ''}`);
    }

    if (stacks.length === 0) {
      this.logger?.info('Inventory is empty.');
      return;
    }
    this.logger?.info(`Inventory: ${stacks.join(', ')}.`);
  }
}

module.exports = { InventoryChecker };