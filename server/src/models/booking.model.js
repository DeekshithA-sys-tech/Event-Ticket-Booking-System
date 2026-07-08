/**
 * @file booking.model.js
 * @description Mongoose schema for the Booking collection.
 *
 * NOTE: This is a PLACEHOLDER model created in Sprint 4 to satisfy
 * the event repository's booking check (eventHasConfirmedBookings).
 * The full schema with all fields will be built in Sprint 5.
 *
 * DO NOT add business logic against this model until Sprint 5.
 */

import mongoose from 'mongoose';
import { ALL_BOOKING_STATUSES, BOOKING_STATUS, ALL_PAYMENT_STATUSES, PAYMENT_STATUS } from '../constants/eventStatus.js';

const bookingSchema = new mongoose.Schema(
  {
    // Human-readable booking ID: "TKT-20240715-ABC123"
    bookingId: {
      type: String,
      unique: true,
      sparse: true, // Allow null during Sprint 4, required from Sprint 5
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    // Booked seats snapshot (not a reference — seats can change on the event)
    seats: [
      {
        seatId: String,
        row: String,
        seatNumber: Number,
        _id: false,
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ALL_BOOKING_STATUSES,
      default: BOOKING_STATUS.PENDING,
    },
    paymentStatus: {
      type: String,
      enum: ALL_PAYMENT_STATUSES,
      default: PAYMENT_STATUS.PENDING,
    },
    qrCode: { type: String, default: null },
    pdfTicket: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ event: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ bookingId: 1 }, { sparse: true });

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;
