/**
 * @file app.js
 * @description Express application factory — assembles all middleware and routes.
 *
 * WHY SEPARATE app.js FROM server.js?
 * ------------------------------------
 * This is a critical architectural decision used in every production codebase:
 *
 * server.js  → Creates the HTTP server, starts listening on a port.
 *              Handles OS-level concerns: graceful shutdown, port binding.
 *
 * app.js     → Creates and configures the Express application.
 *              Applies middleware, registers routes.
 *              Knows nothing about ports or server lifecycle.
 *
 * WHY DOES THIS MATTER?
 *  - In tests, you import `app` directly and use supertest — no port conflicts.
 *  - In production, server.js imports `app` and starts it.
 *  - You can run the same `app` over HTTP, HTTPS, or HTTP/2 by changing only server.js.
 *
 * MIDDLEWARE ORDER:
 * -----------------
 * Order matters in Express — middleware runs in registration order.
 * The order here is intentional:
 *  1. Security headers (Helmet) — set BEFORE any response can be sent
 *  2. CORS — must come before routes handle requests
 *  3. Body parsing — must come before validation/controllers read req.body
 *  4. Request logger — log after security, before route processing
 *  5. Rate limiter — before routes process the request
 *  6. Request sanitization — clean input before business logic sees it
 *  7. Routes — actual application logic
 *  8. 404 handler — after all routes, catches unmatched paths
 *  9. Error handler — LAST, catches all errors thrown above
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { swaggerSpec } from './config/swagger.js';
import apiRouter from './routes/index.js';
import morganMiddleware from './middlewares/logger.middleware.js';
import { globalRateLimiter } from './middlewares/rateLimiter.middleware.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware.js';
import { logger } from './utils/logger.js';

// ─── Create Express App ───────────────────────────────────────────────────────
const app = express();

// ── 1. Trust Proxy ────────────────────────────────────────────────────────────
// Required when behind a reverse proxy (Nginx, Render, Heroku, etc.)
// Ensures req.ip returns the real client IP, not the proxy IP.
// This makes rate limiting (per real IP) work correctly in production.
if (env.isProd) {
  app.set('trust proxy', 1);
}

// ── 2. Helmet — Security HTTP Headers ─────────────────────────────────────────
// Helmet sets many HTTP headers that protect against common attacks:
//  - Content-Security-Policy: prevents XSS by restricting resource sources
//  - X-Frame-Options: prevents clickjacking
//  - X-Content-Type-Options: prevents MIME type sniffing
//  - Strict-Transport-Security: enforces HTTPS
app.use(
  helmet({
    // Allow Swagger UI to load its own resources in development
    contentSecurityPolicy: env.isProd ? undefined : false,
  })
);

// ── 3. CORS — Cross-Origin Resource Sharing ───────────────────────────────────
// Only allow requests from our frontend origin.
// Using `credentials: true` allows the browser to send httpOnly cookies
// (needed for refresh tokens).
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!origin) return callback(null, true);

      const allowedOrigins = [env.CLIENT_URL];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`[CORS] Blocked request from origin: ${origin}`);
        callback(new Error(`CORS: Origin '${origin}' is not allowed.`));
      }
    },
    credentials: true, // Allow cookies to be sent cross-origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── 4. Body Parsers ────────────────────────────────────────────────────────────
// Parse JSON request bodies — limit prevents large payload DoS attacks
app.use(express.json({ limit: '10kb' }));
// Parse URL-encoded form data (e.g. multipart forms)
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
// Parse cookies from request headers — needed for refresh token cookie
app.use(cookieParser());

// ── 5. Compression ────────────────────────────────────────────────────────────
// Gzip/Brotli compress HTTP responses > 1KB
// This significantly reduces bandwidth for event listings and large JSON responses
app.use(compression());

// ── 6. HTTP Request Logger ────────────────────────────────────────────────────
// Logs: METHOD /path STATUS response-time-ms
// Wired into Winston (see logger.middleware.js)
app.use(morganMiddleware);

// ── 7. Rate Limiting ──────────────────────────────────────────────────────────
// Applied globally — 100 req/15min per IP
// Auth endpoints get a stricter limiter applied at the route level (Sprint 3)
app.use(globalRateLimiter);

// ── 8. MongoDB Injection Sanitization ─────────────────────────────────────────
// Strips $ and . from user input, preventing NoSQL injection attacks
// Example: { email: { "$gt": "" } } would bypass login — this stops it
app.use(mongoSanitize());

// ── 9. Swagger UI ─────────────────────────────────────────────────────────────
// Serves interactive API documentation at /api-docs
// Only expose in non-production (or protect with auth in production)
if (!env.isProd) {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customSiteTitle: 'Event Booking API Docs',
      customCss: '.swagger-ui .topbar { display: none }', // Hide the default Swagger header
    })
  );
  logger.info(`[Swagger] API docs available at http://localhost:${env.PORT}/api-docs`);
}

// ── 10. API Routes ─────────────────────────────────────────────────────────────
// All application routes under /api/v1
app.use('/api/v1', apiRouter);

// ── 11. 404 Handler ────────────────────────────────────────────────────────────
// Catches any request that didn't match a registered route
app.use(notFoundMiddleware);

// ── 12. Global Error Handler ──────────────────────────────────────────────────
// MUST be the LAST middleware registered — Express identifies it by 4 params
// Catches all errors thrown anywhere in the application
app.use(errorMiddleware);

export default app;
