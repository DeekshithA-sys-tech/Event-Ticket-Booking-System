/**
 * @file booking.controller.js
 * @description HTTP handlers for Booking endpoints.
 */

import * as bookingService from '../services/booking.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { generatePdfTicket } from '../utils/generatePdfTicket.js';


/**
 * @swagger
 * tags:
 *   - name: Bookings
 *     description: Seat selection, booking confirmation, and management
 */

// ─── Step 1: Lock Seats ───────────────────────────────────────────────────────

/**
 * @swagger
 * /bookings/lock-seats:
 *   post:
 *     tags: [Bookings]
 *     summary: Lock selected seats for 10 minutes
 *     description: |
 *       Acquires Redis locks on selected seats atomically.
 *       The locks are held for 10 minutes — the user must confirm
 *       the booking within this window.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventId, seatIds]
 *             properties:
 *               eventId:
 *                 type: string
 *               seatIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["A-1", "A-2"]
 *     responses:
 *       200:
 *         description: Seats locked successfully
 *       409:
 *         description: One or more seats are already taken
 */
export const lockSeats = asyncHandler(async (req, res) => {
  const { eventId, seatIds } = req.body;

  const result = await bookingService.lockEventSeats(eventId, seatIds, req.user._id);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.SEATS_LOCKED, result));
});

// ─── Step 2: Confirm Booking ──────────────────────────────────────────────────

/**
 * @swagger
 * /bookings/confirm:
 *   post:
 *     tags: [Bookings]
 *     summary: Confirm booking for locked seats
 *     description: |
 *       Must be called after /lock-seats while locks are still valid.
 *       Creates the booking atomically using a Mongoose transaction.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventId, seatIds]
 *             properties:
 *               eventId:
 *                 type: string
 *               seatIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Booking confirmed successfully
 *       409:
 *         description: Lock expired or double booking
 */
export const confirmBooking = asyncHandler(async (req, res) => {
  const { eventId, seatIds } = req.body;

  const { booking, qrCode } = await bookingService.confirmBooking(
    eventId,
    seatIds,
    req.user._id
  );

  return res
    .status(HTTP_STATUS.CREATED)
    .json(
      new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.BOOKING.CREATED, { booking, qrCode })
    );
});

// ─── My Booking History ───────────────────────────────────────────────────────

/**
 * @swagger
 * /bookings/my-bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: Get the current user's booking history
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Bookings fetched successfully
 */
export const getMyBookings = asyncHandler(async (req, res) => {
  const { bookings, meta } = await bookingService.getMyBookings(req.user._id, req.query);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.LIST_FETCHED, bookings, meta));
});

// ─── Single Booking Detail ────────────────────────────────────────────────────

/**
 * @swagger
 * /bookings/{bookingId}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking details by booking ID
 *     description: Returns booking details. Users can only view their own bookings.
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: TKT-20240715-X7K2M
 *     responses:
 *       200:
 *         description: Booking fetched successfully
 *       403:
 *         description: Cannot view another user's booking
 *       404:
 *         description: Booking not found
 */
export const getBookingById = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBookingById(
    req.params.bookingId,
    req.user._id,
    req.user.role
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.FETCHED, booking));
});

// ─── Cancel Booking ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /bookings/{bookingId}/cancel:
 *   post:
 *     tags: [Bookings]
 *     summary: Cancel a booking and release seats
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Booking cancelled successfully
 *       400:
 *         description: Booking already cancelled or event has passed
 */
export const cancelBooking = asyncHandler(async (req, res) => {
  await bookingService.cancelBooking(
    req.params.bookingId,
    req.user._id,
    req.user.role,
    req.body?.reason
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.CANCELLED));
});

// ─── Download PDF Ticket ───────────────────────────────────────────────────────

/**
 * @swagger
 * /bookings/{bookingId}/ticket:
 *   get:
 *     tags: [Bookings]
 *     summary: Download PDF ticket for a confirmed booking
 *     description: |
 *       Streams a PDF ticket file with embedded QR code.
 *       The PDF is generated on-demand and returned as a download.
 *       Only the booking owner or an admin can download the ticket.
 *     parameters:
 *       - name: bookingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: TKT-20240715-X7K2M
 *     responses:
 *       200:
 *         description: PDF file (application/pdf)
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: attachment; filename="ticket-TKT-20240715-X7K2M.pdf"
 *       403:
 *         description: Cannot download another user's ticket
 *       404:
 *         description: Booking not found
 */
export const downloadTicketPdf = asyncHandler(async (req, res) => {
  // 1. Fetch booking (ownership check built-in — throws 403 if not owner/admin)
  const booking = await bookingService.getBookingById(
    req.params.bookingId,
    req.user._id,
    req.user.role
  );

  // 2. Set PDF response headers
  const filename = `ticket-${booking.bookingId}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // 3. Stream PDF directly to response — no temp file needed
  await generatePdfTicket({
    event: booking.event,
    booking,
    user: booking.user,
    qrCode: booking.qrCode || null,
    stream: res,
  });
  // generatePdfTicket calls doc.end() which closes the response stream
});

