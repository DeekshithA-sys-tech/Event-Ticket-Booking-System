/**
 * @file booking.repository.js
 * @description All MongoDB operations for the Booking collection.
 *
 * KEY PATTERNS:
 * -------------
 * 1. create() uses a Mongoose session (transaction) — the service passes it in
 *    so that booking creation is atomic with the seat status update on the Event.
 *
 * 2. populate() strategy:
 *    - List view: minimal population (event title, date — no seat layout)
 *    - Detail view: full population (event + organizer + category)
 *
 * 3. Lean queries on lists — plain JS objects are faster for read-only endpoints.
 */

import Booking from '../models/booking.model.js';
import { BOOKING_STATUS } from '../constants/eventStatus.js';

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Get paginated booking history for a specific user.
 *
 * @param {string} userId
 * @param {object} options
 * @returns {Promise<{ bookings: object[], total: number }>}
 */
export const findBookingsByUser = async (userId, { skip = 0, limit = 10, sortObj = { createdAt: -1 } } = {}) => {
  const filter = { user: userId };
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('event', 'title date time venue city banner status')
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
 * Find a booking by its human-readable bookingId.
 * Used for ticket scanning and customer support lookups.
 *
 * @param {string} bookingId - e.g. "TKT-20240715-X7K2M"
 * @returns {Promise<Document|null>}
 */
export const findBookingByBookingId = async (bookingId) => {
  return Booking.findOne({ bookingId })
    .populate('event', 'title date time venue city banner organizer')
    .populate('user', 'name email')
    .exec();
};

/**
 * Find a booking by its MongoDB ObjectId.
 * Used internally where we already have the ObjectId.
 *
 * @param {string} id - MongoDB ObjectId string
 * @returns {Promise<Document|null>}
 */
export const findBookingById = async (id) => {
  return Booking.findById(id)
    .populate('event', 'title date time venue city banner organizer category')
    .populate('user', 'name email phone')
    .exec();
};

/**
 * Check if a user already has a confirmed booking for an event.
 * Enforces the "no double booking" business rule.
 *
 * @param {string} userId
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
export const userHasBookingForEvent = async (userId, eventId) => {
  const count = await Booking.countDocuments({
    user: userId,
    event: eventId,
    status: BOOKING_STATUS.CONFIRMED,
  });
  return count > 0;
};

/**
 * Get all bookings for a specific event (organizer/admin use).
 *
 * @param {string} eventId
 * @param {object} options
 * @returns {Promise<{ bookings: object[], total: number }>}
 */
export const findBookingsByEvent = async (eventId, { skip = 0, limit = 20, sortObj = { createdAt: -1 } } = {}) => {
  const filter = { event: eventId };
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('user', 'name email')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    Booking.countDocuments(filter),
  ]);
  return { bookings, total };
};

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Create a new booking document within a Mongoose session (transaction).
 *
 * WHY SESSION?
 * The booking creation and the seat status update on the Event document
 * must happen atomically. If the booking is created but the seat update fails
 * (or vice versa), the DB would be in an inconsistent state.
 * Passing the session makes both operations part of one transaction.
 *
 * @param {object} bookingData
 * @param {import('mongoose').ClientSession} [session] - Optional Mongoose session
 * @returns {Promise<Document>}
 */
export const createBooking = async (bookingData, session = null) => {
  const options = session ? { session } : {};
  const [booking] = await Booking.create([bookingData], options);
  return booking;
};

/**
 * Update a booking's status (e.g. cancelled).
 *
 * @param {string} id - MongoDB ObjectId string
 * @param {object} updates
 * @param {import('mongoose').ClientSession} [session]
 * @returns {Promise<Document|null>}
 */
export const updateBookingById = async (id, updates, session = null) => {
  const options = { new: true, ...(session ? { session } : {}) };
  return Booking.findByIdAndUpdate(id, updates, options).exec();
};

/**
 * Count confirmed bookings for an event.
 * Used for analytics and organizer dashboard.
 *
 * @param {string} eventId
 * @returns {Promise<number>}
 */
export const countConfirmedBookings = async (eventId) => {
  return Booking.countDocuments({ event: eventId, status: BOOKING_STATUS.CONFIRMED });
};
