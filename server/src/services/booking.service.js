/**
 * @file booking.service.js
 * @description Seat selection and booking business logic.
 *
 * THE COMPLETE BOOKING FLOW:
 * ---------------------------
 *
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  Step 1: LOCK SEATS (POST /bookings/lock-seats)                 │
 *  │                                                                 │
 *  │  1. Validate event exists + is published                        │
 *  │  2. Validate requested seats exist + are 'available' in DB      │
 *  │  3. Attempt Redis SET NX locks (atomic, all-or-nothing)         │
 *  │  4. If any seat already locked → release acquired, return 409   │
 *  │  5. Update seat status in MongoDB: available → locked           │
 *  │  6. Return { lockedSeats, expiresAt } to frontend               │
 *  │     Frontend starts a 10-minute countdown timer                 │
 *  └─────────────────────────────────────────────────────────────────┘
 *                              │
 *                     User fills payment form
 *                              │
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  Step 2: CONFIRM BOOKING (POST /bookings/confirm)               │
 *  │                                                                 │
 *  │  1. Verify user hasn't already booked this event                │
 *  │  2. Verify Redis locks are still valid (not expired, owned by   │
 *  │     this user — not someone who re-locked after expiry)         │
 *  │  3. ── START MONGOOSE TRANSACTION ──────────────────────────── │
 *  │     a. Create Booking document with seat snapshot               │
 *  │     b. Update seat status: locked → booked (in Event document)  │
 *  │     c. Atomically decrement Event.availableSeats by seat count  │
 *  │  4. ── COMMIT TRANSACTION ──────────────────────────────────── │
 *  │  5. Release Redis locks (no longer needed — seats are booked)   │
 *  │  6. Generate QR code with booking payload                       │
 *  │  7. Save QR code to booking document                            │
 *  │  8. Send confirmation email (non-blocking)                      │
 *  │  9. Return { booking, qrCode }                                  │
 *  └─────────────────────────────────────────────────────────────────┘
 *
 * WHY MONGOOSE TRANSACTIONS?
 * ---------------------------
 * Without a transaction, steps 3a and 3b are independent:
 *   - Booking created ✅
 *   - Power cut before seat status update ❌
 *   - Result: booking exists but seat still shows 'available'
 *            → second user can lock and book the same seat
 *
 * With a transaction, either BOTH succeed or NEITHER does.
 * NOTE: Mongoose transactions require a MongoDB Replica Set.
 *       MongoDB Atlas enables this automatically.
 *       Local standalone MongoDB does NOT support transactions.
 *
 * CANCELLATION FLOW:
 * -------------------
 *  1. Validate booking belongs to this user + is cancellable
 *  2. ── START TRANSACTION ──
 *     a. Update booking status: confirmed → cancelled
 *     b. Update seat status: booked → available (in Event document)
 *     c. Increment Event.availableSeats
 *  3. ── COMMIT TRANSACTION ──
 *  4. Send cancellation email (non-blocking)
 */

import mongoose from 'mongoose';
import * as bookingRepo from '../repositories/booking.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import { lockSeats, releaseSeats, verifyLocks } from '../utils/seatLock.js';
import { generateBookingId } from '../utils/generateBookingId.js';
import { generateQrCode } from '../utils/generateQrCode.js';
import { addEmailJob } from '../jobs/queues/email.queue.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError,
} from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';
import { EVENT_STATUS, SEAT_STATUS, BOOKING_STATUS } from '../constants/eventStatus.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('BookingService');


// ─── Helper: Find and validate seats from event layout ────────────────────────
/**
 * Given an event document and a list of seatIds, returns the seat objects
 * from the embedded layout. Throws if any seat doesn't exist or isn't available.
 *
 * @param {Document} event - Full event document with seatLayout
 * @param {string[]} seatIds - e.g. ["A-1", "B-3"]
 * @returns {Array<{row: string, seatId: string, seatNumber: number}>}
 */
const resolveSeatDetails = (event, seatIds) => {
  const resolvedSeats = [];

  for (const seatId of seatIds) {
    let found = false;

    for (const rowObj of event.seatLayout) {
      const seat = rowObj.seats.find((s) => s.seatId === seatId);
      if (seat) {
        if (seat.status !== SEAT_STATUS.AVAILABLE) {
          throw new ConflictError(
            `Seat ${seatId} is not available (status: ${seat.status}).`
          );
        }
        resolvedSeats.push({
          seatId: seat.seatId,
          row: rowObj.row,
          seatNumber: seat.seatNumber,
        });
        found = true;
        break;
      }
    }

    if (!found) {
      throw new ValidationError(`Seat ${seatId} does not exist in this event.`);
    }
  }

  return resolvedSeats;
};

