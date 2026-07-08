/**
 * @file redis.js
 * @description Redis client setup using ioredis.
 *
 * WHY IOREDIS OVER THE OFFICIAL `redis` PACKAGE?
 * -----------------------------------------------
 * ioredis provides:
 *  - Built-in cluster support
 *  - Automatic reconnect with exponential backoff (no manual retry logic)
 *  - Promise-based API out of the box
 *  - Better pipeline and pub/sub ergonomics
 *

 * GRACEFUL DEGRADATION:
 * ---------------------
 * In Sprint 2, Redis is not yet required for core functionality.
 * If Redis is unavailable, we log a warning but don't crash the server.
 * Once Redis-dependent features (seat locking, caching) are added in
 * Sprint 10, this will become a hard dependency.
 */

import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let redisClient = null;

/**
 * Creates and returns the Redis client singleton.
 * Emits structured logs for all connection lifecycle events.
 *
 * @returns {Redis} The ioredis client instance
 */
export const createRedisClient = () => {
  if (redisClient) return redisClient;

  redisClient = new Redis(env.REDIS_URL, {
    // Automatically reconnect with exponential backoff
    // This handles transient network failures gracefully
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000); // max 3s between retries
      logger.warn(`[Redis] Reconnect attempt #${times}, retrying in ${delay}ms...`);
      return delay;
    },
    // Don't crash the process on connection errors — emit 'error' event instead
    enableOfflineQueue: false,
    lazyConnect: true, // Don't connect until .connect() is called explicitly
  });

  // ── Event Listeners ────────────────────────────────────────────────────────
  redisClient.on('connect', () => {
    logger.info('[Redis] Connected successfully.');
  });

  redisClient.on('ready', () => {
    logger.info('[Redis] Client is ready to receive commands.');
  });

  redisClient.on('error', (err) => {
    // Log but don't crash — the app can run without Redis in early sprints
    logger.warn(`[Redis] Connection error: ${err.message}`);
  });

  redisClient.on('close', () => {
    logger.warn('[Redis] Connection closed.');
  });

  redisClient.on('reconnecting', () => {
    logger.warn('[Redis] Reconnecting...');
  });

  return redisClient;
};

/**
 * Attempts to connect to Redis.
 * Called during server startup — non-fatal if Redis is unavailable.
 */
export const connectRedis = async () => {
  const client = createRedisClient();
  try {
    await client.connect();
  } catch (err) {
    // In early sprints Redis is optional. In Sprint 10 this becomes critical.
    logger.warn(`[Redis] Could not connect: ${err.message}. Redis-dependent features will be unavailable.`);
  }
};

/**
 * Returns the existing Redis client.
 * Throws if called before createRedisClient() has been invoked.
 */
export const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('[Redis] Client not initialized. Call createRedisClient() first.');
  }
  return redisClient;
};
