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
import { sendEmail } from '../utils/sendEmail.js';
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

  // ── Send confirmation email (non-blocking) ────────────────────────────────
  const userDoc = await import('../models/user.model.js').then((m) =>
    m.default.findById(userId).select('name email')
  );

  if (userDoc) {
    sendEmail({
      to: userDoc.email,
      subject: `Booking Confirmed: ${event.title} 🎟`,
      html: bookingConfirmationTemplate(userDoc.name, event, confirmedBooking, qrCode),
    }).catch((err) =>
      logger.warn(`[Booking] Email failed for booking ${bookingId}: ${err.message}`)
    );
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
};

// ─── Email Template ───────────────────────────────────────────────────────────
/**
 * Booking confirmation email HTML template.
 * Embedded inline for Sprint 5; will move to template files in Sprint 10.
 */
const bookingConfirmationTemplate = (name, event, booking, qrCode) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #6366f1; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
    .body { padding: 32px; background: #f9fafb; }
    .info-box { background: white; border-radius: 8px; padding: 20px; margin: 16px 0; border: 1px solid #e5e7eb; }
    .label { color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: bold; }
    .value { color: #111827; font-size: 16px; margin-top: 4px; margin-bottom: 12px; }
    .qr-container { text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 16px 0; }
    .booking-id { font-family: monospace; font-size: 20px; font-weight: bold; color: #6366f1; letter-spacing: 2px; }
    .footer { padding: 16px; text-align: center; color: #9ca3af; font-size: 12px; }
    .seat-badge { display: inline-block; background: #6366f1; color: white; padding: 4px 10px; border-radius: 20px; margin: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h2>🎟 Booking Confirmed!</h2>
    <p style="margin:0; opacity:0.9">Your tickets are ready</p>
  </div>
  <div class="body">
    <p>Hi <strong>${name}</strong>, your booking has been confirmed! 🎉</p>
    
    <div class="info-box">
      <div class="label">Booking ID</div>
      <div class="booking-id">${booking.bookingId}</div>
      
      <div class="label">Event</div>
      <div class="value">${event.title}</div>
      
      <div class="label">Date & Time</div>
      <div class="value">${new Date(event.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${event.time}</div>
      
      <div class="label">Venue</div>
      <div class="value">${event.venue}, ${event.city}</div>
      
      <div class="label">Your Seats</div>
      <div class="value">
        ${booking.seats.map((s) => `<span class="seat-badge">Row ${s.row} · Seat ${s.seatNumber}</span>`).join('')}
      </div>
      
      <div class="label">Total Paid</div>
      <div class="value">₹${booking.totalAmount.toLocaleString('en-IN')}</div>
    </div>
    
    <div class="qr-container">
      <p style="color:#6b7280; margin-bottom: 12px;">Present this QR code at the venue entrance</p>
      <img src="${qrCode}" alt="QR Code" style="width: 200px; height: 200px;" />
    </div>
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} Event Ticket Booking. All rights reserved.</p>
    <p>Keep this email as your ticket. Arrive 30 minutes before the event.</p>
  </div>
</body>
</html>
`;
