/**
 * @file event.routes.js
 * @description Event route definitions.
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
import { eventReviewsRouter } from './review.routes.js';

const router = Router();

// ── Public Routes ─────────────────────────────────────────────────────────────
router.get('/', validate(eventListQuerySchema), eventController.getEvents);

// IMPORTANT: Must come before /:eventId
router.get(
  '/organizer/my-events',
  protect,
  adminOrOrganizer,
  eventController.getMyEvents
);

router.get('/:eventId', validate(eventParamSchema), eventController.getEventById);

// ── Event Creation & Management (Organizer or Admin) ────────────────────────
router.post(
  '/',
  protect,
  adminOrOrganizer,
  validate(createEventSchema),
  eventController.createEvent
);

router.patch(
  '/:eventId',
  protect,
  adminOrOrganizer,
  validate(updateEventSchema),
  eventController.updateEvent
);

router.post(
  '/:eventId/banner',
  protect,
  adminOrOrganizer,
  uploadSingle('banner'),
  eventController.uploadEventBanner
);

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

// ── Event Reviews ─────────────────────────────────────────────────────────────
router.use('/:eventId/reviews', eventReviewsRouter);

export default router;
