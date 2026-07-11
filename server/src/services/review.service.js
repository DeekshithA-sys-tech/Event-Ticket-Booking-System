/**
 * @file review.service.js
 * @description Review & Ratings business logic.
 *
 * THE ELIGIBILITY GATE:
 * ─────────────────────
 * Not every authenticated user can review an event.
 * The reviewer must:
 *   1. Have a CONFIRMED booking for the event (not cancelled)
 *   2. The event must have already HAPPENED (date < now)
 *
 * WHY BOTH CONDITIONS?
 *   - Condition 1 prevents fake reviews from people who never attended.
 *     Without it: competitors could flood an event with 1-star reviews.
 *   - Condition 2 prevents pre-event reviews.
 *     Without it: a fan could review an event they booked but haven't attended,
 *     giving 5 stars just because they're excited.
 *
 * This is the same policy used by Airbnb (you can only review after checkout)
 * and BookMyShow (you can only rate after the event date).
 *
 * RATING AGGREGATION:
 * ────────────────────
 * After every write (create/update/delete), the review.model.js post-hooks
 * automatically recompute event.rating.{average, count, distribution}.
 * The service doesn't need to handle this — it's automatic.
 *
 * CACHE INVALIDATION:
 * ────────────────────
 * When a review is written, we invalidate the related events search cache
 * so the new rating appears in search results promptly.
 */

import * as reviewRepo from '../repositories/review.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import * as bookingRepo from '../repositories/booking.repository.js';
import { cacheDel, cacheFlushPattern } from '../utils/cache.js';
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('ReviewService');

// ─── Helper: Invalidate related caches after a review write ──────────────────
const invalidateReviewCaches = async (eventId) => {
  await Promise.all([
    cacheDel(`search:related:${eventId}`),
    cacheFlushPattern('search:events:*'), // Rating changed → search results stale
    cacheFlushPattern('search:trending:*'),
  ]);
};

// ─── Get Event Reviews ────────────────────────────────────────────────────────

/**
 * Returns paginated reviews for a specific event.
 *
 * @param {string} eventId
 * @param {object} queryParams - req.query
 * @param {string} userRole - For admin includeFlagged
 * @returns {{ reviews, meta }}
 */
export const getEventReviews = async (eventId, queryParams, userRole) => {
  const event = await eventRepo.findEventById(eventId);
  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);

  const { page, limit, skip } = parsePaginationParams(queryParams);

  const sort = queryParams.sort || 'newest';
  const includeFlagged = userRole === 'admin' && queryParams.includeFlagged === 'true';

  const { reviews, total } = await reviewRepo.findReviewsByEvent(eventId, {
    skip,
    limit,
    sort,
    includeFlagged,
  });

  return {
    reviews,
    meta: {
      ...buildPaginationMeta(total, page, limit),
      eventRating: {
        average: event.rating?.average || 0,
        count: event.rating?.count || 0,
        distribution: event.rating?.distribution || {},
      },
    },
  };
};

// ─── Create Review ────────────────────────────────────────────────────────────

/**
 * Creates a review after validating eligibility.
 *
 * @param {string} userId
 * @param {{ eventId, rating, title, body }} reviewData
 * @returns {Promise<Document>}
 */
export const createReview = async (userId, { eventId, rating, title, body }) => {
  // ── 1. Check event exists ────────────────────────────────────────────────
  const event = await eventRepo.findEventById(eventId);
  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);

  // ── 2. Check event has already happened ─────────────────────────────────
  if (new Date(event.date) > new Date()) {
    throw new ValidationError(
      'You can only review events that have already taken place.'
    );
  }

  // ── 3. Check the user has a confirmed booking for this event ─────────────
  const hasBooking = await bookingRepo.userHasBookingForEvent(userId, eventId);
  if (!hasBooking) {
    throw new ValidationError(MESSAGES.REVIEW.NOT_ELIGIBLE);
  }

  // ── 4. Find the qualifying booking (for the audit trail) ─────────────────
  const { bookings } = await bookingRepo.findBookingsByUser(userId, { limit: 100 });
  const qualifyingBooking = bookings.find(
    (b) => b.event?.toString() === eventId.toString() && b.status === 'confirmed'
  );

  // ── 5. Check for duplicate review ────────────────────────────────────────
  const existing = await reviewRepo.findUserReviewForEvent(userId, eventId);
  if (existing) {
    throw new ConflictError(MESSAGES.REVIEW.ALREADY_REVIEWED);
  }

  // ── 6. Create the review ─────────────────────────────────────────────────
  const review = await reviewRepo.createReview({
    user: userId,
    event: eventId,
    booking: qualifyingBooking?._id || qualifyingBooking?.id,
    rating,
    title: title || null,
    body,
  });

  // ── 7. Invalidate caches (rating changed) ────────────────────────────────
  await invalidateReviewCaches(eventId);

  logger.info(`[Review] User ${userId} reviewed event ${eventId} → ${rating}★`);
  return review;
};

