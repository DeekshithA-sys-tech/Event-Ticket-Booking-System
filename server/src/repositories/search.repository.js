/**
 * @file search.repository.js
 * @description MongoDB aggregation pipelines for Search & Discovery features.
 *
 * WHY A SEPARATE SEARCH REPOSITORY?
 * -----------------------------------
 * The event.repository.js handles CRUD — create, read one, update, delete.
 * Search queries are fundamentally different: they're aggregation pipelines,
 * not simple find() queries. Separating them keeps each file focused.
 *
 * Also: search pipelines tend to grow and evolve independently of CRUD.
 * Adding a new facet filter shouldn't require touching the booking-related
 * event repository methods.
 *
 * AGGREGATION PIPELINE PRIMER:
 * -----------------------------
 * MongoDB aggregation works like a Unix pipe:
 *
 *   collection
 *     | $match   (filter documents — like WHERE in SQL)
 *     | $lookup  (join another collection — like JOIN in SQL)
 *     | $group   (aggregate — like GROUP BY in SQL)
 *     | $sort    (order results — like ORDER BY in SQL)
 *     | $limit   (cap results — like LIMIT in SQL)
 *     | $project (select fields — like SELECT in SQL)
 *
 * Each stage receives the output of the previous stage.
 * Stages that reduce the dataset ($match, $limit) should come early.
 * Stages that expand the dataset ($lookup) should come after filtering.
 *
 * PERFORMANCE RULES:
 * ------------------
 * 1. $match as early as possible — uses indexes, reduces working set
 * 2. $lookup after $match — join only the filtered documents
 * 3. $project as the last stage — strip fields you don't need
 * 4. $limit before $sort if you don't need globally sorted results
 */

import mongoose from 'mongoose';
import Event from '../models/event.model.js';
import Booking from '../models/booking.model.js';
import { EVENT_STATUS } from '../constants/eventStatus.js';

// ─── Full-Text Event Search ───────────────────────────────────────────────────

/**
 * Advanced event search using MongoDB aggregation.
 * Supports: text search, city, category (by slug), price range, date range,
 *            availability filter, and pagination — all in one pipeline.
 *
 * WHY AGGREGATION OVER find()?
 * - We need to filter by category SLUG (a field on the Category document)
 *   not by ObjectId. A simple find() can't join Category to resolve the slug.
 *   With $lookup we join Category and $match on the slug in one pipeline.
 * - We can also $project to shape the response (exclude seatLayout from list).
 *
 * @param {object} filters
 * @param {object} pagination - { skip, limit, sortObj }
 * @returns {Promise<{ events: object[], total: number }>}
 */
export const searchEvents = async (filters = {}, { skip = 0, limit = 10, sortObj = { date: 1 } } = {}) => {
  const {
    search,
    city,
    categorySlug,
    minPrice,
    maxPrice,
    startDate,
    endDate,
    hasAvailableSeats,
    status,
  } = filters;

  // ── Stage 1: Initial match (uses indexes — do this FIRST) ─────────────────
  const matchStage = {
    status: status || EVENT_STATUS.PUBLISHED,
  };

  if (city) {
    matchStage.city = new RegExp(city.trim(), 'i');
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    matchStage.ticketPrice = {};
    if (minPrice !== undefined) matchStage.ticketPrice.$gte = parseFloat(minPrice);
    if (maxPrice !== undefined) matchStage.ticketPrice.$lte = parseFloat(maxPrice);
  }

  if (startDate || endDate) {
    matchStage.date = {};
    if (startDate) matchStage.date.$gte = new Date(startDate);
    if (endDate) matchStage.date.$lte = new Date(endDate);
  }

  if (hasAvailableSeats === 'true' || hasAvailableSeats === true) {
    matchStage.availableSeats = { $gt: 0 };
  }

  // Text search: uses the text index on { title: 'text', venue: 'text' }
  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    matchStage.$or = [
      { title: regex },
      { venue: regex },
      { description: regex },
    ];
  }

  // ── Stage 2: $lookup to join Category (to filter by slug) ─────────────────
  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryData',
      },
    },
    { $unwind: '$categoryData' },
  ];

  // ── Stage 3: Filter by category slug (after join) ──────────────────────────
  if (categorySlug) {
    pipeline.push({
      $match: { 'categoryData.slug': categorySlug.toLowerCase() },
    });
  }

  // ── Count total (before pagination) — facet pattern ───────────────────────
  // $facet runs two sub-pipelines simultaneously:
  //   'data'  → paginated results
  //   'total' → count for pagination meta
  pipeline.push({
    $facet: {
      data: [
        { $sort: sortObj },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            // Exclude the large seatLayout from list view
            seatLayout: 0,
            __v: 0,
            // Shape category field from the joined data
            category: {
              _id: '$categoryData._id',
              name: '$categoryData.name',
              slug: '$categoryData.slug',
              icon: '$categoryData.icon',
            },
            categoryData: 0, // Remove the raw lookup result
          },
        },
      ],
      total: [{ $count: 'count' }],
    },
  });

  const [result] = await Event.aggregate(pipeline);

  return {
    events: result.data,
    total: result.total[0]?.count || 0,
  };
};

