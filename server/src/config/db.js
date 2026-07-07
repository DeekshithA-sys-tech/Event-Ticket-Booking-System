/**
 * @file db.js
 * @description MongoDB connection manager using Mongoose.
 *
 * WHY THIS EXISTS:
 * ----------------
 * Database connectivity is infrastructure — it belongs in config, not in app.js
 * or scattered across route files. Isolating it here means:
 *  - One place to change if we swap drivers or add replicas.
 *  - Clean separation: app.js sets up HTTP, this file sets up the DB.
 *
 * DESIGN DECISIONS:
 * -----------------
 * 1. We export a function `connectDB()` rather than connecting at import time.
 *    This gives server.js full control over startup order.
 *
 * 2. We use Mongoose's built-in connection events to log connection state changes.
 *    In a production system, these events can be wired to an alerting system.
 *
 * 3. `bufferCommands: false` — Mongoose by default queues operations if the DB
 *    is not connected. We disable this so errors surface immediately rather than
 *    silently hanging. Fail fast > silently wait.
 */

import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// ─── Mongoose Global Config ────────────────────────────────────────────────────
// Disable the deprecated strictQuery warning
mongoose.set('strictQuery', true);

/**
 * Establishes a connection to MongoDB.
 * Called once at server startup — before the HTTP server starts listening.
 *
 * @returns {Promise<void>}
 * @throws Will throw if the initial connection cannot be established
 */
export const connectDB = async () => {
  try {
    const connection = await mongoose.connect(env.MONGODB_URI, {
      // Mongoose 6+ handles most options automatically, but we
      // set these explicitly for clarity and production readiness:
      bufferCommands: false, // Don't queue operations when disconnected
      serverSelectionTimeoutMS: 5000, // Fail fast if Atlas is unreachable (5s)
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    });

    logger.info(`[DB] MongoDB connected: ${connection.connection.host}`);
  } catch (error) {
    logger.error(`[DB] MongoDB connection failed: ${error.message}`);
    // Exit the process — a server without a database is useless and dangerous
    process.exit(1);
  }
};

// ─── Connection Event Listeners ───────────────────────────────────────────────
// These fire after the initial connection for monitoring ongoing state.

mongoose.connection.on('disconnected', () => {
  logger.warn('[DB] MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('[DB] MongoDB reconnected successfully.');
});

mongoose.connection.on('error', (err) => {
  logger.error(`[DB] MongoDB runtime error: ${err.message}`);
});
