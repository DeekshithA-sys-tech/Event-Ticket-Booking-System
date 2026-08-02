/**
 * @file review.routes.js
 * @description Review route definitions.
 *
 * TWO MOUNT POINTS:
 * -----------------
 * Reviews are mounted at TWO places in routes/index.js:
 *
 *   /events/:eventId/reviews  → GET (public, read-only)
 *     This is the natural RESTful location for event reviews.
 *     "Get the reviews that belong to this event."
 *
 *   /reviews                   → POST, PATCH, DELETE (authenticated)
 *     Review mutations are on the /reviews resource directly,
 *     since they don't need the eventId in the URL (it's in the body for POST,
 *     and we look it up from the reviewId for PATCH/DELETE).
 *
 * This file defines a single router. Routes/index.js mounts it at /reviews.
 * The /events/:eventId/reviews endpoint is mounted separately in event.routes.js.
 *
 * ACCESS CONTROL:
 * ---------------
 * GET /events/:eventId/reviews  → Public (optional auth for admin extras)
 * POST /reviews                 → Any authenticated user (customer eligibility enforced in service)
 * PATCH /reviews/:id            → Authenticated (owner enforced in service)
 * DELETE /reviews/:id           → Authenticated (owner or admin enforced in service)
 * POST /reviews/:id/flag        → Admin only
 * POST /reviews/:id/unflag      → Admin only
 * GET /reviews/flagged          → Admin only
 *
 * ROUTE ORDER:
 * ------------
 * '/flagged' must be registered before '/:reviewId' to avoid
 * Express treating 'flagged' as a reviewId param.
 */

import { Router } from 'express';
import * as reviewController from '../controllers/review.controller.js';
import { protect, optionalProtect } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { reviewRateLimiter } from '../middlewares/rateLimiter.middleware.js';
import {
  createReviewSchema,
  updateReviewSchema,
  reviewParamSchema,
  flagReviewSchema,
  getEventReviewsSchema,
} from '../validators/review.validator.js';

const router = Router();

// ── Admin: static routes (before /:reviewId) ─────────────────────────────────
router.get('/flagged', protect, adminOnly, reviewController.getFlaggedReviews);

// ── Create Review (any authenticated user) ────────────────────────────────────
router.post('/', protect, reviewRateLimiter, validate(createReviewSchema), reviewController.createReview);

// ── Mutate a specific review ─────────────────────────────────────────────────
router.patch('/:reviewId', protect, validate(updateReviewSchema), reviewController.updateReview);
router.delete('/:reviewId', protect, validate(reviewParamSchema), reviewController.deleteReview);

// ── Admin: moderate a review ─────────────────────────────────────────────────
router.post('/:reviewId/flag', protect, adminOnly, validate(flagReviewSchema), reviewController.flagReview);
router.post('/:reviewId/unflag', protect, adminOnly, validate(reviewParamSchema), reviewController.unflagReview);

export default router;

// ─── Event-Scoped Review Reader (exported separately for event.routes.js) ─────
/**
 * Mini-router for GET /events/:eventId/reviews
 * Mounted in event.routes.js to preserve RESTful URL structure.
 */
export const eventReviewsRouter = Router({ mergeParams: true });

eventReviewsRouter.get(
  '/',
  optionalProtect, // Auth optional — public can view, admin gets extra data
  validate(getEventReviewsSchema),
  reviewController.getEventReviews
);