// ─── Trending Events ──────────────────────────────────────────────────────────

/**
 * Returns the most-booked events in the last N days.
 *
 * ALGORITHM:
 *   1. Find all confirmed bookings in the last N days (from Booking collection)
 *   2. Group by event, count bookings per event
 *   3. Sort by booking count (descending)
 *   4. $lookup to get event details
 *   5. Filter to only published, future events
 *
 * This is a cross-collection aggregation — starting in Booking, joining Event.
 *
 * @param {number} [days=7] - Lookback window in days
 * @param {number} [limit=10] - Max trending events to return
 * @returns {Promise<object[]>}
 */
export const getTrendingEvents = async (days = 7, limit = 10) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const trending = await Booking.aggregate([
    // Stage 1: Only recent confirmed bookings
    {
      $match: {
        status: 'confirmed',
        createdAt: { $gte: since },
      },
    },
    // Stage 2: Count bookings per event
    {
      $group: {
        _id: '$event',
        bookingCount: { $sum: 1 },
        totalSeatsBooked: { $sum: { $size: '$seats' } },
      },
    },
    // Stage 3: Sort by most booked
    { $sort: { bookingCount: -1 } },
    { $limit: limit * 2 }, // Fetch more than needed — some may be filtered out
    // Stage 4: Join Event collection to get details
    {
      $lookup: {
        from: 'events',
        localField: '_id',
        foreignField: '_id',
        as: 'event',
      },
    },
    { $unwind: '$event' },
    // Stage 5: Only published future events
    {
      $match: {
        'event.status': EVENT_STATUS.PUBLISHED,
        'event.date': { $gt: new Date() },
      },
    },
    { $limit: limit },
    // Stage 6: Join categories for the events
    {
      $lookup: {
        from: 'categories',
        localField: 'event.category',
        foreignField: '_id',
        as: 'categoryData',
      },
    },
    { $unwind: { path: '$categoryData', preserveNullAndEmpty: true } },
    // Stage 7: Shape the output
    {
      $project: {
        _id: '$event._id',
        title: '$event.title',
        date: '$event.date',
        time: '$event.time',
        venue: '$event.venue',
        city: '$event.city',
        ticketPrice: '$event.ticketPrice',
        availableSeats: '$event.availableSeats',
        banner: '$event.banner',
        status: '$event.status',
        category: {
          _id: '$categoryData._id',
          name: '$categoryData.name',
          slug: '$categoryData.slug',
          icon: '$categoryData.icon',
        },
        bookingCount: 1,
        totalSeatsBooked: 1,
      },
    },
  ]);

  return trending;
};

// ─── City Autocomplete ────────────────────────────────────────────────────────

/**
 * Returns distinct city names from published events, optionally filtered
 * by a prefix query for autocomplete functionality.
 *
 * @param {string} [query=''] - Prefix to filter cities (e.g. 'mum' → 'Mumbai')
 * @param {number} [limit=10]
 * @returns {Promise<string[]>}
 */
