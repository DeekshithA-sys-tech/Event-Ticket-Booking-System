/**
 * @file booking.validator.js
 * @description Zod validation schemas for Booking endpoints.
 *
 * TWO-STEP BOOKING FLOW VALIDATION:
 * -----------------------------------
 * The booking flow has two distinct steps, each with its own schema:
 *
 * Step 1 — Lock Seats (POST /bookings/lock-seats)
 *   Input: { eventId, seatIds: ["A-1", "A-2"] }
 *   Action: Acquires Redis locks on selected seats (10-min TTL)
 *   Returns: { lockedSeats, expiresAt }
 *
 * Step 2 — Confirm Booking (POST /bookings/confirm)
 *   Input: { eventId, seatIds: ["A-1", "A-2"] }
 *   Action: Verifies locks still valid → creates Booking → releases locks
 *   Returns: { booking, qrCode }
 *
 * WHY TWO STEPS?
 * ---------------
 * This mirrors the real-world booking flow:
 *   1. User selects seats on the seat map → seats are "held" (locked)
 *   2. User fills in payment details → booking confirmed (locks released)
 *
 * Without step 1, a user might fill in payment details for 5 minutes
 * only to discover at step 2 that someone else booked the seats.
 * With step 1, the seats are guaranteed to be theirs for 10 minutes.
 */

import { z } from 'zod';

// Reusable seat ID list schema
const seatIdsSchema = z
  .array(z.string().min(1, 'Seat ID cannot be empty'))
  .min(1, 'Please select at least one seat')
  .max(10, 'Cannot book more than 10 seats at once');

// ─── Step 1: Lock Seats ───────────────────────────────────────────────────────
export const lockSeatsSchema = z.object({
  body: z.object({
    eventId: z.string({ required_error: 'Event ID is required' }).min(1),
    seatIds: seatIdsSchema,
  }),
});

// ─── Step 2: Confirm Booking ──────────────────────────────────────────────────
export const confirmBookingSchema = z.object({
  body: z.object({
    eventId: z.string({ required_error: 'Event ID is required' }).min(1),
    seatIds: seatIdsSchema,
  }),
});

// ─── Cancel Booking ───────────────────────────────────────────────────────────
export const cancelBookingSchema = z.object({
  params: z.object({
    bookingId: z.string().min(1, 'Booking ID is required'),
  }),
  body: z.object({
    reason: z
      .string()
      .trim()
      .max(500, 'Reason cannot exceed 500 characters')
      .optional(),
  }).optional().default({}),
});

// ─── Booking ID Param ─────────────────────────────────────────────────────────
export const bookingParamSchema = z.object({
  params: z.object({
    bookingId: z.string().min(1, 'Booking ID is required'),
  }),
});
