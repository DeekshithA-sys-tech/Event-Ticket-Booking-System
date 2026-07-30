/**
 * @file admin.repository.js
 * @description All MongoDB operations for admin platform management.
 *
 * SCOPE:
 * ──────
 * This repository handles queries that CROSS domain boundaries:
 *   - All bookings platform-wide (not just one user's)
 *   - All events platform-wide (not just one organizer's)
 *   - Audit log read/write
 *
 * Operations that belong to a single domain (e.g., update a booking's status)
 * are still delegated to their own repositories
 * (booking.repository, event.repository, etc.).
 * This repo handles the READ side of cross-domain admin queries.
 *
 * RULE: No business logic here. Only DB queries.
 */

import mongoose from 'mongoose';
import Booking from '../models/booking.model.js';
import Event from '../models/event.model.js';
import Review from '../models/review.model.js';
import AuditLog from '../models/auditLog.model.js';

// ─── Platform Bookings ────────────────────────────────────────────────────────

/**
 * Get paginated platform-wide bookings with filters.
 * Admin can filter by status, eventId, or userId.
 *
 * @param {object} filter - Mongoose filter object
 * @param {object} options
 * @returns {Promise<{ bookings: object[], total: number }>}
 */
export const findAllBookings = async (
  filter = {},
  { skip = 0, limit = 20, sortObj = { createdAt: -1 } } = {}
) => {
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('user', 'name email role')
      .populate('event', 'title date venue city organizer status')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    Booking.countDocuments(filter),
  ]);
  return { bookings, total };
};

/**
 * Get a single booking by its human-readable bookingId.
 * Full population: user + event + organizer.
 *
 * @param {string} bookingId - e.g. "TKT-20260715-X7K2M"
 * @returns {Promise<Document|null>}
 */
export const findBookingByBookingId = async (bookingId) => {
  return Booking.findOne({ bookingId })
    .populate('user', 'name email phone')
    .populate({
      path: 'event',
      select: 'title date time venue city status organizer',
      populate: { path: 'organizer', select: 'name email' },
    })
    .exec();
};

// ─── Platform Events ──────────────────────────────────────────────────────────

/**
 * Get paginated platform-wide events with filters.
 * Admin can filter by status, organizer, category, city.
 *
 * @param {object} filter
 * @param {object} options
 * @returns {Promise<{ events: object[], total: number }>}
 */
export const findAllEvents = async (
  filter = {},
  { skip = 0, limit = 20, sortObj = { createdAt: -1 } } = {}
) => {
  const [events, total] = await Promise.all([
    Event.find(filter)
      .populate('organizer', 'name email')
      .populate('category', 'name slug')
      .select('-seatLayout') // exclude seatLayout — it's large and not needed in lists
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    Event.countDocuments(filter),
  ]);
  return { events, total };
};

// ─── Platform Reviews ─────────────────────────────────────────────────────────

/**
 * Get paginated platform-wide reviews.
 * Admin can filter by flagged, eventId, rating.
 *
 * @param {object} filter
 * @param {object} options
 * @returns {Promise<{ reviews: object[], total: number }>}
 */
export const findAllReviews = async (
  filter = {},
  { skip = 0, limit = 20, sortObj = { createdAt: -1 } } = {}
) => {
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name email')
      .populate('event', 'title date venue')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    Review.countDocuments(filter),
  ]);
  return { reviews, total };
};

// ─── Audit Log ────────────────────────────────────────────────────────────────

/**
 * Write a new audit log entry.
 * Called after every admin destructive action.
 *
 * @param {object} logData
 * @param {string} logData.admin        - Admin user ObjectId
 * @param {string} logData.adminEmail   - Admin email (denormalized snapshot)
 * @param {string} logData.action       - AUDIT_ACTIONS constant
 * @param {string} logData.targetModel  - 'User' | 'Event' | 'Booking' | 'Review'
 * @param {string} logData.targetId     - Target document ObjectId
 * @param {string} [logData.targetSummary] - Human-readable description
 * @param {object} [logData.changes]    - { before, after }
 * @param {string} [logData.reason]
 * @param {string} [logData.ipAddress]
 * @param {string} [logData.userAgent]
 * @returns {Promise<Document>}
 */
export const createAuditLog = async (logData) => {
  return AuditLog.create(logData);
};

/**
 * Get paginated audit logs with filters.
 *
 * @param {object} filter
 * @param {object} options
 * @returns {Promise<{ logs: object[], total: number }>}
 */
export const findAuditLogs = async (
  filter = {},
  { skip = 0, limit = 20, sortObj = { createdAt: -1 } } = {}
) => {
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('admin', 'name email')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    AuditLog.countDocuments(filter),
  ]);
  return { logs, total };
};

// ─── Platform Dashboard Stats ─────────────────────────────────────────────────

/**
 * Get high-level platform counts for the admin dashboard.
 * Uses Promise.all for parallel aggregation — all queries run simultaneously.
 *
 * @returns {Promise<object>}
 */
export const getDashboardStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    newUsersThisMonth,
    totalEvents,
    publishedEvents,
    upcomingEvents,
    totalBookings,
    confirmedBookings,
    cancelledBookings,
    bookingsThisMonth,
    revenueResult,
    revenueThisMonthResult,
    flaggedReviews,
  ] = await Promise.all([
    // Users
    mongoose.model('User').countDocuments({}),
    mongoose.model('User').countDocuments({ createdAt: { $gte: startOfMonth } }),

    // Events
    Event.countDocuments({}),
    Event.countDocuments({ status: 'published' }),
    Event.countDocuments({ status: 'published', date: { $gt: now } }),

    // Bookings
    Booking.countDocuments({}),
    Booking.countDocuments({ status: 'confirmed' }),
    Booking.countDocuments({ status: 'cancelled' }),
    Booking.countDocuments({ status: 'confirmed', createdAt: { $gte: startOfMonth } }),

    // Revenue
    Booking.aggregate([
      { $match: { status: 'confirmed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    Booking.aggregate([
      { $match: { status: 'confirmed', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),

    // Moderation
    Review.countDocuments({ isFlagged: true }),
  ]);

  const cancellationRate =
    totalBookings > 0 ? `${Math.round((cancelledBookings / totalBookings) * 100)}%` : '0%';

  return {
    users: {
      total: totalUsers,
      newThisMonth: newUsersThisMonth,
    },
    events: {
      total: totalEvents,
      published: publishedEvents,
      upcoming: upcomingEvents,
    },
    bookings: {
      total: totalBookings,
      confirmed: confirmedBookings,
      cancelled: cancelledBookings,
      thisMonth: bookingsThisMonth,
      cancellationRate,
    },
    revenue: {
      total: revenueResult[0]?.total || 0,
      thisMonth: revenueThisMonthResult[0]?.total || 0,
    },
    moderation: {
      flaggedReviews,
    },
  };
};
