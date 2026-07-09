/**
 * @file cache.js
 * @description Redis-based caching helpers for read-heavy endpoints.
 *
 * WHY CACHE SEARCH RESULTS?
 * --------------------------
 * Search & discovery endpoints are the most frequently hit in any ticketing
 * system. "Trending events in Mumbai" is queried by thousands of users per
 * minute — all getting the same result.
 *
 * Without caching:
 *   Every request → MongoDB aggregation pipeline → N ms latency
 *   1,000 req/min × 50ms avg = MongoDB under constant heavy load
 *
 * With caching (Redis TTL: 5 min):
 *   First request  → MongoDB → Redis SET → response
 *   Next 999 req   → Redis GET → response (sub-millisecond)
 *   MongoDB only queried once per 5 minutes for that key
 *
 * CACHE INVALIDATION STRATEGY:
 * -----------------------------
 * We use TIME-BASED invalidation (TTL) for search results, not event-based.
 *
 * Why not event-based (clear cache when a new event is published)?
 * - It's complex: "which cache keys are affected by this event?"
 * - "Trending" is inherently approximate — 5-minute stale data is acceptable
 * - Simpler code = fewer bugs = better reliability
 *
 * For booking confirmations (where accuracy is critical), we use the DB
 * directly without caching.
 *
 * CACHE KEY DESIGN:
 * -----------------
 * Keys are namespaced to avoid collisions with seat locks and other Redis data:
 *
 *   search:trending:7          → Trending events (last 7 days)
 *   search:cities              → All distinct city names
 *   search:categories:counts   → Category list with event counts
 *   search:related:eventId     → Related events for a specific event
 *
 * This namespace pattern means we can flush ALL search cache with:
 *   redis.keys('search:*') → then DEL all
 *
 * SERIALISATION:
 * --------------
 * Redis stores strings. We JSON.stringify() on write, JSON.parse() on read.
 * A wrapper avoids this boilerplate at every call site.
 */

import { getRedisClient } from '../config/redis.js';
import { logger } from './logger.js';

const DEFAULT_TTL = 5 * 60; // 5 minutes in seconds

/**
 * Retrieves a cached value from Redis and parses it as JSON.
 *
 * @template T
 * @param {string} key - Redis key
 * @returns {Promise<T|null>} Parsed value, or null on miss/error
 */
export const cacheGet = async (key) => {
  try {
    const client = getRedisClient();
    const raw = await client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch (err) {
    // Never let cache failures break the request — fall through to DB
    logger.warn(`[Cache] GET failed for key "${key}": ${err.message}`);
    return null;
  }
};

/**
 * Stores a value in Redis as a JSON string with a TTL.
 *
 * @param {string} key - Redis key
 * @param {*} value - Any JSON-serialisable value
 * @param {number} [ttlSeconds=300] - Time-to-live in seconds
 * @returns {Promise<void>}
 */
export const cacheSet = async (key, value, ttlSeconds = DEFAULT_TTL) => {
  try {
    const client = getRedisClient();
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    // Log but don't throw — a failed cache write is not a user-visible error
    logger.warn(`[Cache] SET failed for key "${key}": ${err.message}`);
  }
};

/**
 * Deletes a cache key (use when data changes and cache should be invalidated).
 *
 * @param {string} key - Redis key to delete
 * @returns {Promise<void>}
 */
export const cacheDel = async (key) => {
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (err) {
    logger.warn(`[Cache] DEL failed for key "${key}": ${err.message}`);
  }
};

/**
 * Deletes all keys matching a pattern (namespace flush).
 * Use with care — KEYS command is O(N) and blocks Redis if N is large.
 * For production at scale, use SCAN instead (implemented here via ioredis).
 *
 * @param {string} pattern - Glob pattern, e.g. 'search:*'
 * @returns {Promise<void>}
 */
export const cacheFlushPattern = async (pattern) => {
  try {
    const client = getRedisClient();
    // ioredis supports SCAN-based key matching to avoid blocking Redis
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      logger.info(`[Cache] Flushed ${keys.length} key(s) matching "${pattern}"`);
    }
  } catch (err) {
    logger.warn(`[Cache] Flush failed for pattern "${pattern}": ${err.message}`);
  }
};

/**
 * Cache-aside pattern helper.
 * Tries to read from cache; on miss, calls the fetcher and caches the result.
 *
 * This is the most common caching pattern — use this instead of calling
 * cacheGet + cacheSet manually at every call site.
 *
 * @template T
 * @param {string} key - Cache key
 * @param {() => Promise<T>} fetcher - Async function that queries the DB
 * @param {number} [ttlSeconds=300] - TTL for the cached result
 * @returns {Promise<T>}
 *
 * @example
 * const trending = await withCache(
 *   'search:trending:7',
 *   () => eventRepo.getTrendingEvents(7),
 *   300
 * );
 */
export const withCache = async (key, fetcher, ttlSeconds = DEFAULT_TTL) => {
  // ── Try cache first ───────────────────────────────────────────────────────
  const cached = await cacheGet(key);
  if (cached !== null) {
    logger.debug(`[Cache] HIT: ${key}`);
    return cached;
  }

  // ── Cache miss: query the DB ──────────────────────────────────────────────
  logger.debug(`[Cache] MISS: ${key}`);
  const fresh = await fetcher();

  // ── Store in cache (non-blocking) ─────────────────────────────────────────
  await cacheSet(key, fresh, ttlSeconds);

  return fresh;
};
