/**
 * @file seatLock.js
 * @description Redis-based seat locking using the SET NX PX strategy.
 *
 * THE SEAT LOCKING PROBLEM:
 * --------------------------
 * In a concurrent system, two users can simultaneously select the same seat:
 *
 *   User A: sees Seat A-1 as "available" at T=0
 *   User B: sees Seat A-1 as "available" at T=0
 *   User A: begins checkout at T=1
 *   User B: begins checkout at T=1
 *   User A: payment confirmed → books Seat A-1 at T=5
 *   User B: payment confirmed → books Seat A-1 at T=5 ← DOUBLE BOOKING!
 *
 * We need to LOCK a seat for the duration of the checkout flow (10 minutes)
 * so that once User A starts, User B sees the seat as locked.
 *
 * WHY REDIS, NOT JUST MONGODB?
 * ----------------------------
 * MongoDB update with $set { status: 'locked' } is NOT atomic across multiple
 * seats in a single operation (without transactions). Redis SET NX is:
 *
 *   SET key value NX PX ttl
 *   │   │   │     │  │
 *   │   │   │     │  └── TTL in milliseconds (auto-expires)
 *   │   │   │     └───── Only SET if Not eXists (atomic check-and-set)
 *   │   │   └─────────── The lock value (identifies who holds the lock)
 *   │   └─────────────── The lock key (identifies what is locked)
 *   └─────────────────── Redis SET command
 *
 * This is ATOMIC at the Redis level — no race condition possible.
 * Redis is single-threaded: SET NX either sets or doesn't, never partial.
 *
 * LOCK KEY DESIGN:
 * ----------------
 * Key: "seat_lock:{eventId}:{seatId}"
 * Value: userId (who holds the lock)
 * TTL: 600,000ms (10 minutes)
 *
 * If the user doesn't confirm within 10 minutes, Redis auto-expires the key
 * and the seat becomes available again — no cleanup cron needed.
 *
 * LOCK VALUE = userId (not just "locked"):
 * -----------------------------------------
 * Storing the userId as the lock value lets us:
 * 1. Verify that ONLY the lock holder can confirm the booking
 *    (user B cannot confirm seats locked by user A even if they guess the URL)
 * 2. Release only OUR locks on logout/cancel — not someone else's
 */

import { getRedisClient } from '../config/redis.js';
import { logger } from './logger.js';

const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
const KEY_PREFIX = 'seat_lock';

/**
 * Builds the Redis key for a specific seat in an event.
 * @param {string} eventId
 * @param {string} seatId
 * @returns {string} "seat_lock:eventId:seatId"
 */
const buildLockKey = (eventId, seatId) => `${KEY_PREFIX}:${eventId}:${seatId}`;

/**
 * Attempts to lock multiple seats for a user.
 * Uses Redis SET NX PX — atomic check-and-set per seat.
 *
 * ALL-OR-NOTHING:
 * If any seat is already locked, we release ALL the locks we just acquired
 * and return false. This prevents partial locks (user holds some seats but
 * not all, blocking others from completing their booking).
 *
 * @param {string} eventId
 * @param {string[]} seatIds - Array of seat IDs to lock (e.g. ["A-1", "A-2"])
 * @param {string} userId - The user acquiring the locks
 * @returns {Promise<{ success: boolean, lockedSeats?: string[], failedSeat?: string }>}
 */
export const lockSeats = async (eventId, seatIds, userId) => {
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    logger.warn('[SeatLock] Redis unavailable — cannot lock seats');
    return { success: false, failedSeat: null };
  }

  const lockedByUs = [];

  for (const seatId of seatIds) {
    const key = buildLockKey(eventId, seatId);
    // SET key userId NX PX ttl — returns 'OK' if set, null if already exists
    const result = await redis.set(key, userId, 'NX', 'PX', LOCK_TTL_MS);

    if (result === 'OK') {
      lockedByUs.push(seatId);
    } else {
      // This seat is already locked by someone else
      // Release all locks we just acquired (all-or-nothing)
      await releaseSeats(eventId, lockedByUs, userId);
      logger.info(`[SeatLock] Seat ${seatId} on event ${eventId} is already locked`);
      return { success: false, failedSeat: seatId };
    }
  }

  logger.info(`[SeatLock] Locked ${seatIds.length} seat(s) for user ${userId} on event ${eventId}`);
  return { success: true, lockedSeats: seatIds };
};

/**
 * Releases seat locks held by a specific user.
 * We verify the lock value (userId) before deleting —
 * this prevents accidentally releasing a lock we don't own.
 *
 * @param {string} eventId
 * @param {string[]} seatIds
 * @param {string} userId - The user releasing the locks (must match lock value)
 */
export const releaseSeats = async (eventId, seatIds, userId) => {
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return; // Redis unavailable — locks will auto-expire via TTL
  }

  // Use a Lua script to atomically check owner + delete
  // Without Lua, there's a tiny race between GET (check owner) and DEL (release)
  const luaScript = `
    local val = redis.call('GET', KEYS[1])
    if val == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    else
      return 0
    end
  `;

  const releasePromises = seatIds.map((seatId) => {
    const key = buildLockKey(eventId, seatId);
    return redis.eval(luaScript, 1, key, userId).catch((err) =>
      logger.warn(`[SeatLock] Failed to release lock for ${seatId}: ${err.message}`)
    );
  });

  await Promise.all(releasePromises);
  logger.info(`[SeatLock] Released ${seatIds.length} seat lock(s) for user ${userId}`);
};

/**
 * Verifies that a user holds valid locks for all specified seats.
 * Called before confirming a booking — ensures the lock hasn't expired
 * and belongs to this user (not someone else who re-locked after expiry).
 *
 * @param {string} eventId
 * @param {string[]} seatIds
 * @param {string} userId
 * @returns {Promise<{ valid: boolean, expiredSeat?: string }>}
 */
export const verifyLocks = async (eventId, seatIds, userId) => {
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    // If Redis is down, we can't verify — fail safe (reject the booking)
    return { valid: false, expiredSeat: seatIds[0] };
  }

  for (const seatId of seatIds) {
    const key = buildLockKey(eventId, seatId);
    const lockHolder = await redis.get(key);

    if (lockHolder !== userId) {
      return { valid: false, expiredSeat: seatId };
    }
  }

  return { valid: true };
};

/**
 * Gets the remaining TTL (in seconds) for a seat lock.
 * Used to display a countdown timer in the frontend.
 *
 * @param {string} eventId
 * @param {string} seatId
 * @returns {Promise<number>} Seconds remaining, or -2 if key doesn't exist
 */
export const getLockTTL = async (eventId, seatId) => {
  try {
    const redis = getRedisClient();
    // PTTL returns milliseconds; convert to seconds
    const pttl = await redis.pttl(buildLockKey(eventId, seatId));
    return Math.ceil(pttl / 1000);
  } catch {
    return -2;
  }
};
