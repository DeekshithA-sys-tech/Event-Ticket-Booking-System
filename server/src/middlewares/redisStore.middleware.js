/**
 * @file redisStore.middleware.js
 * @description Custom Redis Store for express-rate-limit backed by ioredis.
 * Includes automatic graceful fallback to memory if Redis is unreachable.
 *
 * WHY A CUSTOM REDIS STORE WITH FALLBACK?
 * ----------------------------------------
 * 1. Distributed Rate Limiting: In a multi-node / multi-container deployment,
 *    in-memory rate limiters track IP requests per node. A client could bypass
 *    limits by round-robining across nodes. Storing counters in Redis unifies
 *    the rate limit state across all server replicas.
 *
 * 2. Resiliency & High Availability: If Redis undergoes maintenance or network
 *    blips occur, the rate limiter MUST NOT crash application requests.
 *    Our store catches Redis errors and falls back to local memory tracking.
 *
 * EXPRESS-RATE-LIMIT STORE CONTRACT:
 * ----------------------------------
 * Needs to implement:
 *   - init(options)
 *   - increment(key) => Promise<{ totalHits: number, resetTime: Date | undefined }>
 *   - decrement(key) => Promise<void>
 *   - resetKey(key) => Promise<void>
 */

import { getRedisClient } from '../config/redis.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('RedisRateLimitStore');

/**
 * Memory fallback counter map used when Redis is unavailable.
 */
class MemoryFallback {
  constructor() {
    this.hits = new Map(); // key -> { count, resetTime }
  }

  increment(key, windowMs) {
    const now = Date.now();
    const record = this.hits.get(key);

    if (!record || now > record.resetTime) {
      const resetTime = now + windowMs;
      this.hits.set(key, { count: 1, resetTime });
      return { totalHits: 1, resetTime: new Date(resetTime) };
    }

    record.count += 1;
    return { totalHits: record.count, resetTime: new Date(record.resetTime) };
  }

  decrement(key) {
    const record = this.hits.get(key);
    if (record && record.count > 0) {
      record.count -= 1;
    }
  }

  resetKey(key) {
    this.hits.delete(key);
  }
}

export class RedisStore {
  /**
   * @param {object} options
   * @param {string} [options.prefix='rl:'] - Key prefix in Redis
   */
  constructor(options = {}) {
    this.prefix = options.prefix || 'rl:';
    this.fallback = new MemoryFallback();
    this.windowMs = 15 * 60 * 1000; // default windowMs
  }

  /**
   * Store initialization called by express-rate-limit.
   * @param {object} options - express-rate-limit configuration options
   */
  init(options) {
    this.windowMs = options.windowMs || this.windowMs;
  }

  /**
   * Safely gets the ioredis client if initialized and connected.
   */
  getClient() {
    try {
      const client = getRedisClient();
      if (client && client.status === 'ready') {
        return client;
      }
    } catch (_err) {
      // Redis client not ready or not initialized
    }
    return null;
  }

  /**
   * Increments the hit count for a given key.
   *
   * @param {string} key - Unique rate-limit key (e.g. IP address)
   * @returns {Promise<{ totalHits: number, resetTime: Date }>}
   */
  async increment(key) {
    const fullKey = `${this.prefix}${key}`;
    const redis = this.getClient();

    if (!redis) {
      // Fallback to in-memory counter if Redis is disconnected
      return this.fallback.increment(fullKey, this.windowMs);
    }

    try {
      // Atomic Redis pipeline: INCR counter, set EXPIRE if new key
      const windowSeconds = Math.ceil(this.windowMs / 1000);

      const results = await redis
        .pipeline()
        .incr(fullKey)
        .ttl(fullKey)
        .exec();

      const [[incrErr, count], [ttlErr, ttl]] = results;

      if (incrErr) throw incrErr;

      // If key is new (ttl is -1 or negative), set expiration window
      if (ttl < 0) {
        await redis.expire(fullKey, windowSeconds);
      }

      const effectiveTtl = ttl > 0 ? ttl : windowSeconds;
      const resetTime = new Date(Date.now() + effectiveTtl * 1000);

      return {
        totalHits: Number(count),
        resetTime,
      };
    } catch (err) {
      logger.warn(`[RedisRateLimitStore] Redis error: ${err.message}. Falling back to memory.`);
      return this.fallback.increment(fullKey, this.windowMs);
    }
  }

  /**
   * Decrements the hit count for a given key.
   *
   * @param {string} key
   */
  async decrement(key) {
    const fullKey = `${this.prefix}${key}`;
    const redis = this.getClient();

    if (!redis) {
      this.fallback.decrement(fullKey);
      return;
    }

    try {
      await redis.decr(fullKey);
    } catch (err) {
      logger.warn(`[RedisRateLimitStore] Decrement error: ${err.message}`);
      this.fallback.decrement(fullKey);
    }
  }

  /**
   * Resets the hit count for a given key.
   *
   * @param {string} key
   */
  async resetKey(key) {
    const fullKey = `${this.prefix}${key}`;
    const redis = this.getClient();

    if (!redis) {
      this.fallback.resetKey(fullKey);
      return;
    }

    try {
      await redis.del(fullKey);
    } catch (err) {
      logger.warn(`[RedisRateLimitStore] ResetKey error: ${err.message}`);
      this.fallback.resetKey(fullKey);
    }
  }
}
