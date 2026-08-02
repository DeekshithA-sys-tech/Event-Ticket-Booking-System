/**
 * @file booking.routes.js
 * @description Booking route definitions.
 *
 * ACCESS CONTROL SUMMARY:
 * -----------------------
 * All booking routes require authentication.
 * Only customers and admins can book tickets.
 * Organizers cannot book tickets (they manage events).
 *
 * POST /bookings/lock-seats             → Customer only
 * POST /bookings/confirm                → Customer only
 * GET  /bookings/my-bookings            → Authenticated (any role)
 * GET  /bookings/:bookingId             → Owner or Admin
 * POST /bookings/:bookingId/cancel      → Owner or Admin
 * GET  /bookings/:bookingId/ticket      → Owner or Admin (Sprint 10: PDF download)
 *
 * NOTE ON ROUTE ORDER:
 * --------------------
 * '/lock-seats', '/confirm', '/my-bookings' must be registered
 * BEFORE '/:bookingId' — otherwise Express would treat those
 * static segments as bookingId param values.
 * '/:bookingId/ticket' is registered after '/:bookingId' — Express
 * correctly matches the full path before the shorter param pattern.
 */

import { Router } from 'express';
import * as bookingController from '../controllers/booking.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { customerOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { seatLockRateLimiter } from '../middlewares/rateLimiter.middleware.js';
import {
  lockSeatsSchema,
  confirmBookingSchema,
  cancelBookingSchema,
  bookingParamSchema,
} from '../validators/booking.validator.js';

const router = Router();

// All booking routes require authentication
router.use(protect);

// ── Static Routes (must precede /:bookingId) ──────────────────────────────────

router.post(
  '/lock-seats',
  seatLockRateLimiter, // Prevents scalper bots from hoarding seats
  customerOnly, // Organizers don't book tickets — they manage events
  validate(lockSeatsSchema),
  bookingController.lockSeats
);

router.post(
  '/confirm',
  customerOnly,
  validate(confirmBookingSchema),
  bookingController.confirmBooking
);

router.get(
  '/my-bookings',
  bookingController.getMyBookings
);

// ── Dynamic Routes ────────────────────────────────────────────────────────────

router.get(
  '/:bookingId',
  validate(bookingParamSchema),
  bookingController.getBookingById
);

router.post(
  '/:bookingId/cancel',
  validate(cancelBookingSchema),
  bookingController.cancelBooking
);

// ── Sprint 10: PDF Ticket Download ────────────────────────────────────────────
// Generates a PDF ticket on-demand and streams it to the client.
// No temp file — PDFKit pipes directly to the Express response stream.
router.get(
  '/:bookingId/ticket',
  validate(bookingParamSchema),
  bookingController.downloadTicketPdf
);

export default router;

