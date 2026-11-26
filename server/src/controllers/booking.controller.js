/**
 * @file booking.controller.js
 * @description Booking Controller (Seat Locking, Mongoose Atomic Transactions, PDF Generation, QR Delivery).
 */

import mongoose from 'mongoose';
import * as bookingRepo from '../repositories/booking.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import { lockSeats as acquireSeatLocks, releaseSeats, verifyLocks } from '../utils/seatLock.js';
import { generateBookingId } from '../utils/generateBookingId.js';
import { generateQrCode } from '../utils/generateQrCode.js';
import { generatePdfTicket } from '../utils/generatePdfTicket.js';
import { addEmailJob } from '../jobs/queues/email.queue.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError,
} from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { EVENT_STATUS, SEAT_STATUS, BOOKING_STATUS, PAYMENT_STATUS } from '../constants/eventStatus.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('BookingController');

/**
 * Validates requested seats against the event layout.
 */
const resolveSeatDetails = (event, seatIds, userId = null) => {
  const resolvedSeats = [];

  for (const seatId of seatIds) {
    let found = false;

    for (const rowObj of event.seatLayout) {
      const seat = rowObj.seats.find((s) => s.seatId === seatId);
      if (seat) {
        const isLockedBySelf =
          seat.status === SEAT_STATUS.LOCKED &&
          seat.lockedBy &&
          seat.lockedBy.toString() === userId?.toString();

        if (seat.status !== SEAT_STATUS.AVAILABLE && !isLockedBySelf) {
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

/**
 * Core atomic booking cancellation logic (reusable by Admin force-cancellations).
 */
export const cancelBookingCore = async (bookingId, userId, userRole, reason) => {
  let booking = await bookingRepo.findBookingByBookingId(bookingId);
  if (!booking && mongoose.isValidObjectId(bookingId)) {
    booking = await bookingRepo.findBookingById(bookingId);
  }

  if (!booking) throw new NotFoundError(MESSAGES.BOOKING.NOT_FOUND);

  const bookingUserId = booking.user?._id
    ? booking.user._id.toString()
    : booking.user
    ? booking.user.toString()
    : null;

  const eventOrganizerId = booking.event?.organizer?._id
    ? booking.event.organizer._id.toString()
    : booking.event?.organizer
    ? booking.event.organizer.toString()
    : null;

  const isOwner = bookingUserId && bookingUserId === userId.toString();
  const isEventOrganizer = eventOrganizerId && eventOrganizerId === userId.toString();
  const isAdmin = userRole === 'admin';

  if (!isAdmin && !isEventOrganizer && !isOwner) {
    throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
  }

  if (booking.status === BOOKING_STATUS.CANCELLED) {
    throw new ValidationError(MESSAGES.BOOKING.CANNOT_CANCEL);
  }

  const eventId = booking.event?._id ? booking.event._id : booking.event;
  const event = eventId ? await eventRepo.findEventById(eventId) : null;
  if (event && new Date(event.date) < new Date()) {
    throw new ValidationError('Cannot cancel a booking for a past event.');
  }

  const seatIds = booking.seats.map((s) => s.seatId);
  const session = await mongoose.startSession();

  const refundId = `REF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  try {
    await session.withTransaction(async () => {
      await bookingRepo.updateBookingById(
        booking._id,
        {
          status: BOOKING_STATUS.CANCELLED,
          paymentStatus: PAYMENT_STATUS.REFUNDED,
          cancelledAt: new Date(),
          cancellationReason: reason || null,
          refund: {
            refundId,
            amount: booking.totalAmount,
            refundedAt: new Date(),
            status: 'completed',
          },
        },
        session
      );

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

  // Release any lingering Redis seat locks
  try {
    const bookingUserId = booking.user?._id || booking.user || '';
    await releaseSeats(eventId, seatIds, bookingUserId.toString());
  } catch (err) {
    logger.warn(`[SeatLock] Failed to release seat locks during cancellation: ${err.message}`);
  }

  // Invalidate Redis seat cache and search cache
  try {
    const { cacheDel, cacheFlushPattern } = await import('../utils/cache.js');
    await cacheDel(`search:seats:${eventId}`);
    await cacheFlushPattern(`search:seats:${eventId}*`);
    await cacheFlushPattern(`search:events:*`);
  } catch (err) {
    logger.warn(`[Cache] Failed to invalidate cache on cancel: ${err.message}`);
  }

  // Record refund in Payment ledger
  try {
    const Payment = (await import('../models/payment.model.js')).default;
    await Payment.findOneAndUpdate(
      { booking: booking._id },
      {
        status: 'refunded',
        refund: {
          refundId,
          amount: booking.totalAmount,
          reason: reason || 'Booking cancelled by user',
          refundedAt: new Date(),
          status: 'completed',
        },
      }
    );
  } catch (err) {
    logger.warn(`[Payment] Failed to update payment ledger during refund: ${err.message}`);
  }

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
        refundId,
        refundAmount: booking.totalAmount,
        refundStatus: 'completed',
      },
    });
  }

  // Dispatch in-app notification
  try {
    const { dispatchNotification } = await import('./notification.controller.js');
    await dispatchNotification({
      user: booking.user._id || booking.user,
      type: 'booking_cancelled',
      title: 'Booking Cancelled ❌',
      message: `Your booking #${bookingId} for ${eventDoc?.title || 'Event'} has been cancelled. Refund of ₹${booking.totalAmount} has been initiated (Ref: ${refundId}).`,
      link: '/my-bookings',
      metadata: { bookingId, refundId },
    });
  } catch (err) {
    logger.warn(`[Notification] Failed to dispatch cancellation notification: ${err.message}`);
  }

  return booking;
};

// ─── Controller Handlers ───────────────────────────────────────────────────────

export const lockSeats = asyncHandler(async (req, res) => {
  const { eventId, seatIds } = req.body;
  const userId = req.user._id;

  const event = await eventRepo.findEventById(eventId);
  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  if (event.status !== EVENT_STATUS.PUBLISHED) {
    throw new ValidationError('This event is not available for booking.');
  }
  if (event.availableSeats < seatIds.length) {
    throw new ConflictError(MESSAGES.BOOKING.SEAT_UNAVAILABLE);
  }

  resolveSeatDetails(event, seatIds);

  const { success, failedSeat } = await acquireSeatLocks(eventId, seatIds, userId.toString());
  if (!success) {
    if (failedSeat) {
      throw new ConflictError(
        `Seat ${failedSeat} was just taken by another user. Please choose different seats.`
      );
    }
    throw new ConflictError(MESSAGES.BOOKING.SEAT_UNAVAILABLE);
  }

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

  const Event = (await import('../models/event.model.js')).default;
  await Event.bulkWrite(seatUpdateOps);

  // Invalidate Redis seat cache
  try {
    const { cacheDel, cacheFlushPattern } = await import('../utils/cache.js');
    await cacheDel(`search:seats:${eventId}`);
    await cacheFlushPattern(`search:seats:${eventId}*`);
  } catch (err) {
    logger.warn(`[Cache] Failed to invalidate cache on lock: ${err.message}`);
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  logger.info(`[Booking] ${seatIds.length} seat(s) locked for user ${userId} on event ${eventId}`);

  const result = {
    lockedSeats: seatIds,
    expiresAt,
    ttlSeconds: 600,
  };

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.SEATS_LOCKED, result));
});

export const confirmBooking = asyncHandler(async (req, res) => {
  const { eventId, seatIds } = req.body;
  const userId = req.user._id;

  const alreadyBooked = await bookingRepo.userHasBookingForEvent(userId, eventId);
  if (alreadyBooked) {
    throw new ConflictError(MESSAGES.BOOKING.DOUBLE_BOOKING);
  }

  const { valid, expiredSeat } = await verifyLocks(eventId, seatIds, userId.toString());
  if (!valid) {
    throw new ConflictError(
      expiredSeat
        ? `Lock on seat ${expiredSeat} has expired. Please select seats again.`
        : MESSAGES.BOOKING.SEATS_LOCK_EXPIRED
    );
  }

  const event = await eventRepo.findEventById(eventId);
  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);

  const resolvedSeats = resolveSeatDetails(event, seatIds, userId);
  const totalAmount = event.ticketPrice * seatIds.length;
  const bookingId = generateBookingId();

  const session = await mongoose.startSession();
  let confirmedBooking;

  try {
    await session.withTransaction(async () => {
      confirmedBooking = await bookingRepo.createBooking(
        {
          bookingId,
          user: userId,
          event: eventId,
          seats: resolvedSeats,
          ticketPriceAtBooking: event.ticketPrice,
          totalAmount,
          status: BOOKING_STATUS.CONFIRMED,
          paymentStatus: 'paid',
        },
        session
      );

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

  await releaseSeats(eventId, seatIds, userId.toString());

  // Invalidate Redis seat cache and search cache
  try {
    const { cacheDel, cacheFlushPattern } = await import('../utils/cache.js');
    await cacheDel(`search:seats:${eventId}`);
    await cacheFlushPattern(`search:seats:${eventId}*`);
    await cacheFlushPattern(`search:events:*`);
  } catch (err) {
    logger.warn(`[Cache] Failed to invalidate cache on confirm: ${err.message}`);
  }

  // Record initial transaction in Payment ledger
  try {
    const Payment = (await import('../models/payment.model.js')).default;
    const transactionId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    await Payment.create({
      booking: confirmedBooking._id,
      user: userId,
      amount: totalAmount,
      currency: 'INR',
      paymentMethod: req.body.paymentMethod || 'mock',
      status: 'successful',
      transactionId,
      gatewayResponse: {
        gateway: 'MockPaymentGateway',
        responseCode: 'SUCCESS',
        paidAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.warn(`[Payment] Failed to create payment transaction record: ${err.message}`);
  }

  const qrCode = await generateQrCode({
    bookingId,
    userId,
    eventId,
    seats: resolvedSeats,
  });

  await bookingRepo.updateBookingById(confirmedBooking._id, { qrCode });
  confirmedBooking.qrCode = qrCode;

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
  }

  // Dispatch in-app notification
  try {
    const { dispatchNotification } = await import('./notification.controller.js');
    await dispatchNotification({
      user: userId,
      type: 'booking_confirmed',
      title: 'Booking Confirmed! 🎟️',
      message: `Your booking #${confirmedBooking.bookingId} for "${event.title}" is confirmed. Seats: ${resolvedSeats.map((s) => s.seatId).join(', ')}.`,
      link: '/my-bookings',
      metadata: { bookingId: confirmedBooking.bookingId, eventId: event._id },
    });
  } catch (err) {
    logger.warn(`[Notification] Failed to dispatch confirmation notification: ${err.message}`);
  }

  return res
    .status(HTTP_STATUS.CREATED)
    .json(
      new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.BOOKING.CREATED, { booking: confirmedBooking, qrCode })
    );
});

export const getMyBookings = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(req.query);
  const { bookings, total } = await bookingRepo.findBookingsByUser(req.user._id, {
    skip,
    limit,
    sortObj,
  });
  const meta = buildPaginationMeta(total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.LIST_FETCHED, bookings, meta));
});

export const getBookingById = asyncHandler(async (req, res) => {
  let booking = await bookingRepo.findBookingByBookingId(req.params.bookingId);
  if (!booking && mongoose.isValidObjectId(req.params.bookingId)) {
    booking = await bookingRepo.findBookingById(req.params.bookingId);
  }

  if (!booking) throw new NotFoundError(MESSAGES.BOOKING.NOT_FOUND);

  const bookingUserId = booking.user?._id
    ? booking.user._id.toString()
    : booking.user
    ? booking.user.toString()
    : null;

  const eventOrganizerId = booking.event?.organizer?._id
    ? booking.event.organizer._id.toString()
    : booking.event?.organizer
    ? booking.event.organizer.toString()
    : null;

  const isOwner = bookingUserId && bookingUserId === req.user._id.toString();
  const isEventOrganizer = eventOrganizerId && eventOrganizerId === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isAdmin && !isEventOrganizer && !isOwner) {
    throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
  }

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.FETCHED, booking));
});

