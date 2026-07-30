/**
 * @file admin.routes.js
 * @description Admin platform management route definitions.
 *
 * ALL ROUTES:
 * ────────────
 *  1. require authentication (protect)
 *  2. require admin role (adminOnly)
 *
 * These two guards are applied globally with router.use() so they
 * don't need to be repeated on every route definition.
 *
 * ROUTE SURFACE (all under /api/v1/admin):
 * ─────────────────────────────────────────
 *
 *  Platform Dashboard
 *  GET  /admin/dashboard                  → platform stats overview
 *
 *  Event Management
 *  GET   /admin/events                    → all events (paginated, filterable)
 *  PATCH /admin/events/:eventId/status    → force-change event status
 *
 *  Booking Management
 *  GET  /admin/bookings                   → all bookings (paginated, filterable)
 *  POST /admin/bookings/:bookingId/cancel → force-cancel + seat release
 *
 *  Review Moderation
 *  GET  /admin/reviews                    → all reviews (paginated, filterable)
 *
 *  Audit Trail
 *  GET  /admin/audit-logs                 → immutable admin action history
 *
 *  System Health
 *  GET  /admin/health                     → MongoDB + Redis + BullMQ + process
 *
 * WHY A DEDICATED /admin ROUTER?
 * ───────────────────────────────
 * We could put admin routes inside existing routers (e.g. event.routes.js,
 * booking.routes.js). But that makes the auth guard conditional per-route
 * and mixes organizer + admin concerns in the same file.
 *
 * A dedicated /admin router means:
 *   - ALL routes are admin-only by default (applied once with router.use)
 *   - Clear audit surface: "everything under /admin is privileged"
 *   - Easier to add middleware later (rate limiting, IP allowlisting)
 */

import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';

const router = Router();

// ── Global Guards: ALL admin routes require auth + admin role ─────────────────
router.use(protect);
router.use(adminOnly);

// ── Platform Dashboard ────────────────────────────────────────────────────────
router.get('/dashboard', adminController.getDashboard);

// ── Event Management ──────────────────────────────────────────────────────────
router.get('/events', adminController.listEvents);
router.patch('/events/:eventId/status', adminController.changeEventStatus);

// ── Booking Management ────────────────────────────────────────────────────────
router.get('/bookings', adminController.listBookings);
router.post('/bookings/:bookingId/cancel', adminController.forceCancelBooking);

// ── Review Moderation ─────────────────────────────────────────────────────────
router.get('/reviews', adminController.listReviews);

// ── Audit Trail ───────────────────────────────────────────────────────────────
router.get('/audit-logs', adminController.getAuditLogs);

// ── System Health (enriched — more detail than public /health) ────────────────
router.get('/health', adminController.getSystemHealth);

export default router;