// ─── Step 1: Lock Seats ───────────────────────────────────────────────────────

/**
 * Locks seats in Redis for 10 minutes to hold them during checkout.
 *
 * @param {string} eventId
 * @param {string[]} seatIds
 * @param {string} userId
 * @returns {{ lockedSeats: string[], expiresAt: Date, ttlSeconds: number }}
 */
export const lockEventSeats = async (eventId, seatIds, userId) => {
  // ── Validate event ────────────────────────────────────────────────────────
  const event = await eventRepo.findEventById(eventId);
  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  if (event.status !== EVENT_STATUS.PUBLISHED) {
    throw new ValidationError('This event is not available for booking.');
  }
  if (event.availableSeats < seatIds.length) {
    throw new ConflictError(MESSAGES.BOOKING.SEAT_UNAVAILABLE);
  }

  // ── Validate seats exist and are available in DB ─────────────────────────
  resolveSeatDetails(event, seatIds); // Throws if any seat invalid/unavailable

  // ── Attempt Redis lock (atomic, all-or-nothing) ───────────────────────────
  const { success, failedSeat } = await lockSeats(eventId, seatIds, userId.toString());

  if (!success) {
    if (failedSeat) {
      throw new ConflictError(
        `Seat ${failedSeat} was just taken by another user. Please choose different seats.`
      );
    }
    throw new ConflictError(MESSAGES.BOOKING.SEAT_UNAVAILABLE);
  }

  // ── Update seat status in MongoDB: available → locked ────────────────────
  // This is a secondary record — Redis is the primary lock.
  // We do this so organizers can see which seats are "held" on the seat map.
  const seatUpdateOps = seatIds.map((seatId) => ({
    updateOne: {
      filter: { _id: event._id, 'seatLayout.seats.seatId': seatId },
      update: {
        $set: {
          'seatLayout.$[row].seats.$[seat].status': SEAT_STATUS.LOCKED,
          'seatLayout.$[row].seats.$[seat].lockedBy': userId,
          'seatLayout.$[row].seats.$[seat].lockedAt': new Date(),
        },
      },
      arrayFilters: [
        { 'row.seats': { $elemMatch: { seatId: { $in: seatIds } } } },
        { 'seat.seatId': seatId },
      ],
    },
  }));

  // Use bulkWrite for efficient batch update
  const Event = (await import('../models/event.model.js')).default;
  await Event.bulkWrite(seatUpdateOps);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  logger.info(`[Booking] ${seatIds.length} seat(s) locked for user ${userId} on event ${eventId}`);

  return {
    lockedSeats: seatIds,
    expiresAt,
    ttlSeconds: 600,
  };
};

// ─── Step 2: Confirm Booking ──────────────────────────────────────────────────

/**
 * Confirms a booking after seats have been locked.
 * Uses a Mongoose transaction to atomically create the booking + update seats.
 *
 * @param {string} eventId
 * @param {string[]} seatIds
 * @param {string} userId
 * @returns {{ booking: Document, qrCode: string }}
 */
