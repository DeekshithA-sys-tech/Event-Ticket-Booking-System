/**
 * @file analytics.repository.js
 * @description MongoDB aggregation pipelines for the Analytics Dashboard.
 *
 * ANALYTICS DESIGN PHILOSOPHY:
 * ────────────────────────────
 * Every pipeline here answers a specific business question that an
 * organizer or platform admin needs to run their operations:
 *
 *  "How much revenue did I make this month?"         → getOrganizerOverview
 *  "Which of my events is performing best?"          → getEventAnalytics
 *  "When are users booking? Morning or evening?"     → getBookingTimeline
 *  "Where does my revenue come from?"                → getRevenueBreakdown
 *  "Are attendees happy? Is rating improving?"       → getReviewSummary
 *
 * PERFORMANCE STRATEGY:
 * ─────────────────────
 * 1. $match FIRST — always. Reduces the working set before any join.
 * 2. $lookup only what you need — don't join entire documents.
 * 3. $project at the end — strip fields once, not per-stage.
 * 4. Results are cached in Redis (10–15 min TTL) — these pipelines
 *    never run on every HTTP request in production.
 *
 * TWO OPERATIONAL MODES:
 * ──────────────────────
 * Organizer mode: filter by organizerId → sees only their own data
 * Admin mode:     no organizerId filter → sees platform-wide totals
 *
 * The same pipelines serve both modes — a single conditional $match
 * at the beginning controls the scope.
 */

import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import Event from '../models/event.model.js';
import Review from '../models/review.model.js';
import User from '../models/user.model.js';
import { BOOKING_STATUS } from '../constants/eventStatus.js';

// ─── Dashboard Overview ───────────────────────────────────────────────────────

/**
 * Aggregates the key dashboard metrics for an organizer (or the full platform).
 *
 * Returns:
 *   - totalRevenue: sum of totalAmount on confirmed bookings
 *   - totalBookings: count of confirmed bookings
 *   - totalEvents: count of events created
 *   - publishedEvents: count of published events
 *   - upcomingEvents: count of published events with future dates
 *   - totalAttendees: unique users who booked (confirmed)
 *   - averageRating: average of event.rating.average (weighted by count)
 *   - thisMonthRevenue: revenue in current calendar month
 *   - lastMonthRevenue: revenue in previous calendar month (for % change)
 *
 * @param {string|null} organizerId - null = platform-wide (admin)
 * @returns {Promise<object>}
 */
export const getOverview = async (organizerId = null) => {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // ── Determine which events to include ──────────────────────────────────────
  let eventIds = null;
  if (organizerId) {
    const events = await Event.find({ organizer: organizerId }).select('_id').lean();
    eventIds = events.map((e) => e._id);
    if (eventIds.length === 0) {
      return buildEmptyOverview();
    }
  }

  const bookingMatch = { status: BOOKING_STATUS.CONFIRMED };
  if (eventIds) bookingMatch.event = { $in: eventIds };

  // ── Run revenue/booking aggregations in parallel ───────────────────────────
  const [bookingStats, thisMonthStats, lastMonthStats, eventStats, ratingStats] =
    await Promise.all([
      // All-time revenue + booking count + unique attendees
      Booking.aggregate([
        { $match: bookingMatch },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalBookings: { $sum: 1 },
            totalAttendees: { $addToSet: '$user' },
          },
        },
        {
          $project: {
            _id: 0,
            totalRevenue: 1,
            totalBookings: 1,
            uniqueAttendees: { $size: '$totalAttendees' },
          },
        },
      ]),

      // This month's revenue
      Booking.aggregate([
        { $match: { ...bookingMatch, createdAt: { $gte: thisMonthStart } } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' } } },
      ]),

      // Last month's revenue (for MoM change calculation)
      Booking.aggregate([
        {
          $match: {
            ...bookingMatch,
            createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
          },
        },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' } } },
      ]),

      // Event counts by status
      Event.aggregate([
        ...(organizerId
          ? [{ $match: { organizer: new mongoose.Types.ObjectId(organizerId) } }]
          : []),
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),

      // Average rating across all events
      Event.aggregate([
        ...(organizerId
          ? [{ $match: { organizer: new mongoose.Types.ObjectId(organizerId) } }]
          : []),
        { $match: { 'rating.count': { $gt: 0 } } },
        {
          $group: {
            _id: null,
            // Weighted average: sum(avg * count) / sum(count)
            totalWeightedRating: { $sum: { $multiply: ['$rating.average', '$rating.count'] } },
            totalReviews: { $sum: '$rating.count' },
          },
        },
        {
          $project: {
            _id: 0,
            weightedAverage: {
              $round: [{ $divide: ['$totalWeightedRating', '$totalReviews'] }, 1],
            },
            totalReviews: 1,
          },
        },
      ]),
    ]);

  // ── Build event status map ─────────────────────────────────────────────────
  const statusMap = {};
  eventStats.forEach(({ _id, count }) => { statusMap[_id] = count; });
  const totalEvents = Object.values(statusMap).reduce((a, b) => a + b, 0);

  // Count upcoming published events
  const upcomingQuery = organizerId
    ? { organizer: new mongoose.Types.ObjectId(organizerId), status: 'published', date: { $gt: now } }
    : { status: 'published', date: { $gt: now } };
  const upcomingEvents = await Event.countDocuments(upcomingQuery);

  // ── Month-over-month revenue change ───────────────────────────────────────
  const thisMonth = thisMonthStats[0]?.revenue || 0;
  const lastMonth = lastMonthStats[0]?.revenue || 0;
  const revenueChangePercent =
    lastMonth === 0
      ? thisMonth > 0 ? 100 : 0
      : Math.round(((thisMonth - lastMonth) / lastMonth) * 100);

  return {
    revenue: {
      total: bookingStats[0]?.totalRevenue || 0,
      thisMonth,
      lastMonth,
      changePercent: revenueChangePercent,
    },
    bookings: {
      total: bookingStats[0]?.totalBookings || 0,
      uniqueAttendees: bookingStats[0]?.uniqueAttendees || 0,
    },
    events: {
      total: totalEvents,
      published: statusMap['published'] || 0,
      draft: statusMap['draft'] || 0,
      cancelled: statusMap['cancelled'] || 0,
      completed: statusMap['completed'] || 0,
      upcoming: upcomingEvents,
    },
    rating: {
      average: ratingStats[0]?.weightedAverage || 0,
      totalReviews: ratingStats[0]?.totalReviews || 0,
    },
  };
};

