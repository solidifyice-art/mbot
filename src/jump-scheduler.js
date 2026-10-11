'use strict';

/**
 * Periodically performs a short burst of jumps. Uses a single tracked timer at
 * a time so every pending action can be cancelled deterministically.
 *
 * Lifecycle: a scheduler is created for one bot instance, started on spawn and
 * stopped on disconnect/shutdown. It is never reused across bot instances.
 */
class JumpScheduler {
  constructor({
    bot,
    intervalMs,
    count,
    gapMs,
    durationMs,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    logger = null,
  }) {
    if (!bot || typeof bot.setControlState !== 'function') {
      throw new Error('JumpScheduler requires a bot with setControlState().');
    }

    this.bot = bot;
    this.intervalMs = intervalMs;
    this.count = count;
    this.gapMs = gapMs;
    this.durationMs = durationMs;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.logger = logger;

    this.running = false;
    this.holdingJump = false;
    this.timer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.logger?.info(`Jump scheduler started; first routine in ${this.intervalMs}ms.`);
    this.#schedule(() => this.#startRoutine(), this.intervalMs);
  }

  stop() {
    if (!this.running && !this.holdingJump && this.timer === null) return;
    this.running = false;
    this.#clearTimer();
    this.#releaseJump();
    this.logger?.debug('Jump scheduler stopped.');
  }

  #startRoutine() {
    if (!this.running) return;
    this.jumpsDone = 0;
    this.logger?.info(`Starting jump routine (${this.count} jumps).`);
    this.#doJump();
  }

  #doJump() {
    if (!this.running) return;
    if (!this.#botAlive()) {
      this.logger?.warn('Bot is no longer available; stopping jump routine.');
      this.stop();
      return;
    }

    this.holdingJump = true;
    try {
      this.bot.setControlState('jump', true);
    } catch (err) {
      this.logger?.warn(`Failed to press jump: ${err.message}`);
      this.holdingJump = false;
      this.stop();
      return;
    }

    this.#schedule(() => this.#endJump(), this.durationMs);
  }

  #endJump() {
    if (!this.running) return;
    this.#releaseJump();

    this.jumpsDone += 1;
    this.logger?.debug(`Jump ${this.jumpsDone}/${this.count}.`);

    if (this.jumpsDone < this.count) {
      // Space jump presses approximately `gapMs` apart from each other.
      const wait = Math.max(0, this.gapMs - this.durationMs);
      this.#schedule(() => this.#doJump(), wait);
    } else {
      this.logger?.info(`Jump routine complete; next routine in ${this.intervalMs}ms.`);
      this.#schedule(() => this.#startRoutine(), this.intervalMs);
    }
  }

  #releaseJump() {
    if (!this.holdingJump) return;
    this.holdingJump = false;
    try {
      this.bot.setControlState('jump', false);
    } catch {
      // Bot is already gone; nothing to release.
    }
  }

  #botAlive() {
    return Boolean(this.bot && this.bot.entity);
  }

  #schedule(fn, ms) {
    this.#clearTimer();
    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      fn();
    }, ms);
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  #clearTimer() {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
  }
}

module.exports = { JumpScheduler };
