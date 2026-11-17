/**
 * @file seatLock.js
 * @description Redis-based seat locking with Memory Fallback Mode when Redis is offline.
 */

import { getRedisClient, isRedisConnected } from '../config/redis.js';
import { logger } from './logger.js';

const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
const KEY_PREFIX = 'seat_lock';

// In-memory fallback map for dev mode when Redis is offline
const memoryLocks = new Map();

/**
 * Builds the lock key for a seat.
 */
const buildLockKey = (eventId, seatId) => `${KEY_PREFIX}:${eventId}:${seatId}`;

/**
 * Cleans expired memory locks periodically.
 */
const cleanMemoryLocks = () => {
  const now = Date.now();
  for (const [key, lock] of memoryLocks.entries()) {
    if (lock.expiresAt <= now) {
      memoryLocks.delete(key);
    }
  }
};

/**
 * Attempts to lock multiple seats for a user.
 */
export const lockSeats = async (eventId, seatIds, userId) => {
  cleanMemoryLocks();
  const userIdStr = userId.toString();

  // If Redis is connected, use Redis SET NX PX
  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      const lockedByUs = [];

      for (const seatId of seatIds) {
        const key = buildLockKey(eventId, seatId);
        const result = await redis.set(key, userIdStr, 'NX', 'PX', LOCK_TTL_MS);

        if (result === 'OK') {
          lockedByUs.push(seatId);
        } else {
          await releaseSeats(eventId, lockedByUs, userIdStr);
          logger.info(`[SeatLock] Seat ${seatId} on event ${eventId} is already locked in Redis`);
          return { success: false, failedSeat: seatId };
        }
      }

      logger.info(`[SeatLock] Locked ${seatIds.length} seat(s) for user ${userIdStr} in Redis`);
      return { success: true, lockedSeats: seatIds };
    } catch (err) {
      logger.warn(`[SeatLock] Redis lock error (${err.message}) — falling back to Memory Locks`);
    }
  }

  // Memory fallback lock implementation
  const now = Date.now();
  const lockedByUs = [];

  for (const seatId of seatIds) {
    const key = buildLockKey(eventId, seatId);
    const existing = memoryLocks.get(key);

    if (existing && existing.expiresAt > now && existing.userId !== userIdStr) {
      // Seat is currently locked by someone else
      await releaseSeats(eventId, lockedByUs, userIdStr);
      return { success: false, failedSeat: seatId };
    }

    memoryLocks.set(key, {
      userId: userIdStr,
      expiresAt: now + LOCK_TTL_MS,
    });
    lockedByUs.push(seatId);
  }

  logger.info(`[SeatLock] Locked ${seatIds.length} seat(s) for user ${userIdStr} in Memory Fallback`);
  return { success: true, lockedSeats: seatIds };
};

/**
 * Releases seat locks held by a specific user.
 */
export const releaseSeats = async (eventId, seatIds, userId) => {
  const userIdStr = userId.toString();

  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      const luaScript = `
        local val = redis.call('GET', KEYS[1])
        if val == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        else
          return 0
        end
      `;

      await Promise.all(
        seatIds.map((seatId) =>
          redis.eval(luaScript, 1, buildLockKey(eventId, seatId), userIdStr).catch(() => {})
        )
      );
    } catch (_err) {
      // Ignore
    }
  }

  // Also clean memory locks
  for (const seatId of seatIds) {
    const key = buildLockKey(eventId, seatId);
    const lock = memoryLocks.get(key);
    if (lock && lock.userId === userIdStr) {
      memoryLocks.delete(key);
    }
  }
};

/**
 * Verifies that a user holds valid locks for all specified seats.
 */
export const verifyLocks = async (eventId, seatIds, userId) => {
  cleanMemoryLocks();
  const userIdStr = userId.toString();

  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      for (const seatId of seatIds) {
        const key = buildLockKey(eventId, seatId);
        const lockHolder = await redis.get(key);
        if (lockHolder !== userIdStr) {
          return { valid: false, expiredSeat: seatId };
        }
      }
      return { valid: true };
    } catch (_err) {
      // Fall through to memory check
    }
  }

  // Memory fallback verification
  const now = Date.now();
  for (const seatId of seatIds) {
    const key = buildLockKey(eventId, seatId);
    const lock = memoryLocks.get(key);

    if (!lock || lock.expiresAt <= now || lock.userId !== userIdStr) {
      return { valid: false, expiredSeat: seatId };
    }
  }

  return { valid: true };
};

/**
 * Gets the remaining TTL (in seconds) for a seat lock.
 */
export const getLockTTL = async (eventId, seatId) => {
  const key = buildLockKey(eventId, seatId);

  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      const pttl = await redis.pttl(key);
      if (pttl > 0) return Math.ceil(pttl / 1000);
    } catch (_err) {
      // Fall through to memory check
    }
  }

  const lock = memoryLocks.get(key);
  if (lock && lock.expiresAt > Date.now()) {
    return Math.ceil((lock.expiresAt - Date.now()) / 1000);
  }

  return -2;
};
