/**
 * @file booking.model.js
 * @description Full Mongoose schema for the Booking collection (Sprint 5).
 *
 * PROMOTED FROM PLACEHOLDER to full schema in this sprint.
 *
 * CRITICAL DESIGN DECISIONS:
 * ---------------------------
 *
 * 1. SEATS STORED AS A SNAPSHOT, NOT A REFERENCE
 *    ─────────────────────────────────────────────
 *    We embed a `seats` array directly in the booking document rather than
 *    storing references to seat positions on the Event document.
 *
 *    WHY SNAPSHOT?
 *    - Seat layout can change: organiser adds/removes rows for future events.
 *      If we referenced event.seatLayout[row][index], the booking would break.
 *    - A booking is an immutable record: "you booked seat A-1 at this price
 *      on this date" — it should not change retroactively.
 *    - Enables fast ticket display without loading the full 5,000-seat event doc.
 *
 *    Same pattern used by Stripe (invoice snapshot), Amazon (order snapshot).
 *
 * 2. TOTAL AMOUNT SNAPSHOTTED AT BOOKING TIME
 *    ─────────────────────────────────────────
 *    We store totalAmount = ticketPrice × numberOfSeats at the time of booking.
 *    If the organiser changes ticketPrice later, existing bookings are unaffected.
 *    This is critical for financial audit trails.
 *
 * 3. BOTH bookingId AND _id
 *    ─────────────────────────
 *    _id: ObjectId — used internally for DB queries (fast, indexed)
 *    bookingId: "TKT-20240715-X7K2M" — shown to users, customer support
 *
 * 4. QR CODE AS DATA URI (for Sprint 5) / CLOUDINARY URL (from Sprint 9)
 *    In Sprint 5 we store the base64 data URI in qrCode.
 *    Sprint 9 upgrades this to a Cloudinary-hosted PNG URL.
 *    The field name stays the same — only the value format changes.
 */

import mongoose from 'mongoose';
import {
  ALL_BOOKING_STATUSES,
  BOOKING_STATUS,
  ALL_PAYMENT_STATUSES,
  PAYMENT_STATUS,
} from '../constants/eventStatus.js';

const bookingSchema = new mongoose.Schema(
  {
    // ── Identification ───────────────────────────────────────────────────────
    bookingId: {
      type: String,
      required: [true, 'Booking ID is required'],
      unique: true,
    },

    // ── Relationships ─────────────────────────────────────────────────────────
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event is required'],
    },

    // ── Seat Snapshot ─────────────────────────────────────────────────────────
    // Immutable snapshot of which seats were booked and what they looked like
    seats: [
      {
        seatId: {
          type: String,
          required: true, // e.g. "A-1"
        },
        row: {
          type: String,
          required: true, // e.g. "A"
        },
        seatNumber: {
          type: Number,
          required: true, // e.g. 1
        },
        _id: false, // Sub-documents don't need their own ObjectId
      },
    ],

    // ── Financial Snapshot ────────────────────────────────────────────────────
    ticketPriceAtBooking: {
      type: Number,
      required: true,
      min: 0,
      // Price per ticket at the time of booking — immutable after confirmation
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      // = ticketPriceAtBooking × seats.length
    },

    // ── Booking Lifecycle ─────────────────────────────────────────────────────
    status: {
      type: String,
      enum: {
        values: ALL_BOOKING_STATUSES,
        message: `Status must be one of: ${ALL_BOOKING_STATUSES.join(', ')}`,
      },
      default: BOOKING_STATUS.CONFIRMED,
      // Sprint 5 uses a synchronous flow: lock → confirm (no 'pending' in DB)
      // Future Sprint (payment gateway): pending → confirmed
    },
    paymentStatus: {
      type: String,
      enum: ALL_PAYMENT_STATUSES,
      default: PAYMENT_STATUS.PAID,
      // Sprint 5 assumes payment is always successful (simulated)
      // Sprint 7 (Razorpay): pending → paid → refunded
    },

    // ── QR Code ───────────────────────────────────────────────────────────────
    qrCode: {
      type: String,
      default: null,
      // Sprint 5: base64 data URI stored inline
      // Sprint 9: replaced with Cloudinary URL (field name stays same)
    },

    // ── Cancellation ──────────────────────────────────────────────────────────
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Cancellation reason cannot exceed 500 characters'],
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = booking confirmation time
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────
bookingSchema.virtual('seatCount').get(function () {
  return this.seats?.length || 0;
});

bookingSchema.virtual('isCancelled').get(function () {
  return this.status === BOOKING_STATUS.CANCELLED;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// User's booking history (most common query pattern)
bookingSchema.index({ user: 1, createdAt: -1 });

// Event's booking list (for organizer dashboard)
bookingSchema.index({ event: 1, status: 1 });

// Human-readable ID lookup (support/ticket scanning)
bookingSchema.index({ bookingId: 1 });

// Status-based queries (admin dashboard)
bookingSchema.index({ status: 1, createdAt: -1 });

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;
