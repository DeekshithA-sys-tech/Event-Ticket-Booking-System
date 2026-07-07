/**
 * @file index.js
 * @description Root API router — mounts all sub-routers under /api/v1.
 *
 * WHY A CENTRAL ROUTER INDEX?
 * ----------------------------
 * Without this file, app.js would directly import and mount every route:
 *   app.use('/api/v1/auth', authRoutes);
 *   app.use('/api/v1/events', eventRoutes);
 *   ...10 more lines...
 *
 * Instead, app.js mounts ONE router:
 *   app.use('/api/v1', apiRouter);
 *
 * And THIS file handles all sub-routing. Benefit:
 *  - app.js stays clean — it only knows about /api/v1
 *  - Adding a new feature module only requires one line here
 *  - The API version prefix is in ONE place — changing v1 to v2 is trivial
 *
 * PLACEHOLDER ROUTES:
 * --------------------
 * Routes for Auth, Events, Bookings, etc. are imported here but will return
 * 404/501 until implemented in future sprints. We stub them now so the
 * import tree is established and tests have targets to hit.
 */

import { Router } from 'express';
import healthRouter from './health.routes.js';

const router = Router();

// ── Health Check ──────────────────────────────────────────────────────────────
router.use('/health', healthRouter);

// ── Feature Routes (added sprint by sprint) ───────────────────────────────────
// Sprint 3: Authentication
// router.use('/auth', authRoutes);

// Sprint 3: Users
// router.use('/users', userRoutes);

// Sprint 4: Events
// router.use('/events', eventRoutes);

// Sprint 4: Categories
// router.use('/categories', categoryRoutes);

// Sprint 5: Bookings
// router.use('/bookings', bookingRoutes);

// Sprint 6+: Reviews, Notifications, Analytics
// router.use('/reviews', reviewRoutes);
// router.use('/notifications', notificationRoutes);
// router.use('/analytics', analyticsRoutes);

export default router;
