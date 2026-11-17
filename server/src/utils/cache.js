/**
 * @file cache.js
 * @description Redis-based caching helpers with graceful fallback when Redis is offline.
 */

import { getRedisClient, isRedisConnected } from '../config/redis.js';
import { logger } from './logger.js';

const DEFAULT_TTL = 5 * 60; // 5 minutes in seconds

/**
 * Retrieves a cached value from Redis if connected.
 * @template T
 * @param {string} key
 * @returns {Promise<T|null>}
 */
export const cacheGet = async (key) => {
  if (!isRedisConnected()) return null;
  try {
    const client = getRedisClient();
    const raw = await client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
};

/**
 * Stores a value in Redis if connected.
 * @param {string} key
 * @param {*} value
 * @param {number} [ttlSeconds=300]
 */
export const cacheSet = async (key, value, ttlSeconds = DEFAULT_TTL) => {
  if (!isRedisConnected()) return;
  try {
    const client = getRedisClient();
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (_err) {
    // Ignore cache set error when Redis is unavailable
  }
};

/**
 * Deletes a cache key if connected.
 * @param {string} key
 */
export const cacheDel = async (key) => {
  if (!isRedisConnected()) return;
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (_err) {
    // Ignore
  }
};

/**
 * Deletes all keys matching a pattern.
 * @param {string} pattern
 */
export const cacheFlushPattern = async (pattern) => {
  if (!isRedisConnected()) return;
  try {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (_err) {
    // Ignore
  }
};

/**
 * Cache-aside pattern helper.
 * Reads from cache on hit; queries DB on miss.
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {number} [ttlSeconds=300]
 * @returns {Promise<T>}
 */
export const withCache = async (key, fetcher, ttlSeconds = DEFAULT_TTL) => {
  const cached = await cacheGet(key);
  if (cached !== null) {
    return cached;
  }

  const fresh = await fetcher();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
};
