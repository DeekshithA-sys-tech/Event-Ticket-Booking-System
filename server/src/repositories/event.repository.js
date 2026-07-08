/**
 * @file event.repository.js
 * @description All MongoDB operations for the Event collection.
 *
 * IMPORTANT PATTERNS IN THIS FILE:
 * ----------------------------------
 *
 * 1. POPULATION STRATEGY
 *    We use .populate() to join related documents when needed.
 *    - 'category': name and slug for display in event cards
 *    - 'organizer': name for display in event detail
 *    We DON'T populate by default in list queries (perf) — only in detail.
 *
 * 2. LEAN QUERIES
 *    .lean() returns a plain JS object instead of a Mongoose Document.
 *    - 10x faster for READ-ONLY queries (no change tracking overhead)
 *    - Cannot call .save() on the result — fine for list/search endpoints
 *    We use lean() on listing queries, full Documents on update operations.
 *
 * 3. ATOMIC SEAT COUNT UPDATE
 *    We use $inc operator to atomically decrement/increment availableSeats.
 *    This prevents race conditions where two bookings happen simultaneously.
 *    NEVER do: event.availableSeats -= 1; await event.save();
 *    That reads, modifies, writes — not atomic.
 */

import Event from '../models/event.model.js';

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Get a paginated list of events with optional filters.
 * Uses .lean() for performance (read-only).
 *
 * @param {object} filter - Mongoose filter object
 * @param {object} options - Pagination and sort options
 * @returns {Promise<{ events: object[], total: number }>}
 */
export const findAllEvents = async (filter = {}, { skip = 0, limit = 10, sortObj = { date: 1 } } = {}) => {
  const [events, total] = await Promise.all([
    Event.find(filter)
      .populate('category', 'name slug icon')
      .populate('organizer', 'name avatar')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .select('-seatLayout') // Exclude seat layout from list (sent only on detail view)
      .lean()
      .exec(),
    Event.countDocuments(filter),
  ]);
  return { events, total };
};

/**
 * Find a single event by ID with full details including seat layout.
 * Returns a Mongoose Document (not lean) for potential updates.
 *
 * @param {string} id - Event ObjectId
 * @returns {Promise<Document|null>}
 */
export const findEventById = async (id) => {
  return Event.findById(id)
    .populate('category', 'name slug icon')
    .populate('organizer', 'name email avatar')
    .exec();
};

/**
 * Find a single event by ID and organizer (ownership check).
 * Used to ensure an organizer can only modify their own events.
 *
 * @param {string} eventId
 * @param {string} organizerId
 * @returns {Promise<Document|null>}
 */
export const findEventByIdAndOrganizer = async (eventId, organizerId) => {
  return Event.findOne({ _id: eventId, organizer: organizerId }).exec();
};

/**
 * Get all events created by a specific organizer.
 *
 * @param {string} organizerId
 * @param {object} options - Pagination options
 * @returns {Promise<{ events: object[], total: number }>}
 */
export const findEventsByOrganizer = async (organizerId, { skip = 0, limit = 10, sortObj = { createdAt: -1 } } = {}) => {
  const filter = { organizer: organizerId };
  const [events, total] = await Promise.all([
    Event.find(filter)
      .populate('category', 'name slug')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .select('-seatLayout')
      .lean()
      .exec(),
    Event.countDocuments(filter),
  ]);
  return { events, total };
};

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Create a new event document.
 * Sets availableSeats = totalSeats via model pre-save hook.
 *
 * @param {object} eventData
 * @returns {Promise<Document>}
 */
export const createEvent = async (eventData) => {
  return Event.create(eventData);
};

/**
 * Update an event by ID — for general field updates.
 *
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<Document|null>}
 */
export const updateEventById = async (id, updates) => {
  return Event.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  })
    .populate('category', 'name slug')
    .exec();
};

/**
 * Update just the banner field (used after Cloudinary upload).
 *
 * @param {string} id
 * @param {{ url: string, publicId: string }} banner
 * @returns {Promise<Document|null>}
 */
export const updateEventBanner = async (id, banner) => {
  return Event.findByIdAndUpdate(id, { banner }, { new: true }).exec();
};

/**
 * Atomically update event status (admin approval flow).
 *
 * @param {string} id
 * @param {string} status - New status value
 * @returns {Promise<Document|null>}
 */
export const updateEventStatus = async (id, status) => {
  return Event.findByIdAndUpdate(id, { status }, { new: true, runValidators: true }).exec();
};

/**
 * Atomically decrement availableSeats by the number of seats being booked.
 * Uses $inc — safe for concurrent bookings.
 *
 * @param {string} eventId
 * @param {number} count - Number of seats to decrement
 * @returns {Promise<Document|null>}
 */
export const decrementAvailableSeats = async (eventId, count) => {
  return Event.findByIdAndUpdate(
    eventId,
    { $inc: { availableSeats: -count } },
    { new: true }
  ).exec();
};

/**
 * Atomically increment availableSeats (used during booking cancellation).
 *
 * @param {string} eventId
 * @param {number} count
 * @returns {Promise<Document|null>}
 */
export const incrementAvailableSeats = async (eventId, count) => {
  return Event.findByIdAndUpdate(
    eventId,
    { $inc: { availableSeats: count } },
    { new: true }
  ).exec();
};

/**
 * Hard-delete an event document.
 * Should only be called after verifying no confirmed bookings exist.
 *
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export const deleteEventById = async (id) => {
  return Event.findByIdAndDelete(id).exec();
};

/**
 * Check if an event has any confirmed bookings.
 * Used before allowing deletion.
 *
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
export const eventHasConfirmedBookings = async (eventId) => {
  // We'll query the Booking model — imported lazily to avoid circular deps
  const { default: Booking } = await import('../models/booking.model.js');
  const count = await Booking.countDocuments({ event: eventId, status: 'confirmed' });
  return count > 0;
};
