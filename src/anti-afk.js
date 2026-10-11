'use strict';

/**
 * Random movement to avoid AFK kicks. Picks a random direction, moves for a
 * short burst, randomly turns, and occasionally jumps. Runs on a timer so the
 * next action can be cancelled deterministically.
 */
class AntiAfk {
  constructor({
    bot,
    intervalMs = 120000,
    moveDurationMinMs = 1000,
    moveDurationMaxMs = 2000,
    lookAroundChance = 0.4,
    jumpChance = 0.3,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    logger = null,
  }) {
    if (!bot || typeof bot.setControlState !== 'function') {
      throw new Error('AntiAfk requires a bot with setControlState().');
    }
    this.bot = bot;
    this.intervalMs = intervalMs;
    this.moveDurationMinMs = moveDurationMinMs;
    this.moveDurationMaxMs = moveDurationMaxMs;
    this.lookAroundChance = lookAroundChance;
    this.jumpChance = jumpChance;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.logger = logger;

    this.running = false;
    this.timer = null;
    this.moveTimer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.logger?.info(`Anti-AFK started; action every ${this.intervalMs}ms.`);
    this.#schedule();
  }

  stop() {
    if (!this.running && this.timer === null && this.moveTimer === null) return;
    this.running = false;
    this.#clearTimer();
    this.#clearMoveTimer();
    this.#releaseAllControls();
    this.logger?.debug('Anti-AFK stopped.');
  }

  #schedule() {
    if (!this.running) return;
    this.#clearTimer();
    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      if (!this.running) return;
      this.#doRandomAction();
      this.#schedule();
    }, this.intervalMs);
  }

  #clearTimer() {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
  }

  #clearMoveTimer() {
    if (this.moveTimer !== null) {
      this.clearTimeoutFn(this.moveTimer);
      this.moveTimer = null;
    }
  }

  #releaseAllControls() {
    const controls = ['forward', 'back', 'left', 'right', 'jump', 'sprint'];
    for (const c of controls) {
      try { this.bot.setControlState(c, false); } catch {}
    }
  }

  #randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  #doRandomAction() {
    if (!this.running) return;

    const actions = ['forward', 'back', 'left', 'right'];
    const action = actions[this.#randomInt(0, actions.length - 1)];

    this.logger?.debug(`Anti-AFK: moving ${action}`);
    this.bot.setControlState(action, true);

    const duration = this.#randomInt(this.moveDurationMinMs, this.moveDurationMaxMs);
    this.moveTimer = this.setTimeoutFn(() => {
      this.moveTimer = null;
      if (!this.running) return;
      this.bot.setControlState(action, false);

      if (Math.random() < this.lookAroundChance) {
        this.#randomLook();
      }
      if (Math.random() < this.jumpChance) {
        this.bot.setControlState('jump', true);
        this.setTimeoutFn(() => { this.bot.setControlState('jump', false); }, 200);
      }
    }, duration);
  }

  #randomLook() {
    const yawOffset = (Math.random() - 0.5) * Math.PI;
    const pitchOffset = (Math.random() - 0.5) * (Math.PI / 3);
    const entity = this.bot.entity;
    if (!entity) return;
    const yaw = entity.yaw + yawOffset;
    const pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, entity.pitch + pitchOffset));
    this.bot.look(yaw, pitch, false);
  }
}

module.exports = { AntiAfk };