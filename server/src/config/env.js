/**
 * @file env.js
 * @description Centralised environment variable loader and validator.
 *
 * WHY THIS EXISTS:
 * ----------------
 * Scattering `process.env.SOME_VAR` throughout the codebase is dangerous:
 *  - A missing variable causes a crash deep in the app, far from the root cause.
 *  - It's impossible to know at a glance what variables the app needs.
 *
 * This module:
 *  1. Loads .env via dotenv at the very first import.
 *  2. Validates that every required variable is present at startup.
 *  3. Exports a single `env` object — the ONLY place process.env is accessed.
 *
 * Any other file should import from this module, not from process.env directly.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname in ES Modules (not available by default)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root (server/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Validates that all required environment variables are defined.
 * Throws a descriptive error listing every missing key before the server starts.
 * @param {string[]} required - List of required env variable names
 */
const validateEnv = (required) => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[ENV] Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
        `Please check your .env file against .env.example`
    );
  }
};

// ─── Required Variables ───────────────────────────────────────────────────────
// Add to this list whenever a new required variable is introduced.
// The server will refuse to start if any of these are missing.
validateEnv(['NODE_ENV', 'PORT', 'MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_URL']);

// ─── Exported Config Object ───────────────────────────────────────────────────
export const env = Object.freeze({
  // ── Server ──────────────────────────────────────────────────────────────────
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  // ── MongoDB ─────────────────────────────────────────────────────────────────
  MONGODB_URI: process.env.MONGODB_URI,

  // ── JWT ─────────────────────────────────────────────────────────────────────
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  // Separate Redis for BullMQ job queues (can be same instance in dev)
  // In production, use a dedicated Redis for BullMQ vs caching Redis
  BULLMQ_REDIS_URL: process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379',

  // ── Cloudinary ───────────────────────────────────────────────────────────────
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  // ── Email ────────────────────────────────────────────────────────────────────
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'Event Booking <no-reply@example.com>',

  // ── Rate Limiting ─────────────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
});