export const confirmBooking = async (eventId, seatIds, userId) => {
  // ── Double-booking check ──────────────────────────────────────────────────
  const alreadyBooked = await bookingRepo.userHasBookingForEvent(userId, eventId);
  if (alreadyBooked) {
    throw new ConflictError(MESSAGES.BOOKING.DOUBLE_BOOKING);
  }

  // ── Verify Redis locks are still valid ────────────────────────────────────
  const { valid, expiredSeat } = await verifyLocks(eventId, seatIds, userId.toString());
  if (!valid) {
    throw new ConflictError(
      expiredSeat
        ? `Lock on seat ${expiredSeat} has expired. Please select seats again.`
        : MESSAGES.BOOKING.SEATS_LOCK_EXPIRED
    );
  }

  // ── Fetch event for seat details and price snapshot ───────────────────────
  const event = await eventRepo.findEventById(eventId);
  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);

  const resolvedSeats = resolveSeatDetails(event, seatIds);
  const totalAmount = event.ticketPrice * seatIds.length;
  const bookingId = generateBookingId();

  // ── MONGOOSE TRANSACTION ──────────────────────────────────────────────────
  const session = await mongoose.startSession();
  let confirmedBooking;

  try {
    await session.withTransaction(async () => {
      // a. Create the Booking document
      confirmedBooking = await bookingRepo.createBooking(
        {
          bookingId,
          user: userId,
          event: eventId,
          seats: resolvedSeats,
          ticketPriceAtBooking: event.ticketPrice,
          totalAmount,
          status: BOOKING_STATUS.CONFIRMED,
          paymentStatus: 'paid', // Simulated payment
        },
        session
      );

      // b. Update seat status: locked → booked in Event seatLayout
      const Event = (await import('../models/event.model.js')).default;
      const bulkOps = seatIds.map((seatId) => ({
        updateOne: {
          filter: { _id: event._id, 'seatLayout.seats.seatId': seatId },
          update: {
            $set: {
              'seatLayout.$[row].seats.$[seat].status': SEAT_STATUS.BOOKED,
              'seatLayout.$[row].seats.$[seat].lockedBy': null,
              'seatLayout.$[row].seats.$[seat].lockedAt': null,
            },
          },
          arrayFilters: [
            { 'row.seats': { $elemMatch: { seatId: { $in: seatIds } } } },
            { 'seat.seatId': seatId },
          ],
        },
      }));
      await Event.bulkWrite(bulkOps, { session });

      // c. Atomically decrement availableSeats
      await Event.findByIdAndUpdate(
        eventId,
        { $inc: { availableSeats: -seatIds.length } },
        { session }
      );
    });

    logger.info(`[Booking] Confirmed booking ${bookingId} for user ${userId}`);
  } finally {
    await session.endSession();
  }

  // ── Release Redis locks (seats are now permanently booked) ────────────────
  await releaseSeats(eventId, seatIds, userId.toString());

  // ── Generate QR code ──────────────────────────────────────────────────────
  const qrCode = await generateQrCode({
    bookingId,
    userId,
    eventId,
    seats: resolvedSeats,
  });

  // Save QR code to booking (non-blocking update)
  await bookingRepo.updateBookingById(confirmedBooking._id, { qrCode });
  confirmedBooking.qrCode = qrCode;

  // ── Enqueue confirmation email (reliable, retryable via BullMQ) ─────────
  // Replaces the old fire-and-forget sendEmail() call.
  // The worker fetches data from DB, builds the template, and sends via SMTP.
  const userDoc = await import('../models/user.model.js').then((m) =>
    m.default.findById(userId).select('name email')
  );

  if (userDoc) {
    await addEmailJob('booking_confirmation', {
      to: userDoc.email,
      name: userDoc.name,
      event: {
        title: event.title,
        date: event.date,
        time: event.time,
        venue: event.venue,
        city: event.city,
      },
      booking: {
        bookingId: confirmedBooking.bookingId,
        seats: confirmedBooking.seats,
        totalAmount: confirmedBooking.totalAmount,
      },
      qrCode,
    });

    // ── Schedule 24-hour reminder ────────────────────────────────────────
    // Calculate delay: event.date - 24h - now
    // If event is less than 24h away, skip the reminder.
    const msUntilReminder = new Date(event.date).getTime() - Date.now() - 24 * 60 * 60 * 1000;
    if (msUntilReminder > 0) {
      await addEmailJob(
        'event_reminder',
        {
          to: userDoc.email,
          name: userDoc.name,
          event: {
            title: event.title,
            date: event.date,
            time: event.time,
            venue: event.venue,
            city: event.city,
          },
          booking: {
            bookingId: confirmedBooking.bookingId,
            seats: confirmedBooking.seats,
          },
        },
        { delay: msUntilReminder }
      );
      logger.info(`[Booking] Reminder scheduled ${Math.round(msUntilReminder / 3600000)}h from now for booking ${bookingId}`);
    }
  }

  return { booking: confirmedBooking, qrCode };
};

// ─── Get User's Booking History ───────────────────────────────────────────────

/**
 * Returns paginated booking history for the current user.
 *
 * @param {string} userId
 * @param {object} queryParams - req.query
 * @returns {{ bookings, meta }}
 */
export const getMyBookings = async (userId, queryParams) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams);
  const { bookings, total } = await bookingRepo.findBookingsByUser(userId, {
    skip,
    limit,
    sortObj,
  });
  return { bookings, meta: buildPaginationMeta(total, page, limit) };
};

