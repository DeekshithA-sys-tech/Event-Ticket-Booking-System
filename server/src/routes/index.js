/**
 * @file index.js
 * @description Root API router — mounts all sub-routers under /api/v1.
 */

import { Router } from 'express';
import healthRouter from './health.routes.js';
import authRouter from './auth.routes.js';          // Sprint 3
import categoryRouter from './category.routes.js';  // Sprint 4
import eventRouter from './event.routes.js';        // Sprint 4
import bookingRouter from './booking.routes.js';    // Sprint 5
import userRouter from './user.routes.js';          // Sprint 6
import searchRouter from './search.routes.js';      // Sprint 7
import reviewRouter from './review.routes.js';      // Sprint 8

const router = Router();

// ── Health Check ──────────────────────────────────────────────────────────────
router.use('/health', healthRouter);

// ── Sprint 3: Authentication & Authorization ──────────────────────────────────
router.use('/auth', authRouter);

// ── Sprint 4: Event Management ────────────────────────────────────────────────
router.use('/categories', categoryRouter);
router.use('/events', eventRouter);

// ── Upcoming Routes ───────────────────────────────────────────────────────────
// Sprint 3: Users profile management
// router.use('/users', userRoutes);

// ── Sprint 5: Seat Selection & Booking ──────────────────────────────────────
router.use('/bookings', bookingRouter);

// ── Sprint 6: User Profile Management ────────────────────────────────
router.use('/users', userRouter);

// ── Sprint 7: Search & Discovery ───────────────────────────────────
router.use('/search', searchRouter);

// ── Sprint 8: Reviews & Ratings ──────────────────────────────────
router.use('/reviews', reviewRouter);
// GET /events/:eventId/reviews is mounted in event.routes.js

// Sprint 9+: Notifications, Analytics
// router.use('/notifications', notificationRoutes);
// router.use('/analytics', analyticsRoutes);

export default router;