// ─── Update Review ────────────────────────────────────────────────────────────

/**
 * Updates an existing review. Only the review owner can update.
 *
 * @param {string} reviewId
 * @param {string} userId
 * @param {object} updates - { rating?, title?, body? }
 * @returns {Promise<Document>}
 */
export const updateReview = async (reviewId, userId, updates) => {
  const review = await reviewRepo.findReviewById(reviewId);
  if (!review) throw new NotFoundError(MESSAGES.REVIEW.NOT_FOUND);

  // Only the review owner can edit it
  if (review.user._id.toString() !== userId.toString()) {
    throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
  }

  const updated = await reviewRepo.updateReviewById(reviewId, updates);

  await invalidateReviewCaches(review.event._id.toString());

  logger.info(`[Review] Review ${reviewId} updated by user ${userId}`);
  return updated;
};

// ─── Delete Review ────────────────────────────────────────────────────────────

/**
 * Deletes a review. Owner or admin only.
 *
 * @param {string} reviewId
 * @param {string} userId
 * @param {string} userRole
 */
export const deleteReview = async (reviewId, userId, userRole) => {
  const review = await reviewRepo.findReviewById(reviewId);
  if (!review) throw new NotFoundError(MESSAGES.REVIEW.NOT_FOUND);

  const isOwner = review.user._id.toString() === userId.toString();
  const isAdmin = userRole === 'admin';

  if (!isOwner && !isAdmin) {
    throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
  }

  const eventId = review.event._id.toString();
  await reviewRepo.deleteReviewById(reviewId);
  // post-delete hook on model recalculates event.rating automatically

  await invalidateReviewCaches(eventId);

  logger.info(`[Review] Review ${reviewId} deleted by ${userRole} ${userId}`);
};

// ─── Flag Review (admin moderation) ──────────────────────────────────────────

/**
 * Flags a review for moderation. Admin only.
 * Flagged reviews are hidden from public listing but not deleted.
 *
 * @param {string} reviewId
 * @param {string} adminId
 * @param {string} reason
 * @returns {Promise<Document>}
 */
export const flagReview = async (reviewId, adminId, reason) => {
  const review = await reviewRepo.findReviewById(reviewId);
  if (!review) throw new NotFoundError(MESSAGES.REVIEW.NOT_FOUND);

  if (review.isFlagged) {
    throw new ConflictError('This review is already flagged.');
  }

  const updated = await reviewRepo.setReviewFlagged(reviewId, true, reason, adminId);

  // Flagging hides the review → recalculate rating (excluded from average)
  const eventId = review.event._id?.toString() || review.event.toString();
  await invalidateReviewCaches(eventId);

  logger.info(`[Review] Review ${reviewId} flagged by admin ${adminId}: "${reason}"`);
  return updated;
};

// ─── Unflag Review (admin moderation) ────────────────────────────────────────

/**
 * Removes the flag from a review. Admin only.
 *
 * @param {string} reviewId
 * @param {string} adminId
 * @returns {Promise<Document>}
 */
export const unflagReview = async (reviewId, adminId) => {
  const review = await reviewRepo.findReviewById(reviewId);
  if (!review) throw new NotFoundError(MESSAGES.REVIEW.NOT_FOUND);

  if (!review.isFlagged) {
    throw new ValidationError('This review is not currently flagged.');
  }

  const updated = await reviewRepo.setReviewFlagged(reviewId, false);

  const eventId = review.event._id?.toString() || review.event.toString();
  await invalidateReviewCaches(eventId);

  logger.info(`[Review] Review ${reviewId} unflagged by admin ${adminId}`);
  return updated;
};

// ─── Admin: Flagged Review Queue ──────────────────────────────────────────────

/**
 * Returns all flagged reviews for admin moderation.
 *
 * @param {object} queryParams
 * @returns {{ reviews, meta }}
 */
export const getFlaggedReviews = async (queryParams) => {
  const { page, limit, skip } = parsePaginationParams(queryParams);
  const { reviews, total } = await reviewRepo.findFlaggedReviews({ skip, limit });
  return { reviews, meta: buildPaginationMeta(total, page, limit) };
};
