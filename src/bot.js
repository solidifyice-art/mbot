'use strict';

const { EventEmitter } = require('events');
const mineflayer = require('mineflayer');
const { ReconnectManager } = require('./reconnect');
const { JumpScheduler } = require('./jump-scheduler');
const { InventoryChecker } = require('./inventory');
const { AntiAfk } = require('./anti-afk');
const { createLogger } = require('./logger');

function describeKick(reason) {
  if (reason === undefined || reason === null) return 'unknown reason';
  if (typeof reason === 'string') return reason;
  if (reason.toString && typeof reason.toString === 'function') {
    const text = reason.toString();
    if (text && text !== '[object Object]') return text;
  }
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

/**
 * Owns the Mineflayer connection lifecycle: exactly one bot instance at a time,
 * graceful teardown, scheduled reconnects and the idle jump routine.
 */
class BotManager extends EventEmitter {
  constructor(config, deps = {}) {
    super();
    this.config = config;
    this.logger = deps.logger || createLogger('info');
    this.createBot = deps.createBot || mineflayer.createBot;
    this.JumpScheduler = deps.JumpScheduler || JumpScheduler;
    this.InventoryChecker = deps.InventoryChecker || InventoryChecker;
    this.AntiAfk = deps.AntiAfk || AntiAfk;
    this.setTimeoutFn = deps.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = deps.clearTimeoutFn || clearTimeout;

    this.bot = null;
    this.jumpScheduler = null;
    this.inventoryChecker = null;
    this.antiAfk = null;
    this.listeners = null;

    this.started = false;
    this.shuttingDown = false;
    this.state = 'idle';
    this.jumpEnabled = config.jump.intervalMs > 0;
    this.antiAfkEnabled = config.antiAfk.intervalMs > 0;
    this.connectedAt = null;
    this.connectionAttempts = 0;
    this.lastDisconnectReason = null;

    this.reconnect = new ReconnectManager({
      enabled: config.reconnect.enabled,
      initialMs: config.reconnect.initialMs,
      maxMs: config.reconnect.maxMs,
      factor: config.reconnect.factor,
      setTimeoutFn: this.setTimeoutFn,
      clearTimeoutFn: this.clearTimeoutFn,
      logger: this.logger,
    });
  }

  start() {
    if (this.started) {
      this.logger.warn('Bot manager already started; ignoring duplicate start.');
      return;
    }
    this.started = true;
    this.shuttingDown = false;
    this.logger.info('Starting bot manager.');
    this.#connect();
  }

  async stop() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.started = false;
    this.logger.info('Stopping bot manager.');
    this.reconnect.cancel();
    this.#teardownBot();
    this.connectedAt = null;
    this.#setState('stopped');
    this.logger.info('Bot manager stopped.');
  }

  getBot() {
    return this.bot;
  }

  setJumpEnabled(enabled) {
    this.jumpEnabled = !!enabled;
    if (this.jumpScheduler) {
      this.jumpScheduler.stop();
      this.jumpScheduler = null;
    }
    if (this.jumpEnabled && this.bot) {
      this.#startJumpScheduler(this.bot);
    }
    return this.jumpEnabled;
  }

  setAntiAfkEnabled(enabled) {
    this.antiAfkEnabled = !!enabled;
    if (this.antiAfk) {
      this.antiAfk.stop();
      this.antiAfk = null;
    }
    if (this.antiAfkEnabled && this.bot) {
      this.#startAntiAfk(this.bot);
    }
    return this.antiAfkEnabled;
  }

  getStatus() {
    return {
      state: this.state,
      connected: this.state === 'connected',
      connectionAttempts: this.connectionAttempts,
      reconnectPending: this.reconnect.pending,
      lastDisconnectReason: this.lastDisconnectReason,
      connectedForMs: this.connectedAt ? Date.now() - this.connectedAt : null,
      jumpEnabled: this.jumpEnabled,
      antiAfkEnabled: this.antiAfkEnabled,
    };
  }

  #connect() {
    if (this.shuttingDown) return;

    if (this.bot) this.#teardownBot();

    this.#setState('connecting');
    this.connectionAttempts += 1;

    const { host, port, username, version, auth } = this.config.minecraft;
    this.logger.info(
      `Connecting to ${host}:${port} as "${username}" (attempt ${this.connectionAttempts}).`,
    );

    const options = { host, port, username, auth, hideErrors: true };
    if (version) options.version = version;

    let bot;
    try {
      bot = this.createBot(options);
    } catch (err) {
      this.logger.error(`Synchronous connection error: ${err && err.message ? err.message : err}`);
      this.#setState('disconnected');
      this.#scheduleReconnect('connection-error');
      return;
    }

    if (!bot || typeof bot.on !== 'function') {
      this.logger.error('createBot did not return a valid bot instance.');
      this.#setState('disconnected');
      this.#scheduleReconnect('invalid-bot');
      return;
    }

    this.bot = bot;
    this.#attachListeners(bot);
  }

  #attachListeners(bot) {
    const onLogin = () => {
      if (bot !== this.bot) return;
      this.logger.info('Login acknowledged by server.');
    };
    const onSpawn = () => {
      if (bot !== this.bot) return;
      this.connectedAt = Date.now();
      this.lastDisconnectReason = null;
      this.reconnect.resetBackoff();
      this.#setState('connected');
      this.logger.info(`Bot spawned as "${bot.username || this.config.minecraft.username}".`);
      this.#startJumpScheduler(bot);
      this.#startInventoryChecker(bot);
      this.#startAntiAfk(bot);
      this.emit('spawn', bot);
    };
    const onKicked = (reason) => {
      const text = describeKick(reason);
      this.lastDisconnectReason = `kicked: ${text}`;
      this.logger.warn(`Bot was kicked: ${text}`);
    };
    const onError = (err) => {
      this.logger.error(`Bot error: ${err && err.message ? err.message : err}`);
    };
    const onEnd = (reason) => {
      if (reason) this.logger.info(`Connection ended: ${describeKick(reason)}.`);
      this.#handleDisconnect(bot, 'end');
    };

    bot.on('login', onLogin);
    bot.once('spawn', onSpawn);
    bot.on('kicked', onKicked);
    bot.on('error', onError);
    bot.on('end', onEnd);

    this.listeners = { onLogin, onSpawn, onKicked, onError, onEnd };
  }

  #handleDisconnect(bot, reason) {
    if (bot !== this.bot) return;
    if (this.state === 'disconnected' || this.state === 'reconnecting') return;

    this.#teardownBot();
    this.connectedAt = null;
    if (!this.lastDisconnectReason) this.lastDisconnectReason = reason;
    this.#setState('disconnected');
    this.emit('end', reason);
    this.#scheduleReconnect(reason);
  }

  #teardownBot() {
    const bot = this.bot;
    this.bot = null;

    if (this.jumpScheduler) {
      this.jumpScheduler.stop();
      this.jumpScheduler = null;
    }

    if (this.inventoryChecker) {
      this.inventoryChecker.stop();
      this.inventoryChecker = null;
    }

    if (this.antiAfk) {
      this.antiAfk.stop();
      this.antiAfk = null;
    }

    if (!bot) return;

    if (this.listeners) {
      bot.removeListener('login', this.listeners.onLogin);
      bot.removeListener('spawn', this.listeners.onSpawn);
      bot.removeListener('kicked', this.listeners.onKicked);
      bot.removeListener('error', this.listeners.onError);
      bot.removeListener('end', this.listeners.onEnd);
      this.listeners = null;
    }

    try {
      bot.removeAllListeners();
    } catch {
      // Ignore teardown errors from third-party bot objects.
    }

    try {
      if (typeof bot.quit === 'function' && !bot.ended) bot.quit();
    } catch {
      // The connection is already gone.
    }
  }

  #startJumpScheduler(bot) {
    if (!this.jumpEnabled || this.jumpScheduler) return;
    this.jumpScheduler = new this.JumpScheduler({
      bot,
      intervalMs: this.config.jump.intervalMs,
      count: this.config.jump.count,
      gapMs: this.config.jump.gapMs,
      durationMs: this.config.jump.durationMs,
      setTimeoutFn: this.setTimeoutFn,
      clearTimeoutFn: this.clearTimeoutFn,
      logger: this.logger,
    });
    this.jumpScheduler.start();
  }

  #startInventoryChecker(bot) {
    if (this.config.inventory.intervalMs <= 0 || this.inventoryChecker) return;
    this.inventoryChecker = new this.InventoryChecker({
      bot,
      intervalMs: this.config.inventory.intervalMs,
      setTimeoutFn: this.setTimeoutFn,
      clearTimeoutFn: this.clearTimeoutFn,
      logger: this.logger,
    });
    this.inventoryChecker.start();
  }

  #startAntiAfk(bot) {
    if (!this.antiAfkEnabled || this.config.antiAfk.intervalMs <= 0 || this.antiAfk) return;
    this.antiAfk = new this.AntiAfk({
      bot,
      intervalMs: this.config.antiAfk.intervalMs,
      moveDurationMinMs: this.config.antiAfk.moveDurationMinMs,
      moveDurationMaxMs: this.config.antiAfk.moveDurationMaxMs,
      lookAroundChance: this.config.antiAfk.lookAroundChance,
      jumpChance: this.config.antiAfk.jumpChance,
      setTimeoutFn: this.setTimeoutFn,
      clearTimeoutFn: this.clearTimeoutFn,
      logger: this.logger,
    });
    this.antiAfk.start();
  }

  #scheduleReconnect(reason) {
    if (this.shuttingDown || !this.started) return;

    if (!this.reconnect.enabled) {
      this.logger.warn('Reconnect is disabled; bot will remain disconnected.');
      return;
    }

    const delay = this.reconnect.schedule(() => {
      if (this.shuttingDown) return;
      this.logger.info('Reconnecting now.');
      this.#connect();
    });

    if (delay === null) {
      this.logger.warn('Reconnect already pending; not scheduling another attempt.');
      return;
    }

    this.#setState('reconnecting');
    this.logger.info(`Reconnect scheduled in ${delay}ms (reason: ${reason}).`);
  }

  #setState(state) {
    if (this.state === state) return;
    this.logger.debug(`Bot state: ${this.state} -> ${state}`);
    this.state = state;
  }
}

module.exports = { BotManager, describeKick };
