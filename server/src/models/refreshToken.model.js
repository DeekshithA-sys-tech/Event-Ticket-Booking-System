/**
 * @file refreshToken.model.js
 * @description Mongoose schema for persisted refresh tokens.
 *
 * WHY STORE REFRESH TOKENS IN THE DATABASE?
 * ------------------------------------------
 * JWTs are stateless — once issued, you can't "un-issue" them until they
 * expire naturally. This is a problem for refresh tokens (7-day TTL):
 *
 *   Scenario: User's device is stolen.
 *   Without DB storage: Attacker can keep refreshing for 7 days.
 *   With DB storage: You delete the token → attacker gets 401 immediately.
 *
 * Redis is our PRIMARY store for token validation speed (O(1) lookups).
 * This MongoDB collection is the SECONDARY store for:
 *   1. Audit trail (when was this token created? what device?)
 *   2. Backup revocation if Redis goes down
 *   3. Admin can see all active sessions for a user
 *
 * WHY WE STORE A HASH, NOT THE RAW TOKEN:
 * ----------------------------------------
 * If the tokens collection is read by an attacker (SQL injection, insider
 * threat), they get hashes — not usable tokens. The raw token only ever
 * lives in the user's httpOnly cookie and in memory during validation.
 *
 * TTL INDEX:
 * ----------
 * MongoDB's TTL index automatically deletes expired documents.
 * This means we never need a cleanup cron for the tokens collection —
 * MongoDB handles it natively.
 */

import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // SHA-256 hash of the raw refresh token
    // The raw token is stored in the user's httpOnly cookie
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false, // Never expose hashes in API responses
    },
    // When this document should be automatically deleted by MongoDB
    // MongoDB checks this field every 60 seconds and deletes expired docs
    expiresAt: {
      type: Date,
      required: true,
    },
    // Optional: track device/browser for "manage sessions" feature
    userAgent: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = when user logged in
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// TTL index: MongoDB automatically deletes documents when `expiresAt` is reached
// This replaces any manual cleanup cron job
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// For looking up all tokens belonging to a user (e.g. "logout all devices")
refreshTokenSchema.index({ user: 1 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
export default RefreshToken;