export const cancelBooking = asyncHandler(async (req, res) => {
  await cancelBookingCore(
    req.params.bookingId,
    req.user._id,
    req.user.role,
    req.body?.reason
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.CANCELLED));
});

export const downloadTicketPdf = asyncHandler(async (req, res) => {
  let booking = await bookingRepo.findBookingByBookingId(req.params.bookingId);
  if (!booking && mongoose.isValidObjectId(req.params.bookingId)) {
    booking = await bookingRepo.findBookingById(req.params.bookingId);
  }

  if (!booking) throw new NotFoundError(MESSAGES.BOOKING.NOT_FOUND);

  const bookingUserId = booking.user?._id
    ? booking.user._id.toString()
    : booking.user
    ? booking.user.toString()
    : null;

  const eventOrganizerId = booking.event?.organizer?._id
    ? booking.event.organizer._id.toString()
    : booking.event?.organizer
    ? booking.event.organizer.toString()
    : null;

  const isOwner = bookingUserId && bookingUserId === req.user._id.toString();
  const isEventOrganizer = eventOrganizerId && eventOrganizerId === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isAdmin && !isEventOrganizer && !isOwner) {
    throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
  }

  const filename = `ticket-${booking.bookingId}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await generatePdfTicket({
    event: booking.event,
    booking,
    user: booking.user,
    qrCode: booking.qrCode || null,
    stream: res,
  });
});
