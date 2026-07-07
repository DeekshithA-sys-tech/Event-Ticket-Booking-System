/**
 * @file logger.middleware.js
 * @description HTTP request/response logger middleware using Morgan + Winston.
 *
 * WHY MORGAN + WINSTON TOGETHER?
 * --------------------------------
 * Morgan is the de-facto standard for HTTP request logging in Express.
 * It's excellent at capturing method, URL, status, response time, etc.
 *
 * However, Morgan writes to process.stdout by default — separate from our
 * Winston log pipeline. By wiring Morgan's output INTO Winston:
 *   - All logs (app + HTTP) flow through a single pipeline
 *   - In production, HTTP logs are also structured JSON
 *   - Single place to add log aggregation, redaction, or enrichment
 *
 * WHAT GETS LOGGED:
 * -----------------
 * Every HTTP request: METHOD /path STATUS time ms
 * Example: GET /api/v1/events 200 45ms
 *
 * Sensitive paths (auth endpoints) skip request body logging.
 */

import morgan from 'morgan';
import { logger } from '../utils/logger.js';

// ── Wire Morgan's output stream into Winston ────────────────────────────────
// Morgan writes a string; we parse it and hand it to Winston's http level
const stream = {
  write: (message) => {
    // morgan adds a trailing newline — trim it before logging
    logger.http(message.trim());
  },
};

// ── Skip logging for health checks ─────────────────────────────────────────
// Health check endpoints are polled every few seconds by load balancers.
// Logging every /health request creates noise without value.
const skip = (req) => {
  return req.originalUrl === '/health' || req.originalUrl === '/api/v1/health';
};

// ── Morgan format ──────────────────────────────────────────────────────────
// ':method :url :status :res[content-length] - :response-time ms'
// This gives us: GET /api/v1/events 200 1024 - 45 ms
const morganMiddleware = morgan(
  ':remote-addr :method :url :status :res[content-length] - :response-time ms',
  { stream, skip }
);

export default morganMiddleware;
