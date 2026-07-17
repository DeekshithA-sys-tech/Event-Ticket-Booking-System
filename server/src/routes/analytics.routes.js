/**
 * @file analytics.routes.js
 * @description Analytics Dashboard route definitions.
 *
 * ALL ROUTES REQUIRE AUTHENTICATION.
 * Role enforcement:
 *   - Organizer + Admin → /overview, /bookings/timeline, /revenue/breakdown, /reviews/summary
 *   - Organizer + Admin → /events/:eventId (organizer sees own only — enforced in service)
 *   - Admin only       → /platform/stats
 *
 * ROUTE ORDER:
 *   Static paths (/overview, /platform/stats, /bookings/timeline,
 *   /revenue/breakdown, /reviews/summary) must come BEFORE dynamic
 *   paths (/events/:eventId) to avoid parameter collision.
 */

import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { adminOnly, adminOrOrganizer } from '../middlewares/role.middleware.js';

const router = Router();

// All analytics routes require authentication
router.use(protect);

// ── Organizer + Admin Routes ──────────────────────────────────────────────────
router.get('/overview',             adminOrOrganizer, analyticsController.getOverview);
router.get('/bookings/timeline',    adminOrOrganizer, analyticsController.getBookingTimeline);
router.get('/revenue/breakdown',    adminOrOrganizer, analyticsController.getRevenueBreakdown);
router.get('/reviews/summary',      adminOrOrganizer, analyticsController.getReviewSummary);

// ── Admin Only ────────────────────────────────────────────────────────────────
router.get('/platform/stats',       adminOnly,        analyticsController.getPlatformStats);

// ── Per-Event (organizer sees own events only, enforced in service) ───────────
router.get('/events/:eventId',      adminOrOrganizer, analyticsController.getEventAnalytics);

export default router;
