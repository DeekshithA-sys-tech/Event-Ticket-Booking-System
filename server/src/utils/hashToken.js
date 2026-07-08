/**

 *
 * Why SHA-256 and not bcrypt?
 * - SHA-256 is deterministic and fast — perfect for token lookup
 * - Tokens are already long random strings (high entropy) — no need for
 *   bcrypt's slow key stretching (which is designed for low-entropy passwords)
 * - bcrypt output is non-deterministic (includes salt) — can't use for lookup

 */

import crypto from 'crypto';

/**
 * Hashes a token using SHA-256.
 * Used for: refresh tokens, password reset tokens, email verification tokens.
 *
 * @param {string} token - The raw token string
 * @returns {string} Hex-encoded SHA-256 hash
 *

 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generates a cryptographically secure random token.
 * Used for password reset and email verification links.
 *
 * @param {number} [byteLength=32] - Number of random bytes (32 bytes = 64 hex chars)
 * @returns {string} Hex-encoded random token (URL-safe)
 */
export const generateSecureToken = (byteLength = 32) => {
  return crypto.randomBytes(byteLength).toString('hex');
};
