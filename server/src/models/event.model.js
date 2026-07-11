/**
 * @file event.model.js
 * @description Mongoose schema for the Event collection.
 *
 * CRITICAL DESIGN DECISIONS:
 * ---------------------------
 *
 * 1. EMBEDDED SEAT LAYOUT (not a separate collection)
 *    ──────────────────────────────────────────────────
 *    The seat layout is stored as an embedded array inside each Event document,
 *    not as a separate Seats collection with foreign keys.
 *
 *    WHY EMBEDDING?
 *    - A seat belongs to exactly ONE event — it has no independent existence.
 *    - When you fetch event details to show the seat map, you want seats in
 *      the same query — not a second trip to a Seats collection (N+1 problem).
 *    - In SQL, you'd have an events table + seats table with a JOIN.
 *      In MongoDB, embed what you always read together.
 *
 *    TRADEOFF:
 *    - Each Event document can grow large (a venue with 5,000 seats = large doc).
 *    - MongoDB has a 16MB document limit. 5,000 seats × ~100 bytes/seat = ~500KB.
 *      Well within limits for typical venues.
 *    - For stadium-scale events (50,000+ seats), we'd shard the seat layout
 *      into a separate collection. For this system, embedding is correct.
 *
 * 2. SEAT LOCKING STRATEGY
 *    ─────────────────────────
 *    seat.status: 'available' | 'locked' | 'booked'
 *    seat.lockedBy: userId (null if available)
 *    seat.lockedAt: Date (null if available)
 *
 *    When a customer selects seats:
 *      → Redis lock is set (TTL: 10 min)  ← primary, fast
 *      → seat.status = 'locked' in MongoDB ← secondary, persistent
 *
 *    Why both Redis AND MongoDB?
 *    - Redis: sub-millisecond lock check for concurrent users
 *    - MongoDB: persistent state visible to organizers, queryable for analytics
 *    - If Redis goes down, the DB state prevents double booking
 *
 * 3. DENORMALISED availableSeats COUNT
 *    ──────────────────────────────────
 *    We store `availableSeats` as a separate top-level field (not computed
 *    from the seat array). This allows:
 *    - Fast filtering: GET /events?city=Mumbai (don't want to count array items)
 *    - Atomic decrements via $inc operator during booking
 *    - Index on availableSeats for "show events with seats available" queries
 *
 * 4. ORGANIZER REFERENCE (not embedding)
 *    ─────────────────────────────────────
 *    The organizer field is a reference (ObjectId) to the User document.
 *    Events don't embed organizer data because:
 *    - If the organizer updates their name, we'd need to update all their events
 *    - We .populate('organizer') only when we need the organizer's details
 */

import mongoose from 'mongoose';
import { ALL_EVENT_STATUSES, EVENT_STATUS, ALL_SEAT_STATUSES, SEAT_STATUS } from '../constants/eventStatus.js';

// ─── Seat Sub-Schema ──────────────────────────────────────────────────────────
const seatSchema = new mongoose.Schema(
  {
    seatId: {
      type: String,
      required: true,
      // Composite identifier: row + seatNumber (e.g. "A-1", "B-12")
    },
    seatNumber: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ALL_SEAT_STATUSES,
      default: SEAT_STATUS.AVAILABLE,
    },
    // Who locked this seat (null if available/booked)
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // When the lock was placed (used to compute lock expiry)
    lockedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false } // Seats don't need their own ObjectId — seatId is the identifier
);

// ─── Row Sub-Schema ───────────────────────────────────────────────────────────
const rowSchema = new mongoose.Schema(
  {
    row: {
      type: String,
      required: true, // e.g. "A", "B", "VIP"
    },
    seats: [seatSchema],
  },
  { _id: false }
);

// ─── Event Schema ─────────────────────────────────────────────────────────────
const eventSchema = new mongoose.Schema(
  {
    // ── Core Details ────────────────────────────────────────────────────────
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Event description is required'],
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },

    // ── Classification ───────────────────────────────────────────────────────
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Event category is required'],
    },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Organizer is required'],
    },

    // ── Location ─────────────────────────────────────────────────────────────
    venue: {
      type: String,
      required: [true, 'Venue name is required'],
      trim: true,
      maxlength: [200, 'Venue name cannot exceed 200 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [100, 'City name cannot exceed 100 characters'],
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Scheduling ────────────────────────────────────────────────────────────
    date: {
      type: Date,
      required: [true, 'Event date is required'],
    },
    time: {
      type: String,
      required: [true, 'Event time is required'],
      // Format: "HH:MM" (24-hour) — stored as string for display flexibility
    },
    duration: {
      type: Number, // Duration in minutes
      default: null,
    },

    // ── Media ─────────────────────────────────────────────────────────────────
    banner: {
      url: { type: String, default: null },         // Cloudinary secure URL
      publicId: { type: String, default: null },    // For deletion/replacement
    },

    // ── Ticketing ─────────────────────────────────────────────────────────────
    ticketPrice: {
      type: Number,
      required: [true, 'Ticket price is required'],
      min: [0, 'Price cannot be negative'],
    },
    totalSeats: {
      type: Number,
      required: [true, 'Total seats is required'],
      min: [1, 'Event must have at least 1 seat'],
    },
    // Denormalised count — updated atomically during booking/cancellation
    availableSeats: {
      type: Number,
      min: [0, 'Available seats cannot be negative'],
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: {
        values: ALL_EVENT_STATUSES,
        message: `Status must be one of: ${ALL_EVENT_STATUSES.join(', ')}`,
      },
      default: EVENT_STATUS.DRAFT,
    },

    // ── Rating Aggregation (Sprint 8) ─────────────────────────────────────────
    // Denormalised from the Review collection.
    // Updated automatically by review.model.js post-save/update/delete hooks.
    //
    // WHY STORE ON EVENT?
    //   Fast filter queries: GET /events?minRating=4 uses an index.
    //   Without this, every events list query would need an expensive
    //   cross-collection GROUP BY to compute the average.
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
      distribution: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
    },

    // ── Seat Layout ───────────────────────────────────────────────────────────
    // Embedded array of rows, each containing an array of seats
    seatLayout: [rowSchema],
  },
  {
    timestamps: true,
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

/**
 * isSoldOut: computed property — no need to store separately
 * Returns true when all seats are booked/locked
 */
eventSchema.virtual('isSoldOut').get(function () {
  return this.availableSeats === 0;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
eventSchema.index({ title: 'text', venue: 'text' }); // Full-text search
eventSchema.index({ city: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ date: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ organizer: 1 });
eventSchema.index({ availableSeats: 1 });
eventSchema.index({ 'rating.average': -1 }); // Sprint 8: filter by min rating
// Compound index for the most common query: published events in a city filtered by date
eventSchema.index({ status: 1, city: 1, date: 1 });

// ─── Pre-Save Hook ────────────────────────────────────────────────────────────
// Sync availableSeats with totalSeats on first creation
eventSchema.pre('save', function (next) {
  if (this.isNew && this.availableSeats === undefined) {
    this.availableSeats = this.totalSeats;
  }
  next();
});

const Event = mongoose.model('Event', eventSchema);
export default Event;
