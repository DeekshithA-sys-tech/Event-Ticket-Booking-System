/**
 * @file redis.js
 * @description Redis client setup using ioredis with graceful degradation.
 */

import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let redisClient = null;
let isConnected = false;

/**
 * Creates and returns the Redis client singleton.
 * @returns {Redis}
 */
export const createRedisClient = () => {
  if (redisClient) return redisClient;

  redisClient = new Redis(env.REDIS_URL, {
    // Retry up to 3 times on connection failure, then stop retrying to avoid infinite log spam
    retryStrategy(times) {
      if (times > 3) {
        return null; // Stop retrying
      }
      return 500;
    },
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  redisClient.on('connect', () => {
    isConnected = true;
    logger.info('[Redis] Connected successfully.');
  });

  redisClient.on('ready', () => {
    isConnected = true;
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    // Log once without spamming
  });

  redisClient.on('close', () => {
    isConnected = false;
  });

  return redisClient;
};

/**
 * Attempts to connect to Redis.
 * Returns true if connected, false if unavailable.
 * @returns {Promise<boolean>}
 */
export const connectRedis = async () => {
  const client = createRedisClient();
  try {
    await client.connect();
    isConnected = true;
    return true;
  } catch (err) {
    isConnected = false;
    logger.warn(`[Redis] Local Redis not detected (${err.message}). Active in Memory Fallback Mode.`);
    return false;
  }
};

/**
 * Returns the existing Redis client instance.
 */
export const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('[Redis] Client not initialized. Call createRedisClient() first.');
  }
  return redisClient;
};

/**
 * Helper checking if Redis is active.
 */
export const isRedisConnected = () => isConnected;