export const getDistinctCities = async (query = '', limit = 10) => {
  const matchStage = { status: EVENT_STATUS.PUBLISHED };

  if (query && query.trim()) {
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    matchStage.city = new RegExp(`^${escaped}`, 'i'); // Prefix match (faster than contains)
  }

  const cities = await Event.aggregate([
    { $match: matchStage },
    { $group: { _id: '$city', count: { $sum: 1 } } },   // Deduplicate + count events
    { $sort: { count: -1, _id: 1 } },                    // Most events first, alpha fallback
    { $limit: limit },
    { $project: { _id: 0, city: '$_id', eventCount: '$count' } },
  ]);

  return cities;
};

// ─── Category Counts ──────────────────────────────────────────────────────────

/**
 * Returns all active categories with the count of published events in each.
 * Used for the category filter sidebar in the frontend.
 *
 * @returns {Promise<object[]>}
 */
export const getCategoryEventCounts = async () => {
  const counts = await Event.aggregate([
    // Only count published, future events
    {
      $match: {
        status: EVENT_STATUS.PUBLISHED,
        date: { $gt: new Date() },
      },
    },
    // Group by category ObjectId
    { $group: { _id: '$category', eventCount: { $sum: 1 } } },
    // Join Category to get name/slug/icon
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    // Only include active categories
    { $match: { 'category.isActive': true } },
    { $sort: { eventCount: -1 } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id',
        name: '$category.name',
        slug: '$category.slug',
        icon: '$category.icon',
        eventCount: 1,
      },
    },
  ]);

  return counts;
};

// ─── Related Events ───────────────────────────────────────────────────────────

/**
 * Returns events in the same category, near the same date, excluding
 * the current event. Used for "You might also like" on event detail pages.
 *
 * @param {string} eventId - The current event's ObjectId
 * @param {string} categoryId - The current event's category ObjectId
 * @param {Date} eventDate - The current event's date
 * @param {number} [limit=4]
 * @returns {Promise<object[]>}
 */
export const getRelatedEvents = async (eventId, categoryId, eventDate, limit = 4) => {
  const eventObjectId = new mongoose.Types.ObjectId(eventId);
  const dateWindow = 30; // Look for events within ±30 days

  const windowStart = new Date(eventDate);
  windowStart.setDate(windowStart.getDate() - dateWindow);
  const windowEnd = new Date(eventDate);
  windowEnd.setDate(windowEnd.getDate() + dateWindow);

  const related = await Event.aggregate([
    {
      $match: {
        _id: { $ne: eventObjectId },          // Exclude the current event
        category: new mongoose.Types.ObjectId(categoryId),
        status: EVENT_STATUS.PUBLISHED,
        date: { $gte: new Date(), $lte: windowEnd }, // Future events in the window
      },
    },
    // Sort by date proximity (closest to the event date)
    {
      $addFields: {
        dateDiff: {
          $abs: { $subtract: ['$date', eventDate] },
        },
      },
    },
    { $sort: { dateDiff: 1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryData',
      },
    },
    { $unwind: { path: '$categoryData', preserveNullAndEmpty: true } },
    {
      $project: {
        seatLayout: 0,
        __v: 0,
        dateDiff: 0,
        category: {
          _id: '$categoryData._id',
          name: '$categoryData.name',
          slug: '$categoryData.slug',
        },
        categoryData: 0,
      },
    },
  ]);

  return related;
};

// ─── Seat Availability ────────────────────────────────────────────────────────

/**
 * Returns real-time seat availability for an event.
 * Returns the seat layout with current status — excludes sensitive lock data
 * (lockedBy, lockedAt) from the public response.
 *
 * @param {string} eventId
 * @returns {Promise<object|null>} Seat map with status only
 */
export const getSeatAvailability = async (eventId) => {
  const result = await Event.findById(eventId)
    .select('seatLayout availableSeats totalSeats title date status')
    .lean()
    .exec();

  if (!result) return null;

  // Strip sensitive lock data from the response
  const cleanLayout = result.seatLayout.map((row) => ({
    row: row.row,
    seats: row.seats.map((seat) => ({
      seatId: seat.seatId,
      seatNumber: seat.seatNumber,
      status: seat.status, // 'available' | 'locked' | 'booked'
      // lockedBy and lockedAt are intentionally excluded
    })),
  }));

  return {
    eventId: result._id,
    title: result.title,
    date: result.date,
    status: result.status,
    totalSeats: result.totalSeats,
    availableSeats: result.availableSeats,
    seatLayout: cleanLayout,
  };
};
