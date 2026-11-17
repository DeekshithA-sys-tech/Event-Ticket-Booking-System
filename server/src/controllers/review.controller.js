/**
 * @file review.controller.js
 * @description Review & Ratings Controller with verified booking eligibility check and cache invalidation.
 */

import * as reviewRepo from '../repositories/review.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import * as bookingRepo from '../repositories/booking.repository.js';
import { cacheDel, cacheFlushPattern } from '../utils/cache.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('ReviewController');

const invalidateReviewCaches = async (eventId) => {
  await Promise.all([
    cacheDel(`search:related:${eventId}`),
    cacheFlushPattern('search:events:*'),
    cacheFlushPattern('search:trending:*'),
  ]);
};

// ─── Controller Handlers ───────────────────────────────────────────────────────

export const getEventReviews = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const event = await eventRepo.findEventById(eventId);

  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);

  const { page, limit, skip } = parsePaginationParams(req.query);
  const sort = req.query.sort || 'newest';
  const includeFlagged = req.user?.role === 'admin' && req.query.includeFlagged === 'true';

  const { reviews, total } = await reviewRepo.findReviewsByEvent(eventId, {
    skip,
    limit,
    sort,
    includeFlagged,
  });

  const meta = {
    ...buildPaginationMeta(total, page, limit),
    eventRating: {
      average: event.rating?.average || 0,
      count: event.rating?.count || 0,
      distribution: event.rating?.distribution || {},
    },
  };

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.LIST_FETCHED, reviews, meta));
});

export const createReview = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { eventId, rating, title, body } = req.body;

  // 1. Check event exists
  const event = await eventRepo.findEventById(eventId);
  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);

  // 2. Check event has already happened
  if (new Date(event.date) > new Date()) {
    throw new ValidationError(
      'You can only review events that have already taken place.'
    );
  }

  // 3. Check the user has a confirmed booking for this event
  const hasBooking = await bookingRepo.userHasBookingForEvent(userId, eventId);
  if (!hasBooking) {
    throw new ValidationError(MESSAGES.REVIEW.NOT_ELIGIBLE);
  }

  // 4. Find the qualifying booking
  const { bookings } = await bookingRepo.findBookingsByUser(userId, { limit: 100 });
  const qualifyingBooking = bookings.find(
    (b) => b.event?.toString() === eventId.toString() && b.status === 'confirmed'
  );

  // 5. Check for duplicate review
  const existing = await reviewRepo.findUserReviewForEvent(userId, eventId);
  if (existing) {
    throw new ConflictError(MESSAGES.REVIEW.ALREADY_REVIEWED);
  }

  // 6. Create the review
  const review = await reviewRepo.createReview({
    user: userId,
    event: eventId,
    booking: qualifyingBooking?._id || qualifyingBooking?.id,
    rating,
    title: title || null,
    body,
  });

  // 7. Invalidate caches
  await invalidateReviewCaches(eventId);

  logger.info(`[Review] User ${userId} reviewed event ${eventId} → ${rating}★`);

  return res
    .status(HTTP_STATUS.CREATED)
    .json(new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.REVIEW.CREATED, review));
});

export const updateReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.user._id;

  const review = await reviewRepo.findReviewById(reviewId);
  if (!review) throw new NotFoundError(MESSAGES.REVIEW.NOT_FOUND);

  if (review.user._id.toString() !== userId.toString()) {
    throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
  }

  const updated = await reviewRepo.updateReviewById(reviewId, req.body);
  await invalidateReviewCaches(review.event._id.toString());

  logger.info(`[Review] Review ${reviewId} updated by user ${userId}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.UPDATED, updated));
});

export const deleteReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  const review = await reviewRepo.findReviewById(reviewId);
  if (!review) throw new NotFoundError(MESSAGES.REVIEW.NOT_FOUND);

  const isOwner = review.user._id.toString() === userId.toString();
  const isAdmin = userRole === 'admin';

  if (!isOwner && !isAdmin) {
    throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
  }

  const eventId = review.event._id.toString();
  await reviewRepo.deleteReviewById(reviewId);

  await invalidateReviewCaches(eventId);
  logger.info(`[Review] Review ${reviewId} deleted by ${userRole} ${userId}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.DELETED));
});

export const flagReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const adminId = req.user._id;
  const { reason } = req.body;

  const review = await reviewRepo.findReviewById(reviewId);
  if (!review) throw new NotFoundError(MESSAGES.REVIEW.NOT_FOUND);

  if (review.isFlagged) {
    throw new ConflictError('This review is already flagged.');
  }

  const updated = await reviewRepo.setReviewFlagged(reviewId, true, reason, adminId);
  const eventId = review.event._id?.toString() || review.event.toString();
  await invalidateReviewCaches(eventId);

  logger.info(`[Review] Review ${reviewId} flagged by admin ${adminId}: "${reason}"`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.FLAGGED, updated));
});

export const unflagReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const adminId = req.user._id;

  const review = await reviewRepo.findReviewById(reviewId);
  if (!review) throw new NotFoundError(MESSAGES.REVIEW.NOT_FOUND);

  if (!review.isFlagged) {
    throw new ValidationError('This review is not currently flagged.');
  }

  const updated = await reviewRepo.setReviewFlagged(reviewId, false);
  const eventId = review.event._id?.toString() || review.event.toString();
  await invalidateReviewCaches(eventId);

  logger.info(`[Review] Review ${reviewId} unflagged by admin ${adminId}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.UNFLAGGED, updated));
});

export const getFlaggedReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePaginationParams(req.query);
  const { reviews, total } = await reviewRepo.findFlaggedReviews({ skip, limit });
  const meta = buildPaginationMeta(total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Flagged reviews fetched.', reviews, meta));
});
