/**
 * @file analytics.service.js
 * @description Analytics Dashboard business logic with Redis caching.
 *
 * CACHING STRATEGY:
 * ──────────────────
 * Analytics data is expensive to compute (multi-stage aggregations across
 * multiple collections), but it doesn't need to be real-time.
 *
 * A 10-minute delay in seeing "you made ₹5,000 more today" is perfectly
 * acceptable. So we cache aggressively.
 *
 * Cache key namespace: analytics:<organizerId|platform>:<endpoint>
 *   analytics:org-123:overview          TTL: 10 min
 *   analytics:org-123:timeline:30       TTL: 10 min
 *   analytics:platform:overview         TTL: 15 min (admin, rarer invalidation)
 *   analytics:platform:stats            TTL: 15 min
 *
 * AUTHORISATION DESIGN:
 * ──────────────────────
 * Organizers can only see their own data.
 * Admins can see all data (platform-wide mode + any organizer's data).
 *
 * The service enforces this:
 *   - Organizer calls → always passes their own ID → scoped pipelines
 *   - Admin calls without organizerId → platform-wide pipelines
 *   - Admin calls with organizerId → scoped to that organizer's data
 */

import * as analyticsRepo from '../repositories/analytics.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import { withCache } from '../utils/cache.js';
import { NotFoundError, AuthorizationError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('AnalyticsService');

const TTL = {
  ORGANIZER: 10 * 60,   // 10 minutes
  ADMIN:     15 * 60,   // 15 minutes
};

// ─── Overview ─────────────────────────────────────────────────────────────────

/**
 * Dashboard overview metrics.
 *
 * @param {string} userId
 * @param {string} userRole
 * @param {string|null} targetOrganizerId - Admin can pass any organizer's ID
 * @returns {Promise<object>}
 */
export const getOverview = async (userId, userRole, targetOrganizerId = null) => {
  let scopeId;

  if (userRole === 'admin') {
    scopeId = targetOrganizerId || null; // null = platform-wide
  } else {
    scopeId = userId.toString(); // Organizers always see their own data
  }

  const cacheKey = scopeId
    ? `analytics:org-${scopeId}:overview`
    : 'analytics:platform:overview';

  const ttl = scopeId ? TTL.ORGANIZER : TTL.ADMIN;

  const data = await withCache(
    cacheKey,
    () => analyticsRepo.getOverview(scopeId),
    ttl
  );

  logger.info(`[Analytics] Overview fetched — scope: ${scopeId || 'platform'}`);
  return data;
};

// ─── Per-Event Analytics ──────────────────────────────────────────────────────

/**
 * Deep-dive analytics for a single event.
 *
 * Organizer can only view analytics for their own events.
 * Admin can view any event's analytics.
 *
 * @param {string} eventId
 * @param {string} userId
 * @param {string} userRole
 * @returns {Promise<object>}
 */
export const getEventAnalytics = async (eventId, userId, userRole) => {
  // Authorisation: verify the organizer owns this event
  if (userRole !== 'admin') {
    const event = await eventRepo.findEventByIdAndOrganizer(eventId, userId);
    if (!event) {
      throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
    }
  }

  const cacheKey = `analytics:event:${eventId}`;

  const data = await withCache(
    cacheKey,
    () => analyticsRepo.getEventAnalytics(eventId),
    TTL.ORGANIZER
  );

  if (!data) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);

  return data;
};

// ─── Booking Timeline ─────────────────────────────────────────────────────────

/**
 * Daily booking volume chart data.
 *
 * @param {string} userId
 * @param {string} userRole
 * @param {object} queryParams - { days, organizerId }
 * @returns {Promise<object[]>}
 */
export const getBookingTimeline = async (userId, userRole, queryParams) => {
  const days = Math.min(90, Math.max(7, parseInt(queryParams.days, 10) || 30));

  let scopeId;
  if (userRole === 'admin') {
    scopeId = queryParams.organizerId || null;
  } else {
    scopeId = userId.toString();
  }

  const cacheKey = scopeId
    ? `analytics:org-${scopeId}:timeline:${days}`
    : `analytics:platform:timeline:${days}`;

  return withCache(
    cacheKey,
    () => analyticsRepo.getBookingTimeline(scopeId, days),
    TTL.ORGANIZER
  );
};

// ─── Revenue Breakdown ────────────────────────────────────────────────────────

/**
 * Revenue breakdown by event and category.
 *
 * @param {string} userId
 * @param {string} userRole
 * @param {object} queryParams
 * @returns {Promise<{ byEvent, byCategory }>}
 */
export const getRevenueBreakdown = async (userId, userRole, queryParams) => {
  const topN = Math.min(20, Math.max(5, parseInt(queryParams.top, 10) || 10));

  let scopeId;
  if (userRole === 'admin') {
    scopeId = queryParams.organizerId || null;
  } else {
    scopeId = userId.toString();
  }

  const cacheKey = scopeId
    ? `analytics:org-${scopeId}:revenue:${topN}`
    : `analytics:platform:revenue:${topN}`;

  return withCache(
    cacheKey,
    () => analyticsRepo.getRevenueBreakdown(scopeId, topN),
    TTL.ORGANIZER
  );
};

// ─── Review Summary ───────────────────────────────────────────────────────────

/**
 * Rating trends and review summary.
 *
 * @param {string} userId
 * @param {string} userRole
 * @param {object} queryParams
 * @returns {Promise<object>}
 */
export const getReviewSummary = async (userId, userRole, queryParams) => {
  let scopeId;
  if (userRole === 'admin') {
    scopeId = queryParams.organizerId || null;
  } else {
    scopeId = userId.toString();
  }

  const cacheKey = scopeId
    ? `analytics:org-${scopeId}:reviews`
    : 'analytics:platform:reviews';

  return withCache(
    cacheKey,
    () => analyticsRepo.getReviewSummary(scopeId),
    TTL.ORGANIZER
  );
};

// ─── Admin: Platform Stats ────────────────────────────────────────────────────

/**
 * Platform-wide admin-only statistics.
 * Users, revenue, cancellation rate.
 *
 * @returns {Promise<object>}
 */
export const getPlatformStats = async () => {
  return withCache(
    'analytics:platform:stats',
    () => analyticsRepo.getPlatformStats(),
    TTL.ADMIN
  );
};
