const NodeCache = require('node-cache');

// Central in-memory cache used across the backend. This replaces Redis.
// Provides a small async-compatible wrapper so existing callers using
// `await cache.get(key)` / `await cache.set(key, value, 'EX', ttl)` keep working.
const cache = new NodeCache({ stdTTL: 0, checkperiod: 600 });

module.exports = {
  async get(key) {
    const v = cache.get(key);
    return v === undefined ? null : v;
  },
  async set(key, value, ...args) {
    // Support Redis-style TTL argument: ('EX', seconds)
    let ttl = 0;
    const exIndex = args.findIndex(a => a === 'EX');
    if (exIndex !== -1 && typeof args[exIndex + 1] === 'number') {
      ttl = args[exIndex + 1];
    }
    cache.set(key, value, ttl);
    return 'OK';
  },
  async del(key) {
    const n = cache.del(key);
    return n;
  },
  async keys() {
    return cache.keys();
  },
  async delStartWith(pattern) {
    const allKeys = cache.keys();
    const toDelete = allKeys.filter(k => k.startsWith(pattern));
    if (toDelete.length > 0) {
      cache.del(toDelete);
    }
    return toDelete.length;
  },
  on() { },
};
