'use strict';

const LEVEL_ORDER = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

function safeStringify(meta) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(meta, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
  } catch {
    return '[unserializable metadata]';
  }
}

/**
 * Create a simple, timestamped logger. It never reads or prints environment
 * variables, so it is safe to use around connection credentials.
 */
function createLogger(level = 'info', sink = console) {
  const threshold = LEVEL_ORDER[level] || LEVEL_ORDER.info;

  function write(lvl, args) {
    if (LEVEL_ORDER[lvl] < threshold) return;

    let meta;
    const last = args[args.length - 1];
    if (typeof last === 'object' && last !== null && !(last instanceof Error)) {
      meta = args.pop();
    }

    const message = args
      .map((part) => (part instanceof Error ? `${part.message}` : String(part)))
      .join(' ');

    const line = `${new Date().toISOString()} [${lvl.toUpperCase()}] ${message}`;
    const output = meta && Object.keys(meta).length > 0 ? `${line} ${safeStringify(meta)}` : line;

    const method = lvl === 'debug' ? 'log' : lvl;
    if (typeof sink[method] === 'function') {
      sink[method](output);
    } else {
      sink.log(output);
    }
  }

  return {
    level,
    debug: (...args) => write('debug', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
    child: () => createLogger(level, sink),
  };
}

module.exports = { createLogger, LEVEL_ORDER };
