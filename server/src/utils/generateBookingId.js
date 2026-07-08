/**
 * @file generateBookingId.js
 * @description Human-readable booking ID generator.
 *
 * WHY A HUMAN-READABLE ID ALONGSIDE MONGODB's ObjectId?
 * -------------------------------------------------------
 * MongoDB ObjectId: "64b7e1a2c3f4a500123456ab"
 *   ✅ Unique, indexed, fast for DB lookups
 *   ❌ Unreadable — users cannot remember, type, or communicate it
 *   ❌ Customer support cannot look it up from a phone call
 *
 * Booking ID:  "TKT-20240715-X7K2M"
 *   ✅ Customer can read it over the phone or email
 *   ✅ Support team can filter by prefix: TKT-20240715-*
 *   ✅ Encodes date — immediately know when it was created
 *   ❌ Not cryptographically unique (we add a 5-char random suffix)
 *
 * FORMAT: TKT-YYYYMMDD-XXXXX
 *   TKT     = fixed prefix (identifies our system)
 *   YYYYMMDD = UTC date of booking (encoded for sortability)
 *   XXXXX    = 5 uppercase alphanumeric chars (36^5 = ~60M combinations per day)
 *
 * COLLISION PROBABILITY:
 * ----------------------
 * At 10,000 bookings/day: P(collision) ≈ 10000^2 / (2 × 60,000,000) ≈ 0.08%
 * The DB unique index on bookingId provides the safety net — if a collision
 * occurs, the write fails and the service retries with a new ID.
 */

import crypto from 'crypto';

// Characters to use for the random suffix: 0-9 + A-Z (no ambiguous chars like 0/O, 1/I)
const CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates a random string of the specified length using the safe charset.
 * @param {number} length
 * @returns {string}
 */
const randomSuffix = (length = 5) => {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((byte) => CHARSET[byte % CHARSET.length])
    .join('');
};

/**
 * Generates a human-readable booking ID.
 * Format: TKT-YYYYMMDD-XXXXX
 *
 * @returns {string} e.g. "TKT-20240715-X7K2M"
 */
export const generateBookingId = () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, ''); // "20240715"
  const suffix = randomSuffix(5);
  return `TKT-${date}-${suffix}`;
};
