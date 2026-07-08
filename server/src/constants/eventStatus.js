/**
 * @file eventStatus.js
 * @description Event lifecycle status constants.
 *
 * WHY MODEL LIFECYCLE STATES AS CONSTANTS?
 * -----------------------------------------
 * Events go through a defined lifecycle:
 *
 *   draft → published → completed
 *            ↓
 *         cancelled
 *
 * An organizer creates an event as 'draft' (not visible to public).
 * Once ready, they publish it (or an admin approves it → published).
 * After the event date passes, a cleanup job marks it 'completed'.
 * An organizer or admin can cancel at any time.

 * BOOKING STATUS STATES:
 * -----------------------
 * Booking has its own lifecycle: pending → confirmed → cancelled
 * These are co-located here for discoverability.
 */

export const EVENT_STATUS = Object.freeze({
  DRAFT: 'draft',           // Created but not visible to public
  PUBLISHED: 'published',   // Visible and bookable
  CANCELLED: 'cancelled',   // Event cancelled, bookings should be refunded
  COMPLETED: 'completed',   // Event has passed
});

export const ALL_EVENT_STATUSES = Object.values(EVENT_STATUS);

// ─── Seat Status ──────────────────────────────────────────────────────────────
export const SEAT_STATUS = Object.freeze({
  AVAILABLE: 'available', // Free to book
  LOCKED: 'locked',       // Temporarily held during booking flow (Redis TTL)
  BOOKED: 'booked',       // Permanently booked
});

export const ALL_SEAT_STATUSES = Object.values(SEAT_STATUS);

// ─── Booking Status ───────────────────────────────────────────────────────────
export const BOOKING_STATUS = Object.freeze({
  PENDING: 'pending',       // Seats locked, awaiting confirmation
  CONFIRMED: 'confirmed',   // Payment received, ticket issued
  CANCELLED: 'cancelled',   // Cancelled by user or organizer
});

export const ALL_BOOKING_STATUSES = Object.values(BOOKING_STATUS);

// ─── Payment Status ───────────────────────────────────────────────────────────
export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
});

export const ALL_PAYMENT_STATUSES = Object.values(PAYMENT_STATUS);