// ─── Get Single Booking ───────────────────────────────────────────────────────

/**
 * Returns a single booking by its human-readable bookingId.
 * Validates that the booking belongs to the requesting user (or admin).
 *
 * @param {string} bookingId - e.g. "TKT-20240715-X7K2M"
 * @param {string} userId - Requesting user's ID
 * @param {string} userRole - For admin override
 * @returns {Promise<Document>}
 */
export const getBookingById = async (bookingId, userId, userRole) => {
  const booking = await bookingRepo.findBookingByBookingId(bookingId);

  if (!booking) throw new NotFoundError(MESSAGES.BOOKING.NOT_FOUND);

  // Non-admins can only view their own bookings
  if (userRole !== 'admin' && booking.user._id.toString() !== userId.toString()) {
    throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
  }

  return booking;
};

// ─── Cancel Booking ───────────────────────────────────────────────────────────

/**
 * Cancels a booking and releases the seats atomically.
 *
 * Business rules:
 *  - Only the booking owner (or admin) can cancel.
 *  - Cannot cancel an already-cancelled booking.
 *  - Cannot cancel if the event has already passed.
 *
 * @param {string} bookingId
 * @param {string} userId
 * @param {string} userRole
 * @param {string} [reason]
 */
export const cancelBooking = async (bookingId, userId, userRole, reason) => {
  const booking = await bookingRepo.findBookingByBookingId(bookingId);

  if (!booking) throw new NotFoundError(MESSAGES.BOOKING.NOT_FOUND);

  // Ownership check
  if (userRole !== 'admin' && booking.user._id.toString() !== userId.toString()) {
    throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
  }

  // Already cancelled
  if (booking.status === BOOKING_STATUS.CANCELLED) {
    throw new ValidationError(MESSAGES.BOOKING.CANNOT_CANCEL);
  }

  // Event has passed — cannot cancel
  const event = await eventRepo.findEventById(booking.event._id || booking.event);
  if (event && new Date(event.date) < new Date()) {
    throw new ValidationError('Cannot cancel a booking for a past event.');
  }

  const seatIds = booking.seats.map((s) => s.seatId);

  // ── TRANSACTION ───────────────────────────────────────────────────────────
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // a. Mark booking as cancelled
      await bookingRepo.updateBookingById(
        booking._id,
        {
          status: BOOKING_STATUS.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason || null,
        },
        session
      );

      // b. Release seats: booked → available
      const EventModel = (await import('../models/event.model.js')).default;
      const bulkOps = seatIds.map((seatId) => ({
        updateOne: {
          filter: { _id: booking.event._id || booking.event, 'seatLayout.seats.seatId': seatId },
          update: {
            $set: {
              'seatLayout.$[row].seats.$[seat].status': SEAT_STATUS.AVAILABLE,
              'seatLayout.$[row].seats.$[seat].lockedBy': null,
              'seatLayout.$[row].seats.$[seat].lockedAt': null,
            },
          },
          arrayFilters: [
            { 'row.seats': { $elemMatch: { seatId: { $in: seatIds } } } },
            { 'seat.seatId': seatId },
          ],
        },
      }));
      await EventModel.bulkWrite(bulkOps, { session });

      // c. Restore availableSeats count
      await EventModel.findByIdAndUpdate(
        booking.event._id || booking.event,
        { $inc: { availableSeats: seatIds.length } },
        { session }
      );
    });

    logger.info(`[Booking] Cancelled booking ${bookingId} (${seatIds.length} seat(s) released)`);
  } finally {
    await session.endSession();
  }

  // ── Enqueue cancellation email ────────────────────────────────────────────
  const userDoc = await import('../models/user.model.js').then((m) =>
    m.default.findById(booking.user._id || booking.user).select('name email')
  );
  const eventDoc = await eventRepo.findEventById(booking.event._id || booking.event);

  if (userDoc && eventDoc) {
    await addEmailJob('booking_cancellation', {
      to: userDoc.email,
      name: userDoc.name,
      event: {
        title: eventDoc.title,
        date: eventDoc.date,
        time: eventDoc.time,
        venue: eventDoc.venue,
        city: eventDoc.city,
      },
      booking: {
        bookingId,
        seats: booking.seats,
        totalAmount: booking.totalAmount,
        cancellationReason: reason || null,
      },
    });
  }
};


