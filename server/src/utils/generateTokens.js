/**

 *
 * TWO-TOKEN STRATEGY — WHY IT EXISTS:
 * ------------------------------------
 *
 * Option A: Single long-lived JWT (common beginner approach)
 *    Simple
 *    If stolen, attacker has access for 7 days with no way to revoke
 *    No way to log out (JWTs are stateless)
 *
 * Option B: Access Token + Refresh Token (industry standard)
 *    Access Token: Short-lived (15 min). Stateless. If stolen, expires soon.
 *    Refresh Token: Long-lived (7 days). Stored server-side. Revocable.
 *    Logout = delete refresh token from Redis/DB → no more new access tokens

 *
 * HOW IT WORKS IN PRACTICE:
 * --------------------------
 * 1. User logs in → receives accessToken (in body) + refreshToken (in httpOnly cookie)
 * 2. Client uses accessToken in `Authorization: Bearer <token>` header
 * 3. accessToken expires after 15 min → client gets 401
 * 4. Client automatically calls POST /auth/refresh-token (cookie is sent automatically)
 * 5. Server validates refreshToken → issues new accessToken + rotates refreshToken
 * 6. User never sees a login screen again until they explicitly log out
 *
 * WHAT'S IN THE ACCESS TOKEN PAYLOAD:
 * ------------------------------------
 * Keep it minimal. Only include what the server needs to authorize a request.
 * Never put sensitive data in JWTs — they're BASE64-encoded, not encrypted.
 * The payload is readable by anyone who has the token.
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Generates a short-lived JWT access token.
 * Sent in the response body — stored in memory by the client (not localStorage).
 *
 * Payload includes userId and role for authorization without a DB lookup.
 *
 * @param {{ id: string, role: string }} user - User's ID and role
 * @returns {string} Signed JWT access token
 */
export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
      role: user.role,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRY, // '15m' from env
      issuer: 'event-ticket-booking-api',
      audience: 'event-ticket-booking-client',
    }
  );
};

/**
 * Generates a long-lived refresh token.
 * Sent as an httpOnly, Secure, SameSite=Strict cookie.
 * Never accessible via JavaScript → XSS attacks cannot steal it.
 *
 * @param {{ id: string }} user - User's ID
 * @returns {string} Signed JWT refresh token
 */
export const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
      // Refresh token has minimal payload — it's just a credential,
      // not an authorization token
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRY, // '7d' from env
      issuer: 'event-ticket-booking-api',
    }
  );
};

/**
 * Verifies a JWT access token and returns the decoded payload.
 * Throws JsonWebTokenError or TokenExpiredError (handled by error middleware).
 *
 * @param {string} token - Raw JWT string
 * @returns {{ id: string, role: string, iat: number, exp: number }}
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'event-ticket-booking-api',
    audience: 'event-ticket-booking-client',
  });
};

/**
 * Verifies a JWT refresh token and returns the decoded payload.
 * Throws JsonWebTokenError or TokenExpiredError (handled by error middleware).
 *
 * @param {string} token - Raw JWT string
 * @returns {{ id: string, iat: number, exp: number }}
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: 'event-ticket-booking-api',
  });
};


export const getRefreshTokenExpiryDate = () => {
  const days = parseInt(env.JWT_REFRESH_EXPIRY, 10) || 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

/**
 * Builds the cookie options for the refresh token cookie.
 * httpOnly + Secure + SameSite prevent XSS and CSRF attacks.
 *
 * @returns {import('express').CookieOptions}
 */
export const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,     // Not accessible by JavaScript → XSS protection
  secure: env.isProd, // HTTPS only in production
  sameSite: env.isProd ? 'strict' : 'lax', // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path: '/api/v1/auth', // Cookie only sent to auth endpoints (reduced exposure)
});
