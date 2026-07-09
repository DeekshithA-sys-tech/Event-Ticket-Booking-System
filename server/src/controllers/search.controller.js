/**
 * @file search.controller.js
 * @description HTTP handlers for Search & Discovery endpoints.
 *
 * All search endpoints are PUBLIC (no authentication required).
 * Seat availability is also public — users need to see which seats
 * are free before logging in to book.
 */

import * as searchService from '../services/search.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

/**
 * @swagger
 * tags:
 *   - name: Search
 *     description: Event search, discovery, and seat availability
 */

// ─── Full-Text Event Search ───────────────────────────────────────────────────

/**
 * @swagger
 * /search/events:
 *   get:
 *     tags: [Search]
 *     summary: Search and filter published events
 *     security: []
 *     description: |
 *       Supports full-text search across title, venue, and description.
 *       Results are cached for 2 minutes per unique query combination.
 *     parameters:
 *       - name: q
 *         in: query
 *         schema:
 *           type: string
 *         description: Full-text search query
 *       - name: city
 *         in: query
 *         schema:
 *           type: string
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *         description: Category slug (e.g. 'music', 'sports')
 *       - name: minPrice
 *         in: query
 *         schema:
 *           type: number
 *       - name: maxPrice
 *         in: query
 *         schema:
 *           type: number
 *       - name: startDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *       - name: endDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *       - name: hasAvailableSeats
 *         in: query
 *         schema:
 *           type: boolean
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/SortParam'
 *     responses:
 *       200:
 *         description: Events found
 */
export const searchEvents = asyncHandler(async (req, res) => {
  // Support both ?q= and ?search= query param names for flexibility
  const queryParams = {
    ...req.query,
    search: req.query.q || req.query.search,
  };

  const { events, meta } = await searchService.searchEvents(queryParams);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Search results fetched successfully.', events, meta));
});

// ─── Trending Events ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /search/trending:
 *   get:
 *     tags: [Search]
 *     summary: Get trending events (most booked in last N days)
 *     security: []
 *     parameters:
 *       - name: days
 *         in: query
 *         schema:
 *           type: integer
 *           default: 7
 *           minimum: 1
 *           maximum: 30
 *         description: Lookback window in days
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 20
 *     responses:
 *       200:
 *         description: Trending events fetched (cached for 5 minutes)
 */
export const getTrendingEvents = asyncHandler(async (req, res) => {
  const events = await searchService.getTrendingEvents(
    req.query.days,
    req.query.limit
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Trending events fetched successfully.', events));
});

// ─── City Autocomplete ────────────────────────────────────────────────────────

/**
 * @swagger
 * /search/cities:
 *   get:
 *     tags: [Search]
 *     summary: Get distinct cities for autocomplete
 *     security: []
 *     parameters:
 *       - name: q
 *         in: query
 *         schema:
 *           type: string
 *         description: City prefix for autocomplete (e.g. 'mum' → Mumbai)
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Cities fetched (cached for 60 minutes)
 */
export const getCities = asyncHandler(async (req, res) => {
  const cities = await searchService.getCities(req.query.q, req.query.limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Cities fetched successfully.', cities));
});

// ─── Category Counts ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /search/categories/counts:
 *   get:
 *     tags: [Search]
 *     summary: Get all categories with upcoming event counts
 *     security: []
 *     responses:
 *       200:
 *         description: Category counts fetched (cached for 10 minutes)
 */
export const getCategoryCounts = asyncHandler(async (_req, res) => {
  const categories = await searchService.getCategoryCounts();

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Category counts fetched successfully.', categories));
});

// ─── Related Events ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /search/events/{eventId}/related:
 *   get:
 *     tags: [Search]
 *     summary: Get events related to a specific event
 *     security: []
 *     parameters:
 *       - name: eventId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 4
 *           maximum: 10
 *     responses:
 *       200:
 *         description: Related events fetched
 *       404:
 *         description: Event not found
 */
export const getRelatedEvents = asyncHandler(async (req, res) => {
  const events = await searchService.getRelatedEvents(
    req.params.eventId,
    req.query.limit
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Related events fetched successfully.', events));
});

// ─── Seat Availability ────────────────────────────────────────────────────────

/**
 * @swagger
 * /search/events/{eventId}/seats:
 *   get:
 *     tags: [Search]
 *     summary: Get real-time seat availability for an event
 *     security: []
 *     description: |
 *       Returns the seat map with current status (available/locked/booked).
 *       Lock owner identity (lockedBy) is intentionally excluded from the response.
 *       Cached for 30 seconds for near-real-time accuracy.
 *     parameters:
 *       - name: eventId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Seat availability fetched
 *       404:
 *         description: Event not found
 */
export const getSeatAvailability = asyncHandler(async (req, res) => {
  const availability = await searchService.getSeatAvailability(req.params.eventId);

  return res
    .status(HTTP_STATUS.OK)
    .json(
      new ApiResponse(HTTP_STATUS.OK, 'Seat availability fetched successfully.', availability)
    );
});
