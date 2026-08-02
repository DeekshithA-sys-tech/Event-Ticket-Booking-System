/**
 * @file rateLimiter.middleware.js
 * @description Advanced Rate limiting middleware configurations backed by Redis Store.
 *
 * PREVENTS:
 *  - Brute-force authentication attempts
 *  - Password reset link / OTP spamming
 *  - Seat locking bot hoarding attacks
 *  - Search engine scraping DoS attacks
 *  - Fake review flooding
 *  - General server resource exhaustion
 */

import rateLimit from 'express-rate-limit';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { env } from '../config/env.js';
import { RedisStore } from './redisStore.middleware.js';

/**
 * Creates standardized rate limit error handler response.
 *
 * @param {string} customMessage
 * @param {string} retryAfter
 */
const createRateLimitHandler = (customMessage = 'Too many requests from this IP. Please try again later.', retryAfter = '15 minutes') => {
  return (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      message: customMessage,
      retryAfter,
    });
  };
};

// ── 1. Global Rate Limiter ────────────────────────────────────────────────────
// Applied globally to ALL routes: 100 requests per 15 minutes per IP
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: env.RATE_LIMIT_MAX || 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ prefix: 'rl:global:' }),
  handler: createRateLimitHandler(),
});

// ── 2. Auth Rate Limiter ──────────────────────────────────────────────────────
// Applied to login and register routes: 10 requests per 15 minutes
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed logins/auth attempts
  store: new RedisStore({ prefix: 'rl:auth:' }),
  handler: createRateLimitHandler('Too many login attempts. Account protection active. Please try again in 15 minutes.', '15 minutes'),
});

// ── 3. Password Reset Rate Limiter ────────────────────────────────────────────
// Applied to password reset requests: 3 requests per hour
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ prefix: 'rl:pwreset:' }),
  handler: createRateLimitHandler('Too many password reset requests. Please wait an hour before requesting another reset link.', '1 hour'),
});

// ── 4. Seat Lock Rate Limiter ─────────────────────────────────────────────────
// Applied to /bookings/lock-seats: 20 lock requests per 15 minutes
// Prevents scalper bots from hoarding seats across multiple events
export const seatLockRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ prefix: 'rl:seatlock:' }),
  handler: createRateLimitHandler('Seat lock limit exceeded. Please wait a few minutes before reserving more seats.', '15 minutes'),
});

// ── 5. Search API Rate Limiter ────────────────────────────────────────────────
// Applied to /search endpoints: 60 search requests per minute
// Prevents scraping bots & heavy regex text search DoS
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ prefix: 'rl:search:' }),
  handler: createRateLimitHandler('Search request limit exceeded. Please slow down your queries.', '1 minute'),
});

// ── 6. Review Creation Rate Limiter ───────────────────────────────────────────
// Applied to POST /reviews: 5 reviews per hour
// Prevents review spamming & rating manipulation attacks
export const reviewRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ prefix: 'rl:review:' }),
  handler: createRateLimitHandler('Review submission limit reached. You can post up to 5 reviews per hour.', '1 hour'),
});