const buildEmptyOverview = () => ({
  revenue: { total: 0, thisMonth: 0, lastMonth: 0, changePercent: 0 },
  bookings: { total: 0, uniqueAttendees: 0 },
  events: { total: 0, published: 0, draft: 0, cancelled: 0, completed: 0, upcoming: 0 },
  rating: { average: 0, totalReviews: 0 },
});

// ─── Per-Event Analytics ──────────────────────────────────────────────────────

/**
 * Deep-dive analytics for a single event.
 *
 * Returns:
 *   - seatsTotal / seatsBooked / seatsAvailable / occupancyRate
 *   - revenue: total, average per booking
 *   - bookingsByDay: daily booking counts (sparkline data)
 *   - topCities: where attendees are booking from (requires User lookup)
 *   - rating summary
 *
 * @param {string} eventId
 * @returns {Promise<object>}
 */
export const getEventAnalytics = async (eventId) => {
  const eventObjectId = new mongoose.Types.ObjectId(eventId);

  const [event, bookingStats, bookingsByDay, ratingDist] = await Promise.all([
    // Event base data
    Event.findById(eventId)
      .select('title date time venue city totalSeats availableSeats rating status')
      .lean(),

    // Booking revenue and seat stats
    Booking.aggregate([
      { $match: { event: eventObjectId, status: BOOKING_STATUS.CONFIRMED } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalBookings: { $sum: 1 },
          totalSeatsBooked: { $sum: { $size: '$seats' } },
          avgBookingValue: { $avg: '$totalAmount' },
        },
      },
    ]),

    // Bookings per day (last 30 days for timeline)
    Booking.aggregate([
      {
        $match: {
          event: eventObjectId,
          status: BOOKING_STATUS.CONFIRMED,
          createdAt: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          bookings: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
          seatsBooked: { $sum: { $size: '$seats' } },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', bookings: 1, revenue: 1, seatsBooked: 1 } },
    ]),

    // Rating distribution from the Review collection
    Review.aggregate([
      { $match: { event: eventObjectId, isFlagged: false } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  if (!event) return null;

  const stats = bookingStats[0] || {};
  const seatsBooked = event.totalSeats - event.availableSeats;
  const occupancyRate =
    event.totalSeats > 0
      ? Math.round((seatsBooked / event.totalSeats) * 100)
      : 0;

  // Build rating distribution object
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratingDist.forEach(({ _id, count }) => { distribution[_id] = count; });

  return {
    event: {
      _id: event._id,
      title: event.title,
      date: event.date,
      venue: event.venue,
      city: event.city,
      status: event.status,
    },
    seats: {
      total: event.totalSeats,
      booked: seatsBooked,
      available: event.availableSeats,
      occupancyRate: `${occupancyRate}%`,
    },
    revenue: {
      total: stats.totalRevenue || 0,
      totalBookings: stats.totalBookings || 0,
      averageBookingValue: stats.avgBookingValue
        ? Math.round(stats.avgBookingValue)
        : 0,
    },
    bookingTimeline: bookingsByDay,
    rating: {
      average: event.rating?.average || 0,
      count: event.rating?.count || 0,
      distribution,
    },
  };
};

// ─── Booking Timeline ─────────────────────────────────────────────────────────

/**
 * Daily booking volume for a time range (chart data for line/bar charts).
 * Groups by day and returns bookings + revenue per day.
 *
 * @param {string|null} organizerId
 * @param {number} [days=30]
 * @returns {Promise<object[]>}
 */
export const getBookingTimeline = async (organizerId = null, days = 30) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let eventIds = null;
  if (organizerId) {
    const events = await Event.find({ organizer: organizerId }).select('_id').lean();
    eventIds = events.map((e) => e._id);
  }

  const matchStage = {
    status: BOOKING_STATUS.CONFIRMED,
    createdAt: { $gte: since },
  };
  if (eventIds) matchStage.event = { $in: eventIds };

  const timeline = await Booking.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          // Also group by hour of day to show booking patterns
          hour: { $hour: '$createdAt' },
        },
        bookings: { $sum: 1 },
        revenue: { $sum: '$totalAmount' },
        seatsBooked: { $sum: { $size: '$seats' } },
      },
    },
    {
      // Re-aggregate to daily totals (collapsing hourly)
      $group: {
        _id: '$_id.date',
        bookings: { $sum: '$bookings' },
        revenue: { $sum: '$revenue' },
        seatsBooked: { $sum: '$seatsBooked' },
        peakHour: { $max: '$_id.hour' }, // Most popular hour (approximate)
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: '$_id',
        bookings: 1,
        revenue: 1,
        seatsBooked: 1,
        peakHour: 1,
      },
    },
  ]);

  // Fill in missing dates with zero values for a continuous chart
  const filledTimeline = fillMissingDates(timeline, days);
  return filledTimeline;
};

