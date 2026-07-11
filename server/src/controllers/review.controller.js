/**
 * @file review.controller.js
 * @description HTTP handlers for Review endpoints.
 */

import * as reviewService from '../services/review.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';

/**
 * @swagger
 * tags:
 *   - name: Reviews
 *     description: Event reviews, ratings, and moderation
 */

// ─── Get Reviews for an Event ─────────────────────────────────────────────────

/**
 * @swagger
 * /events/{eventId}/reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: Get paginated reviews for an event
 *     security: []
 *     parameters:
 *       - name: eventId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: sort
 *         in: query
 *         schema:
 *           type: string
 *           enum: [newest, oldest, highest, lowest]
 *           default: newest
 *       - name: includeFlagged
 *         in: query
 *         schema:
 *           type: boolean
 *         description: Admin only — include flagged reviews
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Reviews fetched with rating aggregation in meta
 */
export const getEventReviews = asyncHandler(async (req, res) => {
  const { reviews, meta } = await reviewService.getEventReviews(
    req.params.eventId,
    req.query,
    req.user?.role // Optional — no auth required, but admin gets extra data
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.LIST_FETCHED, reviews, meta));
});

// ─── Create Review ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Submit a review for an event
 *     description: |
 *       Eligibility requirements:
 *       1. Must have a confirmed booking for the event
 *       2. Event must have already taken place
 *       3. Cannot review the same event twice
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventId, rating, body]
 *             properties:
 *               eventId:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               title:
 *                 type: string
 *                 maxLength: 150
 *               body:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 2000
 *     responses:
 *       201:
 *         description: Review created successfully
 *       400:
 *         description: Eligibility check failed or event hasn't happened yet
 *       409:
 *         description: Already reviewed this event
 */
export const createReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user._id, req.body);

  return res
    .status(HTTP_STATUS.CREATED)
    .json(new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.REVIEW.CREATED, review));
});

// ─── Update Review ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /reviews/{reviewId}:
 *   patch:
 *     tags: [Reviews]
 *     summary: Update your own review (rating, title, body)
 *     parameters:
 *       - name: reviewId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *     responses:
 *       200:
 *         description: Review updated (isEdited=true, editedAt set)
 *       403:
 *         description: Cannot edit another user's review
 */
export const updateReview = asyncHandler(async (req, res) => {
  const review = await reviewService.updateReview(
    req.params.reviewId,
    req.user._id,
    req.body
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.UPDATED, review));
});

// ─── Delete Review ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /reviews/{reviewId}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete a review (owner or admin)
 *     parameters:
 *       - name: reviewId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review deleted, event rating recalculated
 *       403:
 *         description: Cannot delete another user's review
 */
export const deleteReview = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(req.params.reviewId, req.user._id, req.user.role);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.DELETED));
});

// ─── Flag Review (admin) ──────────────────────────────────────────────────────

/**
 * @swagger
 * /reviews/{reviewId}/flag:
 *   post:
 *     tags: [Reviews]
 *     summary: Flag a review for moderation (admin only)
 *     description: |
 *       Flagged reviews are hidden from public listing but not deleted.
 *       The review remains in the DB for audit/legal purposes.
 *     parameters:
 *       - name: reviewId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 5
 *     responses:
 *       200:
 *         description: Review flagged — excluded from public listing and rating
 */
export const flagReview = asyncHandler(async (req, res) => {
  const review = await reviewService.flagReview(
    req.params.reviewId,
    req.user._id,
    req.body.reason
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.FLAGGED, review));
});

// ─── Unflag Review (admin) ────────────────────────────────────────────────────

/**
 * @swagger
 * /reviews/{reviewId}/unflag:
 *   post:
 *     tags: [Reviews]
 *     summary: Remove the flag from a review (admin only)
 *     parameters:
 *       - name: reviewId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review restored to public listing
 */
export const unflagReview = asyncHandler(async (req, res) => {
  const review = await reviewService.unflagReview(req.params.reviewId, req.user._id);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.UNFLAGGED, review));
});

// ─── Admin: Flagged Review Queue ──────────────────────────────────────────────

/**
 * @swagger
 * /reviews/flagged:
 *   get:
 *     tags: [Reviews]
 *     summary: Get all flagged reviews for moderation (admin only)
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Flagged review queue fetched
 */
export const getFlaggedReviews = asyncHandler(async (req, res) => {
  const { reviews, meta } = await reviewService.getFlaggedReviews(req.query);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Flagged reviews fetched.', reviews, meta));
});
