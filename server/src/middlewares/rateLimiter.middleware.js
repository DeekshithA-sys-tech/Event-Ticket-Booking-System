/**
 * @file rateLimiter.middleware.js
 * @description Advanced Rate limiting middleware configurations backed by Redis Store.
 */

import rateLimit from 'express-rate-limit';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { env } from '../config/env.js';
import { RedisStore } from './redisStore.middleware.js';

// Bypass rate limits during development mode for smooth testing
const isDev = env.NODE_ENV === 'development' || !env.NODE_ENV;

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
export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: isDev ? 10000 : (env.RATE_LIMIT_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  store: new RedisStore({ prefix: 'rl:global:' }),
  handler: createRateLimitHandler(),
});

// ── 2. Auth Rate Limiter ──────────────────────────────────────────────────────
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => isDev,
  store: new RedisStore({ prefix: 'rl:auth:' }),
  handler: createRateLimitHandler('Too many login attempts. Account protection active. Please try again in 15 minutes.', '15 minutes'),
});

// ── 3. Password Reset Rate Limiter ────────────────────────────────────────────
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 10000 : 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  store: new RedisStore({ prefix: 'rl:pwreset:' }),
  handler: createRateLimitHandler('Too many password reset requests. Please wait an hour before requesting another reset link.', '1 hour'),
});

// ── 4. Seat Lock Rate Limiter ─────────────────────────────────────────────────
export const seatLockRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  store: new RedisStore({ prefix: 'rl:seatlock:' }),
  handler: createRateLimitHandler('Seat lock limit exceeded. Please wait a few minutes before reserving more seats.', '15 minutes'),
});

// ── 5. Search API Rate Limiter ────────────────────────────────────────────────
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  store: new RedisStore({ prefix: 'rl:search:' }),
  handler: createRateLimitHandler('Search request limit exceeded. Please slow down your queries.', '1 minute'),
});

// ── 6. Review Creation Rate Limiter ───────────────────────────────────────────
export const reviewRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  store: new RedisStore({ prefix: 'rl:review:' }),
  handler: createRateLimitHandler('Review submission limit reached. You can post up to 5 reviews per hour.', '1 hour'),
});