/**
 * Fills gaps in daily timeline with zero-value entries.
 * Frontend charts need a continuous series — gaps cause wrong rendering.
 *
 * @param {object[]} data - Array of { date, bookings, revenue }
 * @param {number} days - Number of days to fill back from today
 * @returns {object[]}
 */
const fillMissingDates = (data, days) => {
  const dateMap = {};
  data.forEach((d) => { dateMap[d.date] = d; });

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
    result.push(
      dateMap[dateStr] || {
        date: dateStr,
        bookings: 0,
        revenue: 0,
        seatsBooked: 0,
        peakHour: null,
      }
    );
  }
  return result;
};

// ─── Revenue Breakdown ────────────────────────────────────────────────────────

/**
 * Revenue broken down by event (top N events by revenue).
 * Also includes per-category revenue totals.
 *
 * @param {string|null} organizerId
 * @param {number} [topN=10]
 * @returns {Promise<{ byEvent: object[], byCategory: object[] }>}
 */
export const getRevenueBreakdown = async (organizerId = null, topN = 10) => {
  let eventIds = null;
  if (organizerId) {
    const events = await Event.find({ organizer: organizerId }).select('_id').lean();
    eventIds = events.map((e) => e._id);
  }

  const bookingMatch = { status: BOOKING_STATUS.CONFIRMED };
  if (eventIds) bookingMatch.event = { $in: eventIds };

  const [byEvent, byCategory] = await Promise.all([
    // Revenue per event (top N)
    Booking.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: '$event',
          revenue: { $sum: '$totalAmount' },
          bookings: { $sum: 1 },
          seatsBooked: { $sum: { $size: '$seats' } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: topN },
      {
        $lookup: {
          from: 'events',
          localField: '_id',
          foreignField: '_id',
          as: 'event',
        },
      },
      { $unwind: '$event' },
      {
        $project: {
          _id: 0,
          eventId: '$_id',
          title: '$event.title',
          date: '$event.date',
          city: '$event.city',
          revenue: 1,
          bookings: 1,
          seatsBooked: 1,
        },
      },
    ]),

    // Revenue per category
    Booking.aggregate([
      { $match: bookingMatch },
      {
        $lookup: {
          from: 'events',
          localField: 'event',
          foreignField: '_id',
          as: 'eventData',
        },
      },
      { $unwind: '$eventData' },
      {
        $group: {
          _id: '$eventData.category',
          revenue: { $sum: '$totalAmount' },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmpty: true } },
      {
        $project: {
          _id: 0,
          categoryId: '$_id',
          name: '$category.name',
          slug: '$category.slug',
          icon: '$category.icon',
          revenue: 1,
          bookings: 1,
        },
      },
    ]),
  ]);

  return { byEvent, byCategory };
};

