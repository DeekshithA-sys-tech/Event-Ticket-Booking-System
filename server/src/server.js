/**
 * @file server.js
 * @description HTTP server entry point with graceful shutdown.
 */

import { createServer } from 'http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { configureCloudinary } from './config/cloudinary.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { startEmailWorker, stopEmailWorker } from './jobs/workers/email.worker.js';

// ─── Bootstrap Function ───────────────────────────────────────────────────────
const bootstrap = async () => {
  try {
    // ── Step 1: Database (required) ──────────────────────────────────────────
    await connectDB();

    // ── Step 2: Redis (optional in local dev mode) ────────────────────────────
    const redisConnected = await connectRedis();

    // ── Step 3: Cloudinary ────────────────────────────────────────────────────
    configureCloudinary();

    // ── Step 4: Email Worker (BullMQ) ────────────────────────────────────────
    if (redisConnected) {
      startEmailWorker();
    } else {
      logger.info('[EmailWorker] Email worker paused (Redis offline — running in Memory Fallback mode).');
    }

    // ── Step 5: Start HTTP Server ────────────────────────────────────────────
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

      httpServer.close(async () => {
        logger.info('[Server] HTTP server closed. No new connections accepted.');

        try {
          // Close MongoDB connection
          const mongoose = await import('mongoose');
          await mongoose.default.connection.close();
          logger.info('[DB] MongoDB connection closed.');

          // Close Redis connection
          if (redisConnected) {
            const { getRedisClient } = await import('./config/redis.js');
            try {
              const redis = getRedisClient();
              await redis.quit();
              logger.info('[Redis] Redis connection closed.');
            } catch (_err) {
              // Ignore
            }
          }

          // Close email worker
          await stopEmailWorker();
          const { closeEmailQueue } = await import('./jobs/queues/email.queue.js');
          await closeEmailQueue();
          logger.info('[EmailWorker] Email worker and queue closed.');

          logger.info('[Server] Graceful shutdown complete. Goodbye! 👋');
          process.exit(0);
        } catch (err) {
          logger.error(`[Server] Error during shutdown: ${err.message}`);
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('[Server] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return httpServer;
  } catch (error) {
    logger.error(`[Server] Failed to start: ${error.message}`);
    process.exit(1);
  }
};

process.on('uncaughtException', (err) => {
  logger.error(`[FATAL] Uncaught Exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`[FATAL] Unhandled Promise Rejection: ${reason}`);
  process.exit(1);
});

bootstrap();
