'use strict';

/**
 * Deterministic in-memory timers for tests. Inject `setTimeoutFn` and
 * `clearTimeoutFn` into modules and drive time forward with `advance(ms)`.
 */
function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  function setTimeoutFn(fn, ms) {
    const id = nextId++;
    timers.set(id, { fn, at: now + ms });
    return { id, unref() {} };
  }

  function clearTimeoutFn(handle) {
    if (handle && typeof handle === 'object' && 'id' in handle) {
      timers.delete(handle.id);
    }
  }

  function advance(ms) {
    const target = now + ms;

    for (;;) {
      let nextIdToRun = null;
      let nextAt = Infinity;

      for (const [id, timer] of timers) {
        if (timer.at <= target && timer.at < nextAt) {
          nextAt = timer.at;
          nextIdToRun = id;
        }
      }

      if (nextIdToRun === null) break;

      const timer = timers.get(nextIdToRun);
      timers.delete(nextIdToRun);
      now = timer.at;
      timer.fn();
    }

    now = target;
  }

  return {
    setTimeoutFn,
    clearTimeoutFn,
    advance,
    get now() {
      return now;
    },
    pendingCount() {
      return timers.size;
    },
  };
}

module.exports = { createFakeTimers };
