/**
 * @file booking.routes.js
 * @description Booking route definitions.
 */

import { Router } from 'express';
import * as bookingController from '../controllers/booking.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
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
  seatLockRateLimiter,
  validate(lockSeatsSchema),
  bookingController.lockSeats
);

router.post(
  '/confirm',
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
router.get(
  '/:bookingId/ticket',
  validate(bookingParamSchema),
  bookingController.downloadTicketPdf
);

export default router;
