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
import analyticsRouter from './analytics.routes.js'; // Sprint 9
import adminRouter from './admin.routes.js';         // Sprint 11
import paymentRouter from './payment.routes.js';     // Payments & Refunds
import notificationRouter from './notification.routes.js'; // In-app Notifications
import aiRouter from './ai.routes.js'; // Agentic AI microservice forwarder

const router = Router();

// ── Health Check ──────────────────────────────────────────────────────────────
router.use('/health', healthRouter);

// ── Sprint 3: Authentication & Authorization ──────────────────────────────────
router.use('/auth', authRouter);

// ── Sprint 4: Event Management ────────────────────────────────────────────────
router.use('/categories', categoryRouter);
router.use('/events', eventRouter);

// ── Sprint 5: Seat Selection & Booking ──────────────────────────────────────
router.use('/bookings', bookingRouter);

// ── Sprint 6: User Profile Management ────────────────────────────────
router.use('/users', userRouter);

// ── Sprint 7: Search & Discovery ───────────────────────────────────
router.use('/search', searchRouter);

// ── Sprint 8: Reviews & Ratings ──────────────────────────────────
router.use('/reviews', reviewRouter);
// GET /events/:eventId/reviews is mounted in event.routes.js

// ── Sprint 9: Organizer Analytics Dashboard ──────────────────────
router.use('/analytics', analyticsRouter);

// ── Sprint 10: Email Notifications & PDF Tickets ──────────────────
// No new router — emails run via BullMQ worker (src/jobs/)
// New route: GET /bookings/:bookingId/ticket (in booking.routes.js)

// ── Sprint 11: Admin Dashboard & Platform Management ───────────────
router.use('/admin', adminRouter);

// ── Payments & Refund Transactions ────────────────────────────────
router.use('/payments', paymentRouter);

// ── In-App Notifications ──────────────────────────────────────────
router.use('/notifications', notificationRouter);

// ── Agentic AI Layer (Python ai-service forwarder) ────────────────
router.use('/ai', aiRouter);

export default router;