// ─── Review / Rating Summary ──────────────────────────────────────────────────

/**
 * Rating trends over time for an organizer's events.
 * Shows average rating per month over the last 12 months.
 *
 * @param {string|null} organizerId
 * @returns {Promise<{ monthlyTrend: object[], topRatedEvents: object[], recentReviews: object[] }>}
 */
export const getReviewSummary = async (organizerId = null) => {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  let eventIds = null;
  if (organizerId) {
    const events = await Event.find({ organizer: organizerId }).select('_id').lean();
    eventIds = events.map((e) => e._id);
  }

  const reviewMatch = { isFlagged: false, createdAt: { $gte: twelveMonthsAgo } };
  if (eventIds) reviewMatch.event = { $in: eventIds };

  const [monthlyTrend, topRatedEvents, recentReviews] = await Promise.all([
    // Monthly average rating trend
    Review.aggregate([
      { $match: reviewMatch },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          averageRating: { $round: ['$averageRating', 1] },
          reviewCount: 1,
        },
      },
    ]),

    // Top 5 rated events
    Event.aggregate([
      ...(organizerId
        ? [{ $match: { organizer: new mongoose.Types.ObjectId(organizerId) } }]
        : []),
      { $match: { 'rating.count': { $gte: 3 } } }, // At least 3 reviews to qualify
      { $sort: { 'rating.average': -1, 'rating.count': -1 } },
      { $limit: 5 },
      {
        $project: {
          title: 1,
          date: 1,
          city: 1,
          'rating.average': 1,
          'rating.count': 1,
        },
      },
    ]),

    // 5 most recent reviews
    Review.aggregate([
      {
        $match: {
          isFlagged: false,
          ...(eventIds ? { event: { $in: eventIds } } : {}),
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'reviewer',
        },
      },
      { $unwind: '$reviewer' },
      {
        $lookup: {
          from: 'events',
          localField: 'event',
          foreignField: '_id',
          as: 'eventData',
        },
      },
      { $unwind: '$eventData' },
      {
        $project: {
          _id: 1,
          rating: 1,
          title: 1,
          body: 1,
          createdAt: 1,
          isEdited: 1,
          'reviewer.name': 1,
          'eventData.title': 1,
          'eventData._id': 1,
        },
      },
    ]),
  ]);

  return { monthlyTrend, topRatedEvents, recentReviews };
};

// ─── Admin Platform Overview ───────────────────────────────────────────────────

/**
 * Platform-wide metrics for admin dashboard only.
 * Adds user registration stats and cancellation rate.
 *
 * @returns {Promise<object>}
 */
export const getPlatformStats = async () => {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [userStats, bookingStats, cancellationRate] = await Promise.all([
    User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          activeCount: { $sum: { $cond: ['$isActive', 1, 0] } },
          newThisMonth: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', thisMonthStart] }, 1, 0],
            },
          },
        },
      },
    ]),

    // Booking totals with confirmed/cancelled split
    Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        },
      },
    ]),

    // Cancellation rate: cancelled / (confirmed + cancelled)
    Booking.aggregate([
      {
        $match: {
          status: { $in: ['confirmed', 'cancelled'] },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const userMap = {};
  userStats.forEach(({ _id, count, activeCount, newThisMonth }) => {
    userMap[_id] = { count, activeCount, newThisMonth };
  });

  const bookingMap = {};
  bookingStats.forEach(({ _id, count, revenue }) => {
    bookingMap[_id] = { count, revenue };
  });

  const cancelMap = {};
  cancellationRate.forEach(({ _id, count }) => { cancelMap[_id] = count; });
  const confirmedCount = cancelMap['confirmed'] || 0;
  const cancelledCount = cancelMap['cancelled'] || 0;
  const totalForRate = confirmedCount + cancelledCount;
  const cancellationRatePct =
    totalForRate > 0 ? Math.round((cancelledCount / totalForRate) * 100) : 0;

  return {
    users: {
      customers: userMap['customer'] || { count: 0, activeCount: 0, newThisMonth: 0 },
      organizers: userMap['organizer'] || { count: 0, activeCount: 0, newThisMonth: 0 },
      admins: userMap['admin'] || { count: 0, activeCount: 0, newThisMonth: 0 },
    },
    bookings: {
      confirmed: bookingMap['confirmed']?.count || 0,
      cancelled: bookingMap['cancelled']?.count || 0,
      cancellationRate: `${cancellationRatePct}%`,
    },
    revenue: {
      total: bookingMap['confirmed']?.revenue || 0,
    },
  };
};
