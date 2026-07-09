/**
 * @file search.service.js
 * @description Search & Discovery business logic with Redis caching.
 *
 * CACHE KEY STRATEGY:
 * --------------------
 * search:events:<queryHash>  → Paginated search results (TTL: 2 min)
 *                               Short TTL because new events publish frequently
 *
 * search:trending:<days>     → Trending events (TTL: 5 min)
 *                               Trending data is approximate — staleness OK
 *
 * search:cities              → All city names (TTL: 60 min)
 *                               Cities rarely change
 *
 * search:categories:counts   → Category counts (TTL: 10 min)
 *                               Changes when events are published/cancelled
 *
 * search:related:<eventId>   → Related events (TTL: 10 min)
 *                               Changes when new same-category events publish
 *
 * search:seats:<eventId>     → Seat availability (TTL: 30 sec)
 *                               Changes frequently during active booking
 *                               Short TTL for near-real-time accuracy
 *
 * CACHE KEY FOR SEARCH QUERIES:
 * ------------------------------
 * Query params produce variable-length URLs. We build a deterministic cache
 * key by sorting the params alphabetically and concatenating them:
 *
 *   { city: 'Mumbai', sort: '-date', page: '1' }
 *   → "search:events:city=Mumbai|page=1|sort=-date"
 *
 * Sorting params ensures the same logical query always maps to the same key,
 * regardless of the order params were passed in the URL.
 */

import * as searchRepo from '../repositories/search.repository.js';
import { withCache } from '../utils/cache.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { NotFoundError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('SearchService');

// Cache TTLs (seconds)
const TTL = {
  EVENTS: 2 * 60,       // 2 minutes — new events may publish
  TRENDING: 5 * 60,     // 5 minutes — approximate metric
  CITIES: 60 * 60,      // 60 minutes — rarely changes
  CATEGORIES: 10 * 60,  // 10 minutes — changes on publish/cancel
  RELATED: 10 * 60,     // 10 minutes — changes on new event
  SEATS: 30,            // 30 seconds — near-real-time
};

// ─── Cache Key Builder ────────────────────────────────────────────────────────

/**
 * Builds a deterministic cache key from query params.
 * Params are sorted alphabetically to ensure the same query → same key.
 *
 * @param {object} params - Key-value params
 * @returns {string}
 */
const buildSearchCacheKey = (params) => {
  const parts = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`);
  return `search:events:${parts.join('|')}`;
};

// ─── Full-Text Event Search ───────────────────────────────────────────────────

/**
 * Searches published events with multiple optional filters.
 * Results are cached per unique query combination.
 *
 * @param {object} queryParams - req.query
 * @returns {{ events, meta }}
 */
export const searchEvents = async (queryParams) => {
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

  return {
    events: result.events,
    meta: buildPaginationMeta(result.total, page, limit),
  };
};

// ─── Trending Events ──────────────────────────────────────────────────────────

/**
 * Returns trending events (most booked in last N days).
 * Cached for 5 minutes — approximate metric.
 *
 * @param {number} [days=7]
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
export const getTrendingEvents = async (days = 7, limit = 10) => {
  const validDays = Math.min(30, Math.max(1, parseInt(days, 10) || 7));
  const validLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 10));

  return withCache(
    `search:trending:${validDays}:${validLimit}`,
    () => searchRepo.getTrendingEvents(validDays, validLimit),
    TTL.TRENDING
  );
};

// ─── City Autocomplete ────────────────────────────────────────────────────────

/**
 * Returns distinct cities for autocomplete.
 *
 * @param {string} [query] - Optional prefix to filter
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
export const getCities = async (query = '', limit = 10) => {
  const validLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 10));

  // Short query strings get a longer cache (more common prefix = same result for many users)
  const cacheKey = query
    ? `search:cities:${query.toLowerCase().trim()}:${validLimit}`
    : `search:cities:all:${validLimit}`;

  return withCache(
    cacheKey,
    () => searchRepo.getDistinctCities(query, validLimit),
    TTL.CITIES
  );
};

// ─── Category Counts ──────────────────────────────────────────────────────────

/**
 * Returns categories with their event counts.
 *
 * @returns {Promise<object[]>}
 */
export const getCategoryCounts = async () => {
  return withCache(
    'search:categories:counts',
    () => searchRepo.getCategoryEventCounts(),
    TTL.CATEGORIES
  );
};

// ─── Related Events ───────────────────────────────────────────────────────────

/**
 * Returns events related to the given event (same category, nearby date).
 *
 * @param {string} eventId
 * @param {number} [limit=4]
 * @returns {Promise<object[]>}
 */
export const getRelatedEvents = async (eventId, limit = 4) => {
  // Load the event to get its category and date for the query
  const Event = (await import('../models/event.model.js')).default;
  const event = await Event.findById(eventId).select('category date status').lean();

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  const validLimit = Math.min(10, Math.max(1, parseInt(limit, 10) || 4));

  return withCache(
    `search:related:${eventId}:${validLimit}`,
    () => searchRepo.getRelatedEvents(eventId, event.category.toString(), event.date, validLimit),
    TTL.RELATED
  );
};

// ─── Seat Availability ────────────────────────────────────────────────────────

/**
 * Returns the real-time seat availability map for an event.
 * Very short cache TTL (30s) — seat status changes during active booking.
 *
 * @param {string} eventId
 * @returns {Promise<object>}
 */
export const getSeatAvailability = async (eventId) => {
  const result = await withCache(
    `search:seats:${eventId}`,
    () => searchRepo.getSeatAvailability(eventId),
    TTL.SEATS
  );

  if (!result) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  return result;
};
