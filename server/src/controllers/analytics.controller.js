/**
 * @file analytics.controller.js
 * @description Analytics Dashboard Controller with Redis caching and role-scoped pipelines.
 */

import * as analyticsRepo from '../repositories/analytics.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import { withCache } from '../utils/cache.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { NotFoundError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('AnalyticsController');

const TTL = {
  ORGANIZER: 10 * 60,   // 10 minutes
  ADMIN:     15 * 60,   // 15 minutes
};

// ─── Controller Handlers ───────────────────────────────────────────────────────

export const getOverview = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;
  const targetOrganizerId = req.query.organizerId || null;

  let scopeId;
  if (userRole === 'admin') {
    scopeId = targetOrganizerId || null; // null = platform-wide
  } else {
    scopeId = userId.toString(); // Organizers see their own data
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

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Analytics overview fetched.', data));
});

export const getEventAnalytics = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

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

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Event analytics fetched.', data));
});

export const getBookingTimeline = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;
  const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));

  let scopeId;
  if (userRole === 'admin') {
    scopeId = req.query.organizerId || null;
  } else {
    scopeId = userId.toString();
  }

  const cacheKey = scopeId
    ? `analytics:org-${scopeId}:timeline:${days}`
    : `analytics:platform:timeline:${days}`;

  const data = await withCache(
    cacheKey,
    () => analyticsRepo.getBookingTimeline(scopeId, days),
    TTL.ORGANIZER
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Booking timeline fetched.', data));
});

export const getRevenueBreakdown = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;
  const topN = Math.min(20, Math.max(5, parseInt(req.query.top, 10) || 10));

  let scopeId;
  if (userRole === 'admin') {
    scopeId = req.query.organizerId || null;
  } else {
    scopeId = userId.toString();
  }

  const cacheKey = scopeId
    ? `analytics:org-${scopeId}:revenue:${topN}`
    : `analytics:platform:revenue:${topN}`;

  const data = await withCache(
    cacheKey,
    () => analyticsRepo.getRevenueBreakdown(scopeId, topN),
    TTL.ORGANIZER
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Revenue breakdown fetched.', data));
});

export const getReviewSummary = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;

  let scopeId;
  if (userRole === 'admin') {
    scopeId = req.query.organizerId || null;
  } else {
    scopeId = userId.toString();
  }

  const cacheKey = scopeId
    ? `analytics:org-${scopeId}:reviews`
    : 'analytics:platform:reviews';

  const data = await withCache(
    cacheKey,
    () => analyticsRepo.getReviewSummary(scopeId),
    TTL.ORGANIZER
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Review summary fetched.', data));
});

export const getPlatformStats = asyncHandler(async (_req, res) => {
  const data = await withCache(
    'analytics:platform:stats',
    () => analyticsRepo.getPlatformStats(),
    TTL.ADMIN
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Platform stats fetched.', data));
});
