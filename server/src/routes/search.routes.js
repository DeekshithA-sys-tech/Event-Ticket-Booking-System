/**
 * @file search.routes.js
 * @description Search & Discovery route definitions.
 *
 * ALL ROUTES ARE PUBLIC — no authentication required.
 *
 * Route order matters:
 * '/trending'           — static, must precede /:eventId
 * '/cities'             — static, must precede /:eventId
 * '/categories/counts'  — static, must precede /:eventId
 * '/:eventId/related'   — dynamic (eventId param)
 * '/:eventId/seats'     — dynamic (eventId param)
 *
 * NOTE ON BASE PATH:
 * This router is mounted at /api/v1/search in routes/index.js
 *   GET /api/v1/search/events          → searchEvents
 *   GET /api/v1/search/trending        → getTrendingEvents
 *   GET /api/v1/search/cities          → getCities
 *   GET /api/v1/search/categories/counts → getCategoryCounts
 *   GET /api/v1/search/events/:id/related → getRelatedEvents
 *   GET /api/v1/search/events/:id/seats  → getSeatAvailability
 */

import { Router } from 'express';
import * as searchController from '../controllers/search.controller.js';

const router = Router();

// ── Static Routes ─────────────────────────────────────────────────────────────
router.get('/events', searchController.searchEvents);
router.get('/trending', searchController.getTrendingEvents);
router.get('/cities', searchController.getCities);
router.get('/categories/counts', searchController.getCategoryCounts);

// ── Dynamic (Event-specific) Routes ───────────────────────────────────────────
router.get('/events/:eventId/related', searchController.getRelatedEvents);
router.get('/events/:eventId/seats', searchController.getSeatAvailability);

export default router;
