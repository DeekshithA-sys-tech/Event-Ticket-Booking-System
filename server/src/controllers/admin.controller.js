/**
 * @file admin.controller.js
 * @description HTTP handlers for Admin platform management endpoints.
 *
 * ALL ROUTES BEHIND adminOnly middleware — enforced at the router level.
 * Controllers only handle request/response — zero business logic here.
 *
 * IP ADDRESS EXTRACTION:
 * ──────────────────────
 * We pass req.ip and req.get('user-agent') to the service for audit logging.
 * req.ip works correctly because app.js sets `trust proxy = 1` in production.
 */

import * as adminService from '../services/admin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { ValidationError } from '../utils/ApiError.js';

/**
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Platform administration — requires admin role
 */

// ─── 1. Platform Dashboard ────────────────────────────────────────────────────

/**
 * @swagger
 * /admin/dashboard:
 *   get:
 *     tags: [Admin]
 *     summary: Get aggregated platform dashboard statistics
 *     description: |
 *       Returns a high-level overview of the entire platform:
 *       users, events, bookings, revenue, and moderation stats.
 *       Runs 12 DB queries in parallel via Promise.all.
 *     responses:
 *       200:
 *         description: Dashboard fetched successfully
 */
export const getDashboard = asyncHandler(async (_req, res) => {
  const stats = await adminService.getAdminDashboard();

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.DASHBOARD_FETCHED, stats));
});

// ─── 2. Event Management ──────────────────────────────────────────────────────

/**
 * @swagger
 * /admin/events:
 *   get:
 *     tags: [Admin]
 *     summary: List all events platform-wide with filters
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [draft, published, cancelled, completed]
 *       - name: organizer
 *         in: query
 *         description: Filter by organizer user ID
 *         schema:
 *           type: string
 *       - name: city
 *         in: query
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Events fetched successfully
 */
export const listEvents = asyncHandler(async (req, res) => {
  const { events, meta } = await adminService.listAllEvents(req.query);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.LIST_FETCHED, events, meta));
});

/**
 * @swagger
 * /admin/events/{eventId}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Force-change the status of any event (admin override)
 *     description: |
 *       Admin can change any event's status regardless of who owns it.
 *       Cannot set status to 'completed' — that is system-managed.
 *     parameters:
 *       - name: eventId
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [draft, published, cancelled]
 *               reason:
 *                 type: string
 *                 example: "Venue unavailable — force cancelling event"
 *     responses:
 *       200:
 *         description: Event status updated
 *       400:
 *         description: Cannot set status to 'completed'
 *       404:
 *         description: Event not found
 */
export const changeEventStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;

  if (!status) throw new ValidationError('status is required in request body.');

  const event = await adminService.adminChangeEventStatus(
    req.params.eventId,
    status,
    reason,
    req.user
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.EVENT_STATUS_UPDATED, event));
});

// ─── 3. Booking Management ────────────────────────────────────────────────────

/**
 * @swagger
 * /admin/bookings:
 *   get:
 *     tags: [Admin]
 *     summary: List all bookings platform-wide with filters
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [confirmed, cancelled]
 *       - name: event
 *         in: query
 *         description: Filter by event ObjectId
 *         schema:
 *           type: string
 *       - name: user
 *         in: query
 *         description: Filter by user ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bookings fetched successfully
 */
export const listBookings = asyncHandler(async (req, res) => {
  const { bookings, meta } = await adminService.listAllBookings(req.query);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.LIST_FETCHED, bookings, meta));
});

/**
 * @swagger
 * /admin/bookings/{bookingId}/cancel:
 *   post:
 *     tags: [Admin]
 *     summary: Force-cancel any booking and release its seats (admin override)
 *     description: |
 *       Admin can cancel any user's booking regardless of event date.
 *       Seats are released atomically via Mongoose transaction.
 *       A cancellation email is sent to the customer.
 *       The action is recorded in the audit log.
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: TKT-20260715-X7K2M
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Fraudulent booking detected"
 *     responses:
 *       200:
 *         description: Booking force-cancelled successfully
 *       400:
 *         description: Booking is already cancelled
 *       404:
 *         description: Booking not found
 */
export const forceCancelBooking = asyncHandler(async (req, res) => {
  await adminService.adminForceCancelBooking(
    req.params.bookingId,
    req.body?.reason,
    req.user
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.BOOKING_CANCELLED));
});

// ─── 4. Review Moderation ─────────────────────────────────────────────────────

/**
 * @swagger
 * /admin/reviews:
 *   get:
 *     tags: [Admin]
 *     summary: List all reviews platform-wide with moderation filters
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: isFlagged
 *         in: query
 *         description: Filter by flagged status
 *         schema:
 *           type: boolean
 *       - name: event
 *         in: query
 *         description: Filter by event ObjectId
 *         schema:
 *           type: string
 *       - name: rating
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *     responses:
 *       200:
 *         description: Reviews fetched successfully
 */
export const listReviews = asyncHandler(async (req, res) => {
  const { reviews, meta } = await adminService.listAllReviews(req.query);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.LIST_FETCHED, reviews, meta));
});

// ─── 5. Audit Logs ────────────────────────────────────────────────────────────

/**
 * @swagger
 * /admin/audit-logs:
 *   get:
 *     tags: [Admin]
 *     summary: Get paginated admin audit trail
 *     description: |
 *       Returns an immutable audit trail of all admin actions.
 *       Can be filtered by action type, target model, or admin ID.
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: action
 *         in: query
 *         description: Filter by action type (e.g. user.suspend, event.status_change)
 *         schema:
 *           type: string
 *       - name: targetModel
 *         in: query
 *         schema:
 *           type: string
 *           enum: [User, Event, Booking, Review]
 *       - name: admin
 *         in: query
 *         description: Filter by admin user ObjectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit logs fetched successfully
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const { logs, meta } = await adminService.getAuditLogs(req.query);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.AUDIT_LOGS_FETCHED, logs, meta));
});

// ─── 6. System Health ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /admin/health:
 *   get:
 *     tags: [Admin]
 *     summary: Get detailed system health status (admin enriched view)
 *     description: |
 *       Returns health status of all system components:
 *       MongoDB ping latency, Redis ping latency, BullMQ queue depth,
 *       and Node.js process memory/uptime.
 *       Unlike the public /health endpoint, this includes sensitive details.
 *     responses:
 *       200:
 *         description: Health status fetched
 */
export const getSystemHealth = asyncHandler(async (_req, res) => {
  const health = await adminService.getSystemHealth();

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.HEALTH_FETCHED, health));
});
