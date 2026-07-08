/**
 * @file refreshToken.repository.js
 * @description All MongoDB operations for the RefreshToken collection.
 *
 * NOTE ON REDIS VS MONGODB FOR REFRESH TOKENS:
 * ─────────────────────────────────────────────
 * In Sprint 10, we will add Redis as the PRIMARY store for refresh token
 * validation. Redis O(1) GET is ~1ms. A MongoDB findOne on an indexed field
 * is ~5-20ms. For a high-traffic auth endpoint, this matters.
 *
 * For now (Sprint 3), MongoDB is sufficient and lets us build correctly
 * without the added complexity of Redis token management.
 *
 * TOKEN ROTATION STRATEGY:
 * ─────────────────────────
 * Every time a refresh token is used, we ROTATE it:
 *   1. Delete the old token from the DB (revoking it)
 *   2. Issue a new access token AND a new refresh token
 *   3. Store the new refresh token hash in the DB
 *
 * Why rotate? If an attacker somehow intercepts a refresh token and uses it
 * first, the legitimate user's next refresh attempt will fail (token deleted).
 * The user will be forced to log in again and the attacker is locked out.
 * This is called "refresh token rotation" and is the recommended OAuth 2.0 pattern.
 */

import RefreshToken from '../models/refreshToken.model.js';

/**
 * Store a hashed refresh token in the database.
 *
 * @param {object} data
 * @param {string} data.userId - The user's ObjectId
 * @param {string} data.tokenHash - SHA-256 hash of the raw refresh token
 * @param {Date} data.expiresAt - When this token expires
 * @param {string} [data.userAgent] - Optional browser/device info
 * @param {string} [data.ipAddress] - Optional client IP
 * @returns {Promise<import('mongoose').Document>}
 */
export const createRefreshToken = async ({ userId, tokenHash, expiresAt, userAgent, ipAddress }) => {
  return RefreshToken.create({
    user: userId,
    tokenHash,
    expiresAt,
    userAgent: userAgent || null,
    ipAddress: ipAddress || null,
  });
};

/**
 * Find a refresh token document by its hash.
 * Used during token refresh to validate the incoming token.
 *
 * @param {string} tokenHash - SHA-256 hash of the raw token
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const findRefreshTokenByHash = async (tokenHash) => {
  return RefreshToken.findOne({ tokenHash }).select('+tokenHash').exec();
};

/**
 * Delete a specific refresh token (logout from one device).
 *
 * @param {string} tokenHash - Hash of the token to revoke
 * @returns {Promise<import('mongoose').DeleteResult>}
 */
export const deleteRefreshToken = async (tokenHash) => {
  return RefreshToken.deleteOne({ tokenHash }).exec();
};

/**
 * Delete all refresh tokens for a user (logout from all devices).
 *
 * @param {string} userId
 * @returns {Promise<import('mongoose').DeleteResult>}
 */
export const deleteAllUserRefreshTokens = async (userId) => {
  return RefreshToken.deleteMany({ user: userId }).exec();
};

/**
 * Count the number of active sessions for a user.
 * Useful for a "manage sessions" UI feature.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export const countUserSessions = async (userId) => {
  return RefreshToken.countDocuments({ user: userId });
};
