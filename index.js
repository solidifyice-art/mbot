'use strict';

require('dotenv').config();

const { parseConfig } = require('./src/config');
const { createLogger } = require('./src/logger');
const { BotManager } = require('./src/bot');
const { createHealthServer } = require('./src/server');

function main() {
  let config;
  try {
    config = parseConfig(process.env);
  } catch (err) {
    const fallback = createLogger('info');
    fallback.error(`Configuration error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const logger = createLogger(config.logLevel);
  logger.info('Starting Minecraft idle bot.');
  logger.info(
    `Target: ${config.minecraft.host}:${config.minecraft.port} as "${config.minecraft.username}".`,
  );
  logger.info(
    `Jump schedule: every ${config.jump.intervalMs}ms for ${config.jump.count} jumps ` +
      `(gap ${config.jump.gapMs}ms, duration ${config.jump.durationMs}ms).`,
  );
  logger.info(
    `Reconnect: enabled=${config.reconnect.enabled}, initial=${config.reconnect.initialMs}ms, ` +
      `max=${config.reconnect.maxMs}ms, factor=${config.reconnect.factor}.`,
  );

  const botManager = new BotManager(config, { logger });

  let httpServer = null;
  if (config.http.enabled) {
    httpServer = createHealthServer({ botManager, logger });
    httpServer.listen(config.http.port, '0.0.0.0', () => {
      logger.info(`Health endpoint listening on port ${config.http.port} (/health).`);
    });
  }

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}; shutting down.`);

    try {
      await botManager.stop();
    } catch (err) {
      logger.error(`Error while stopping bot: ${err && err.message ? err.message : err}`);
    }

    if (httpServer) {
      await new Promise((resolve) => httpServer.close(() => resolve()));
      logger.info('HTTP server closed.');
    }

    logger.info('Shutdown complete.');
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason instanceof Error ? reason.message : reason}`);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err && err.stack ? err.stack : err}`);
  });

  botManager.start();
}

if (require.main === module) {
  main();
}

module.exports = { main };
