/**
 * @file server.js
 * @description HTTP server entry point with graceful shutdown.
 *
 * RESPONSIBILITIES:
 * -----------------
 * This file does ONLY three things:
 *  1. Boot sequence: connect DB → connect Redis → start HTTP server
 *  2. Listen for OS signals to initiate graceful shutdown
 *  3. Handle any uncaught exceptions / unhandled rejections as last resort
 *
 * It imports `app` from app.js — it doesn't touch middleware or routes.
 *
 * WHY GRACEFUL SHUTDOWN?
 * -----------------------
 * When a container is being terminated (Ctrl+C, SIGTERM from Kubernetes/Render):
 *
 * WITHOUT graceful shutdown:
 *  - Process dies immediately
 *  - In-flight requests are aborted → users see 500 errors
 *  - Database connections are cut hard → potential data corruption
 *
 * WITH graceful shutdown:
 *  1. Stop accepting NEW connections
 *  2. Wait for existing requests to complete (max 10 seconds)
 *  3. Close database and Redis connections cleanly
 *  4. Exit 0 (success)
 *
 * This is mandatory in any system with SLAs.
 *
 * STARTUP ORDER:
 * --------------
 * 1. Connect MongoDB (required — fail if unavailable)
 * 2. Connect Redis (optional in early sprints — warn if unavailable)
 * 3. Configure Cloudinary
 * 4. Start HTTP server
 *
 * If step 1 fails, the process exits. If step 2 fails, we warn and continue.
 */

import { createServer } from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { configureCloudinary } from './config/cloudinary.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

// ─── Bootstrap Function ───────────────────────────────────────────────────────
const bootstrap = async () => {
  try {
    // ── Step 1: Database (required) ──────────────────────────────────────────
    await connectDB();

    // ── Step 2: Redis (optional in early sprints) ────────────────────────────
    await connectRedis();

    // ── Step 3: Cloudinary ────────────────────────────────────────────────────
    configureCloudinary();

    // ── Step 4: Start HTTP Server ─────────────────────────────────────────────
    const httpServer = createServer(app);

    httpServer.listen(env.PORT, () => {
      logger.info('─────────────────────────────────────────────────');
      logger.info(`  🎟  Event Ticket Booking API`);
      logger.info(`  🌍  Environment : ${env.NODE_ENV}`);
      logger.info(`  🚀  Server      : http://localhost:${env.PORT}`);
      logger.info(`  📚  Swagger     : http://localhost:${env.PORT}/api-docs`);
      logger.info(`  ✅  Health      : http://localhost:${env.PORT}/api/v1/health`);
      logger.info('─────────────────────────────────────────────────');
    });

    // ── Graceful Shutdown Handler ──────────────────────────────────────────────
    const shutdown = async (signal) => {
      logger.warn(`[Server] Received ${signal}. Starting graceful shutdown...`);

      // Stop accepting new connections
      httpServer.close(async () => {
        logger.info('[Server] HTTP server closed. No new connections accepted.');

        try {
          // Close MongoDB connection
          const mongoose = await import('mongoose');
          await mongoose.default.connection.close();
          logger.info('[DB] MongoDB connection closed.');

          // Close Redis connection
          const { getRedisClient } = await import('./config/redis.js');
          try {
            const redis = getRedisClient();
            await redis.quit();
            logger.info('[Redis] Redis connection closed.');
          } catch {
            // Redis might not have connected — that's fine
          }

          logger.info('[Server] Graceful shutdown complete. Goodbye! 👋');
          process.exit(0);
        } catch (err) {
          logger.error(`[Server] Error during shutdown: ${err.message}`);
          process.exit(1);
        }
      });

      // Force shutdown if graceful shutdown takes too long
      setTimeout(() => {
        logger.error('[Server] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 10000); // 10 second timeout
    };

    // SIGTERM: sent by Docker/Kubernetes/Render when terminating a container
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    // SIGINT: sent by Ctrl+C in the terminal
    process.on('SIGINT', () => shutdown('SIGINT'));

    return httpServer;
  } catch (error) {
    logger.error(`[Server] Failed to start: ${error.message}`);
    process.exit(1);
  }
};

// ─── Last-Resort Error Handlers ───────────────────────────────────────────────
// These catch anything that slips past our error middleware (programming bugs).
// Log the error and exit — a crashed process is better than a zombie process.

process.on('uncaughtException', (err) => {
  logger.error(`[FATAL] Uncaught Exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`[FATAL] Unhandled Promise Rejection: ${reason}`);
  process.exit(1);
});

// ─── Start the Server ─────────────────────────────────────────────────────────
bootstrap();
