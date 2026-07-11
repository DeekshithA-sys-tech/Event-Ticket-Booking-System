/**
 * @file event.routes.js
 * @description Event route definitions.
 *
 * ACCESS CONTROL SUMMARY:
 * -----------------------
 * GET  /events                    → Public
 * GET  /events/:eventId           → Public
 * GET  /events/organizer/my-events → Organizer only
 * POST /events                    → Organizer only
 * PATCH /events/:eventId          → Organizer only (own events)
 * POST /events/:eventId/banner    → Organizer only (own events)
 * DELETE /events/:eventId         → Organizer (own) or Admin
 * PATCH /events/:eventId/status   → Admin only
 *
 * ROUTE ORDER MATTERS:
 * --------------------
 * '/organizer/my-events' must be registered BEFORE '/:eventId'.
 * Otherwise Express matches 'organizer' as the :eventId param.
 * This is a classic Express routing pitfall.
 */

import { Router } from 'express';
import * as eventController from '../controllers/event.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { adminOnly, adminOrOrganizer, organizerOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { uploadSingle } from '../middlewares/upload.middleware.js';
import {
  createEventSchema,
  updateEventSchema,
  updateEventStatusSchema,
  eventParamSchema,
  eventListQuerySchema,
} from '../validators/event.validator.js';
import { eventReviewsRouter } from './review.routes.js'; // Sprint 8

const router = Router();

// ── Public Routes ─────────────────────────────────────────────────────────────
router.get('/', validate(eventListQuerySchema), eventController.getEvents);

// IMPORTANT: This must come before /:eventId to avoid param conflict
router.get(
  '/organizer/my-events',
  protect,
  organizerOnly,
  eventController.getMyEvents
);

router.get('/:eventId', validate(eventParamSchema), eventController.getEventById);

// ── Organizer Routes ──────────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  organizerOnly,
  validate(createEventSchema),
  eventController.createEvent
);

router.patch(
  '/:eventId',
  protect,
  organizerOnly,
  validate(updateEventSchema),
  eventController.updateEvent
);

router.post(
  '/:eventId/banner',
  protect,
  organizerOnly,
  uploadSingle('banner'), // Multer middleware — parses multipart/form-data
  eventController.uploadEventBanner
);

// ── Organizer or Admin Routes ─────────────────────────────────────────────────
router.delete(
  '/:eventId',
  protect,
  adminOrOrganizer,
  validate(eventParamSchema),
  eventController.deleteEvent
);

// ── Admin Only Routes ─────────────────────────────────────────────────────────
router.patch(
  '/:eventId/status',
  protect,
  adminOnly,
  validate(updateEventStatusSchema),
  eventController.updateEventStatus
);

// ── Sprint 8: Event Reviews (nested resource) ────────────────────────────
// GET /events/:eventId/reviews → public (optional auth for admin extras)
// mergeParams: true in eventReviewsRouter allows it to read :eventId
router.use('/:eventId/reviews', eventReviewsRouter);

export default router;
