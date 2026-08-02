/**
 * @file app.js
 * @description Express application factory - assembles all middleware and routes.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { swaggerSpec } from './config/swagger.js';
import apiRouter from './routes/index.js';
import morganMiddleware from './middlewares/logger.middleware.js';
import { globalRateLimiter } from './middlewares/rateLimiter.middleware.js';
import { securityHeadersMiddleware } from './middlewares/securityHeaders.middleware.js';
import { apiVersioningMiddleware } from './middlewares/versioning.middleware.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware.js';
import { logger } from './utils/logger.js';

// --- Create Express App ---
const app = express();

// -- 1. Trust Proxy --
if (env.isProd) {
  app.set('trust proxy', 1);
}

// -- 2. Helmet Security Headers --
app.use(
  helmet({
    contentSecurityPolicy: env.isProd ? undefined : false,
    crossOriginEmbedderPolicy: env.isProd,
  })
);

// -- 3. Security Headers Middleware --
app.use(securityHeadersMiddleware);

// -- 4. CORS --
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedOrigins = [env.CLIENT_URL];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`[CORS] Blocked request from origin: ${origin}`);
        callback(new Error(`CORS: Origin '${origin}' is not allowed.`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Version'],
    maxAge: 86400,
  })
);

// -- 5. Body Parsers --
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// -- 6. HTTP Parameter Pollution Protection --
app.use(hpp());

// -- 7. Compression --
app.use(compression());

// -- 8. Request Logger --
app.use(morganMiddleware);

// -- 9. API Versioning --
app.use(apiVersioningMiddleware);

// -- 10. Rate Limiting --
app.use(globalRateLimiter);

// -- 11. MongoDB Injection Sanitization --
app.use(
  mongoSanitize({
    replaceWith: '_',
    allowDots: false,
  })
);

// -- 12. Swagger UI --
if (!env.isProd) {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customSiteTitle: 'Event Booking API Docs',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );
  logger.info(`[Swagger] API docs available at http://localhost:${env.PORT}/api-docs`);
}

// -- 13. API Routes --
app.use('/api/v1', apiRouter);

// -- 14. 404 Handler --
app.use(notFoundMiddleware);

// -- 15. Global Error Handler --
app.use(errorMiddleware);

export default app;
