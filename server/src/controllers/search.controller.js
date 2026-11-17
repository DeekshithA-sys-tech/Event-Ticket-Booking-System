/**
 * @file search.controller.js
 * @description Search & Discovery Controller with Redis caching.
 */

import * as searchRepo from '../repositories/search.repository.js';
import { withCache } from '../utils/cache.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { NotFoundError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';

// Cache TTLs (seconds)
const TTL = {
  EVENTS: 2 * 60,       // 2 minutes — new events may publish
  TRENDING: 5 * 60,     // 5 minutes — approximate metric
  CITIES: 60 * 60,      // 60 minutes — rarely changes
  CATEGORIES: 10 * 60,  // 10 minutes — changes on publish/cancel
  RELATED: 10 * 60,     // 10 minutes — changes on new event
  SEATS: 30,            // 30 seconds — near-real-time
};

const buildSearchCacheKey = (params) => {
  const parts = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`);
  return `search:events:${parts.join('|')}`;
};

// ─── Controller Handlers ───────────────────────────────────────────────────────

export const searchEvents = asyncHandler(async (req, res) => {
  const queryParams = {
    ...req.query,
    search: req.query.q || req.query.search,
  };

  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams, {
    defaultSort: 'date',
  });

  const filters = {
    search: queryParams.search,
    city: queryParams.city,
    categorySlug: queryParams.category,
    minPrice: queryParams.minPrice,
    maxPrice: queryParams.maxPrice,
    startDate: queryParams.startDate,
    endDate: queryParams.endDate,
    hasAvailableSeats: queryParams.hasAvailableSeats,
  };

  const cacheKey = buildSearchCacheKey({
    ...filters,
    page,
    limit,
    sort: queryParams.sort || 'date',
  });

  const result = await withCache(
    cacheKey,
    () => searchRepo.searchEvents(filters, { skip, limit, sortObj }),
    TTL.EVENTS
  );

  const meta = buildPaginationMeta(result.total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Search results fetched successfully.', result.events, meta));
});

export const getTrendingEvents = asyncHandler(async (req, res) => {
  const days = req.query.days;
  const limit = req.query.limit;

  const validDays = Math.min(30, Math.max(1, parseInt(days, 10) || 7));
  const validLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 10));

  const events = await withCache(
    `search:trending:${validDays}:${validLimit}`,
    () => searchRepo.getTrendingEvents(validDays, validLimit),
    TTL.TRENDING
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Trending events fetched successfully.', events));
});

export const getCities = asyncHandler(async (req, res) => {
  const query = req.query.q || '';
  const limit = req.query.limit || 10;

  const validLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 10));
  const cacheKey = query
    ? `search:cities:${query.toLowerCase().trim()}:${validLimit}`
    : `search:cities:all:${validLimit}`;

  const cities = await withCache(
    cacheKey,
    () => searchRepo.getDistinctCities(query, validLimit),
    TTL.CITIES
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Cities fetched successfully.', cities));
});

export const getCategoryCounts = asyncHandler(async (_req, res) => {
  const categories = await withCache(
    'search:categories:counts',
    () => searchRepo.getCategoryEventCounts(),
    TTL.CATEGORIES
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Category counts fetched successfully.', categories));
});

export const getRelatedEvents = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const limit = req.query.limit;

  const Event = (await import('../models/event.model.js')).default;
  const event = await Event.findById(eventId).select('category date status').lean();

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  const validLimit = Math.min(10, Math.max(1, parseInt(limit, 10) || 4));

  const events = await withCache(
    `search:related:${eventId}:${validLimit}`,
    () => searchRepo.getRelatedEvents(eventId, event.category.toString(), event.date, validLimit),
    TTL.RELATED
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Related events fetched successfully.', events));
});

export const getSeatAvailability = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const availability = await withCache(
    `search:seats:${eventId}`,
    () => searchRepo.getSeatAvailability(eventId),
    TTL.SEATS
  );

  if (!availability) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  return res
    .status(HTTP_STATUS.OK)
    .json(
      new ApiResponse(HTTP_STATUS.OK, 'Seat availability fetched successfully.', availability)
    );
});
