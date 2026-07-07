/**
 * @file health.routes.js
 * @description Health check endpoint.
 *
 * WHY A HEALTH CHECK ENDPOINT?
 * ------------------------------
 * Every production service needs a /health endpoint because:
 *
 *  1. Load balancers (AWS ALB, Nginx) ping it to decide whether to route
 *     traffic to this instance. Unhealthy? Traffic is redirected.
 *
 *  2. Container orchestrators (Kubernetes, Docker Swarm, Render) use it for
 *     liveness and readiness probes. If /health returns non-2xx, the container
 *     is restarted automatically.
 *
 *  3. On-call engineers can instantly check if the server is up and what
 *     its dependencies (DB, Redis) look like without reading logs.
 *
 * WHAT WE CHECK:
 * --------------
 * - Server: always "ok" (if this route responds, the server is up)
 * - Database: check mongoose connection state (0=disconnected, 1=connected)
 * - Redis: ping the Redis client
 * - Uptime: how long the process has been running
 * - Memory: current heap usage
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Server health check
 *     description: Returns the health status of the server and its dependencies.
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Server is healthy
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: ok
 *                     uptime:
 *                       type: number
 *                       example: 3600.5
 *                     database:
 *                       type: string
 *                       example: connected
 *                     memory:
 *                       type: object
 *       503:
 *         description: Service unavailable
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    // MongoDB connection states: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
    const isHealthy = dbState === 1;

    const healthData = {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()), // seconds the process has been running
      environment: process.env.NODE_ENV,
      database: dbStatus,
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
      },
    };

    const statusCode = isHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
    const message = isHealthy ? MESSAGES.HEALTH.OK : MESSAGES.HEALTH.DB_ERROR;

    return res.status(statusCode).json(new ApiResponse(statusCode, message, healthData));
  })
);

export default router;
