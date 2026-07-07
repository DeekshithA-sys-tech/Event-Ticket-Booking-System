/**
 * @file rateLimiter.middleware.js
 * @description Rate limiting middleware configurations.
 *
 * WHY RATE LIMITING?
 * ------------------
 * Without rate limiting, any endpoint is vulnerable to:
 *  - Brute force attacks (hammering /auth/login with password guesses)
 *  - Credential stuffing attacks
 *  - DoS attacks (flooding the server with requests)
 *  - Accidental infinite loops in client-side code
 *
 * We implement TWO rate limiters:
 *
 * 1. globalRateLimiter — Applies to ALL routes
 *    - 100 requests per 15 minutes per IP
 *    - Protects against general abuse
 *
 * 2. authRateLimiter — Applies ONLY to /auth routes (login, forgot-password)
 *    - 10 requests per 15 minutes per IP
 *    - Much stricter, specifically prevents brute force on auth endpoints
 *
 * WHY DIFFERENT LIMITS?
 * ----------------------
 * A customer browsing events might make 50 requests in 15 min (page loads,
 * images, filters). That's fine. But no legitimate user needs to attempt
 * login 50 times in 15 minutes — that's an attack.
 *
 * IN PRODUCTION (Sprint 10):
 * --------------------------
 * We will upgrade to use Redis as the rate limit store:
 *   store: new RedisStore({ client: redisClient })
 * This ensures rate limits are shared across multiple server instances.
 * In development, in-memory storage is sufficient.
 */

import rateLimit from 'express-rate-limit';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { env } from '../config/env.js';

// ── Shared handler for when rate limit is exceeded ────────────────────────────
// Returns our standard error response format instead of express-rate-limit's default
const rateLimitHandler = (_req, res) => {
  res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
    success: false,
    message: 'Too many requests from this IP. Please try again later.',
    retryAfter: '15 minutes',
  });
};

// ── 1. Global Rate Limiter ────────────────────────────────────────────────────
// Applied to ALL routes in app.js
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS, // 15 minutes (from env)
  max: env.RATE_LIMIT_MAX,             // 100 requests per window (from env)
  standardHeaders: true,               // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,                // Don't use X-RateLimit-* headers (deprecated)
  message: rateLimitHandler,
  handler: rateLimitHandler,
  // keyGenerator defaults to req.ip — works for single-server deployments
  // For load-balanced production with proxy, set: app.set('trust proxy', 1)
});

// ── 2. Auth Rate Limiter ──────────────────────────────────────────────────────
// Applied ONLY to auth routes (login, register, forgot-password)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes (hardcoded — auth limits should never vary)
  max: 10,                   // Only 10 auth attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitHandler,
  handler: rateLimitHandler,
  skipSuccessfulRequests: true, // Don't count successful logins — only failed ones
});

// ── 3. Password Reset Rate Limiter ────────────────────────────────────────────
// Even stricter — prevents OTP/reset link spam
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3,                    // Only 3 password reset requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitHandler,
  handler: rateLimitHandler,
});
