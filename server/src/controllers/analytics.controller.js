/**
 * @file analytics.controller.js
 * @description HTTP handlers for the Analytics Dashboard.
 *
 * ACCESS:
 *   All analytics endpoints require authentication.
 *   Organizers see their own data only.
 *   Admins see platform-wide data (or any organizer's data via ?organizerId=).
 */

import * as analyticsService from '../services/analytics.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

/**
 * @swagger
 * tags:
 *   - name: Analytics
 *     description: Organizer dashboard and platform analytics (admin)
 */

// ─── Overview ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /analytics/overview:
 *   get:
 *     tags: [Analytics]
 *     summary: Get dashboard overview (revenue, bookings, events, rating)
 *     description: |
 *       **Organizer**: Returns their own events' metrics.
 *       **Admin**: Returns platform-wide metrics, or a specific organizer's
 *       metrics when `?organizerId=` is passed.
 *       Cached for 10 minutes.
 *     parameters:
 *       - name: organizerId
 *         in: query
 *         schema:
 *           type: string
 *         description: Admin only — scope to a specific organizer
 *     responses:
 *       200:
 *         description: Overview metrics
 */
export const getOverview = asyncHandler(async (req, res) => {
  const data = await analyticsService.getOverview(
    req.user._id,
    req.user.role,
    req.query.organizerId
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Analytics overview fetched.', data));
});

// ─── Per-Event Analytics ──────────────────────────────────────────────────────

/**
 * @swagger
 * /analytics/events/{eventId}:
 *   get:
 *     tags: [Analytics]
 *     summary: Deep-dive analytics for a single event
 *     description: |
 *       Returns: occupancy rate, revenue, 30-day booking timeline, rating distribution.
 *       Organizers can only access their own events.
 *     parameters:
 *       - name: eventId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Event analytics data
 *       403:
 *         description: Organizer tried to view another's event analytics
 */
export const getEventAnalytics = asyncHandler(async (req, res) => {
  const data = await analyticsService.getEventAnalytics(
    req.params.eventId,
    req.user._id,
    req.user.role
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Event analytics fetched.', data));
});

// ─── Booking Timeline ─────────────────────────────────────────────────────────

/**
 * @swagger
 * /analytics/bookings/timeline:
 *   get:
 *     tags: [Analytics]
 *     summary: Daily booking volume chart data
 *     description: Returns one data point per day. Missing days filled with zeros.
 *     parameters:
 *       - name: days
 *         in: query
 *         schema:
 *           type: integer
 *           default: 30
 *           minimum: 7
 *           maximum: 90
 *         description: Lookback window in days
 *       - name: organizerId
 *         in: query
 *         schema:
 *           type: string
 *         description: Admin only — scope to a specific organizer
 *     responses:
 *       200:
 *         description: Array of daily { date, bookings, revenue, seatsBooked, peakHour }
 */
export const getBookingTimeline = asyncHandler(async (req, res) => {
  const data = await analyticsService.getBookingTimeline(
    req.user._id,
    req.user.role,
    req.query
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Booking timeline fetched.', data));
});

// ─── Revenue Breakdown ────────────────────────────────────────────────────────

/**
 * @swagger
 * /analytics/revenue/breakdown:
 *   get:
 *     tags: [Analytics]
 *     summary: Revenue breakdown by event and by category
 *     parameters:
 *       - name: top
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 20
 *         description: Number of top events to include
 *       - name: organizerId
 *         in: query
 *         schema:
 *           type: string
 *         description: Admin only
 *     responses:
 *       200:
 *         description: "{ byEvent: [...], byCategory: [...] }"
 */
export const getRevenueBreakdown = asyncHandler(async (req, res) => {
  const data = await analyticsService.getRevenueBreakdown(
    req.user._id,
    req.user.role,
    req.query
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Revenue breakdown fetched.', data));
});

// ─── Review Summary ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /analytics/reviews/summary:
 *   get:
 *     tags: [Analytics]
 *     summary: Rating trends and review summary (last 12 months)
 *     description: |
 *       Returns:
 *       - `monthlyTrend`: avg rating + review count per month
 *       - `topRatedEvents`: top 5 best-rated events
 *       - `recentReviews`: 5 most recent reviews
 *     parameters:
 *       - name: organizerId
 *         in: query
 *         schema:
 *           type: string
 *         description: Admin only
 *     responses:
 *       200:
 *         description: Rating trends and recent reviews
 */
export const getReviewSummary = asyncHandler(async (req, res) => {
  const data = await analyticsService.getReviewSummary(
    req.user._id,
    req.user.role,
    req.query
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Review summary fetched.', data));
});

// ─── Admin: Platform Stats ────────────────────────────────────────────────────

/**
 * @swagger
 * /analytics/platform/stats:
 *   get:
 *     tags: [Analytics]
 *     summary: Platform-wide stats (admin only)
 *     description: |
 *       Returns user counts by role, total booking/revenue stats,
 *       and the platform-wide cancellation rate.
 *       Cached for 15 minutes.
 *     responses:
 *       200:
 *         description: Platform metrics
 *       403:
 *         description: Admin access required
 */
export const getPlatformStats = asyncHandler(async (req, res) => {
  const data = await analyticsService.getPlatformStats();

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Platform stats fetched.', data));
});
