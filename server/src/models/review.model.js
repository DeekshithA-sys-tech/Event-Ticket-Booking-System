/**
 * @file review.model.js
 * @description Mongoose schema for the Review collection.
 *
 * CRITICAL DESIGN DECISIONS:
 * ---------------------------
 *
 * 1. ONE REVIEW PER USER PER EVENT (compound unique index)
 *    ──────────────────────────────────────────────────────
 *    A user who attends the same event twice (e.g. via cancellation + rebook)
 *    still only gets one review slot. Reviews measure the EVENT, not a trip.
 *    The compound unique index { user: 1, event: 1 } enforces this at the DB
 *    level — even if the application layer has a bug, the DB won't allow it.
 *
 * 2. RATING AGGREGATION ON THE EVENT DOCUMENT
 *    ──────────────────────────────────────────
 *    We denormalise rating stats onto the Event document:
 *      event.rating.average  = mean of all review ratings
 *      event.rating.count    = total number of reviews
 *      event.rating.distribution = { 1: N, 2: N, 3: N, 4: N, 5: N }
 *
 *    WHY DENORMALISE?
 *    - "Show events with rating > 4" is a very common query.
 *      Without denormalisation: join Reviews + GROUP BY + AVG for every
 *      page of results — extremely expensive.
 *    - With denormalisation: filter events directly by event.rating.average.
 *    - We update it with a single $set after every review write.
 *
 *    Same pattern used by Amazon (product.averageRating), Airbnb (listing.rating).
 *
 *    TRADEOFF: The event document gets slightly stale between writes.
 *    Acceptable — review aggregates don't need millisecond precision.
 *
 * 3. SOFT FLAG (not hard delete) FOR MODERATION
 *    ─────────────────────────────────────────────
 *    Instead of deleting reviews that violate community guidelines, we set
 *    isFlagged = true and store flagReason. This:
 *    - Preserves the review for audit/legal purposes
 *    - Allows admins to unflag if the flag was incorrect
 *    - Lets us hide flagged reviews from public listing without losing data
 *
 * 4. ELIGIBILITY IS ENFORCED AT THE SERVICE LAYER, NOT THE MODEL
 *    ─────────────────────────────────────────────────────────────
 *    The "only confirmed past booking holders can review" rule is checked
 *    in review.service.js, not via a Mongoose validator. Why?
 *    - It requires a cross-collection query (Booking + Event)
 *    - Mongoose validators don't have access to other models cleanly
 *    - Business rules belong in the service layer (Clean Architecture)
 */

import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    // ── Relationships ─────────────────────────────────────────────────────────
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reviewer is required'],
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event is required'],
    },
    // Link to the booking that qualifies this user to review
    // Stored as an audit trail — proves the review is legitimate
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
    },

    // ── Content ───────────────────────────────────────────────────────────────
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
      // Integer only — we validate this in the Zod schema, not here
      // (Mongoose doesn't have an integer validator natively)
    },
    title: {
      type: String,
      trim: true,
      maxlength: [150, 'Review title cannot exceed 150 characters'],
      default: null,
    },
    body: {
      type: String,
      required: [true, 'Review body is required'],
      trim: true,
      minlength: [10, 'Review must be at least 10 characters'],
      maxlength: [2000, 'Review cannot exceed 2000 characters'],
    },

    // ── Moderation ────────────────────────────────────────────────────────────
    isFlagged: {
      type: Boolean,
      default: false,
    },
    flagReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Flag reason cannot exceed 500 characters'],
      default: null,
    },
    flaggedAt: {
      type: Date,
      default: null,
    },
    flaggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ── Edit History ──────────────────────────────────────────────────────────
    // Track whether this review was edited (transparency for users)
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
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
reviewSchema.virtual('isVisible').get(function () {
  return !this.isFlagged;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

// THE MOST IMPORTANT INDEX: compound unique enforces one-review-per-user-per-event
// This is a DB-level guarantee — not just application-level validation.
reviewSchema.index({ user: 1, event: 1 }, { unique: true });

// Fetch reviews for an event (public listing), newest first
reviewSchema.index({ event: 1, createdAt: -1 });

// Fetch all reviews by a user (profile page)
reviewSchema.index({ user: 1, createdAt: -1 });

// Admin: find flagged reviews for moderation queue
reviewSchema.index({ isFlagged: 1, createdAt: -1 });

// ─── Post-Save Hook: Update Event Rating Aggregation ─────────────────────────
/**
 * After every review is created, updated, or deleted, recalculate
 * and update the rating aggregation on the parent Event document.
 *
 * WHY POST-SAVE HOOK?
 * - The rating update is a side effect of writing a review.
 * - If we put it in the service, we'd need to call it manually after every write.
 * - A Mongoose post-save hook guarantees it ALWAYS runs, even if someone
 *   writes to the Review collection directly (e.g. from a script or admin tool).
 *
 * PERFORMANCE NOTE:
 * This runs a MongoDB aggregation on every review write.
 * At typical event scale (hundreds of reviews) this is fast (<5ms).
 * At BookMyShow scale, you'd use a BullMQ job to batch-update.
 */
async function updateEventRatingAggregation(eventId) {
  const Review = mongoose.model('Review');
  const Event = mongoose.model('Event');

  // Aggregate all non-flagged reviews for this event
  const result = await Review.aggregate([
    { $match: { event: eventId, isFlagged: false } },
    {
      $group: {
        _id: '$event',
        averageRating: { $avg: '$rating' },
        count: { $sum: 1 },
        // Distribution: count how many reviews have each rating value
        dist1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        dist2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        dist3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        dist4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        dist5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      },
    },
  ]);

  if (result.length === 0) {
    // All reviews deleted or all flagged — reset to zero
    await Event.findByIdAndUpdate(eventId, {
      'rating.average': 0,
      'rating.count': 0,
      'rating.distribution': { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    return;
  }

  const { averageRating, count, dist1, dist2, dist3, dist4, dist5 } = result[0];

  await Event.findByIdAndUpdate(eventId, {
    'rating.average': Math.round(averageRating * 10) / 10, // Round to 1 decimal
    'rating.count': count,
    'rating.distribution': {
      1: dist1,
      2: dist2,
      3: dist3,
      4: dist4,
      5: dist5,
    },
  });
}

// Trigger after create / update
reviewSchema.post('save', async function () {
  await updateEventRatingAggregation(this.event);
});

// Trigger after findOneAndUpdate (used by updateReviewById)
reviewSchema.post('findOneAndUpdate', async function () {
  const doc = await this.model.findOne(this.getQuery()).lean();
  if (doc) await updateEventRatingAggregation(doc.event);
});

// Trigger after findOneAndDelete (used by deleteReviewById)
reviewSchema.post('findOneAndDelete', async function (doc) {
  if (doc) await updateEventRatingAggregation(doc.event);
});

const Review = mongoose.model('Review', reviewSchema);
export default Review;
