'use strict';

const MIN_DELAY_MS = 1000;

/**
 * Exponential backoff calculator. `next()` returns the delay to use for the
 * upcoming retry and advances the internal delay for the following attempt.
 */
class Backoff {
  constructor({ initialMs, maxMs, factor = 2 }) {
    if (!Number.isFinite(initialMs) || initialMs < MIN_DELAY_MS) {
      throw new Error(`initialMs must be a number >= ${MIN_DELAY_MS}.`);
    }
    if (!Number.isFinite(maxMs) || maxMs < initialMs) {
      throw new Error('maxMs must be a number >= initialMs.');
    }
    if (!Number.isFinite(factor) || factor < 1) {
      throw new Error('factor must be a number >= 1.');
    }

    this.initialMs = initialMs;
    this.maxMs = maxMs;
    this.factor = factor;
    this.currentMs = initialMs;
    this.attempts = 0;
  }

  /** Return the current delay and advance to the next (capped) delay. */
  next() {
    const delay = this.currentMs;
    this.attempts += 1;
    this.currentMs = Math.min(this.maxMs, Math.round(this.currentMs * this.factor));
    return delay;
  }

  /** Reset after a successful connection. */
  reset() {
    this.currentMs = this.initialMs;
    this.attempts = 0;
  }
}

/**
 * Owns at most one reconnect timer. Prevents duplicate reconnect timers and
 * centralizes cancellation during shutdown.
 */
class ReconnectManager {
  constructor({
    enabled = true,
    initialMs,
    maxMs,
    factor = 2,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    logger = null,
  } = {}) {
    this.enabled = enabled;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.logger = logger;
    this.backoff = new Backoff({ initialMs, maxMs, factor });
    this.timer = null;
  }

  get pending() {
    return this.timer !== null;
  }

  /**
   * Schedule a single reconnect attempt. Returns the delay in milliseconds,
   * or null when disabled or when a reconnect is already pending.
   */
  schedule(callback) {
    if (!this.enabled) return null;
    if (this.timer !== null) return null;

    const delay = this.backoff.next();
    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      callback();
    }, delay);

    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }

    return delay;
  }

  /** Cancel any pending reconnect timer. */
  cancel() {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
  }

  /** Reset the backoff schedule after a successful connection. */
  resetBackoff() {
    this.backoff.reset();
  }
}

module.exports = { Backoff, ReconnectManager, MIN_DELAY_MS };
