/**
 * @file review.repository.js
 * @description All MongoDB operations for the Review collection.
 */

import Review from '../models/review.model.js';

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Get paginated reviews for an event.
 * By default excludes flagged reviews (public view).
 * Pass includeFlagged=true for admin moderation view.
 *
 * SORT MODES:
 *   newest  → createdAt: -1  (default)
 *   oldest  → createdAt:  1
 *   highest → rating: -1, createdAt: -1
 *   lowest  → rating:  1, createdAt: -1
 *
 * @param {string} eventId
 * @param {object} options
 * @returns {Promise<{ reviews: object[], total: number }>}
 */
export const findReviewsByEvent = async (
  eventId,
  { skip = 0, limit = 10, sort = 'newest', includeFlagged = false } = {}
) => {
  const sortMap = {
    newest:  { createdAt: -1 },
    oldest:  { createdAt:  1 },
    highest: { rating: -1, createdAt: -1 },
    lowest:  { rating:  1, createdAt: -1 },
  };
  const sortObj = sortMap[sort] || sortMap.newest;

  const filter = { event: eventId };
  if (!includeFlagged) filter.isFlagged = false;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name avatar')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    Review.countDocuments(filter),
  ]);

  return { reviews, total };
};

/**
 * Find a single review by its ObjectId.
 * @param {string} reviewId
 * @returns {Promise<Document|null>}
 */
export const findReviewById = async (reviewId) => {
  return Review.findById(reviewId)
    .populate('user', 'name avatar')
    .populate('event', 'title date')
    .exec();
};

/**
 * Find a user's review for a specific event.
 * Used for: duplicate check + fetching the user's own review.
 *
 * @param {string} userId
 * @param {string} eventId
 * @returns {Promise<Document|null>}
 */
export const findUserReviewForEvent = async (userId, eventId) => {
  return Review.findOne({ user: userId, event: eventId }).exec();
};

/**
 * Get all flagged reviews (admin moderation queue).
 * @param {object} options
 * @returns {Promise<{ reviews: object[], total: number }>}
 */
export const findFlaggedReviews = async ({ skip = 0, limit = 20 } = {}) => {
  const filter = { isFlagged: true };
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name email')
      .populate('event', 'title')
      .populate('flaggedBy', 'name')
      .sort({ flaggedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    Review.countDocuments(filter),
  ]);
  return { reviews, total };
};

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Create a new review.
 * The compound unique index { user, event } prevents duplicates at DB level.
 *
 * @param {object} reviewData
 * @returns {Promise<Document>}
 */
export const createReview = async (reviewData) => {
  return Review.create(reviewData);
};

/**
 * Update a review's content (rating, title, body).
 * Sets isEdited=true and editedAt=now automatically.
 *
 * @param {string} reviewId
 * @param {object} updates - { rating?, title?, body? }
 * @returns {Promise<Document|null>}
 */
export const updateReviewById = async (reviewId, updates) => {
  return Review.findByIdAndUpdate(
    reviewId,
    {
      ...updates,
      isEdited: true,
      editedAt: new Date(),
    },
    { new: true, runValidators: true }
  ).exec();
};

/**
 * Hard delete a review.
 * The post-delete hook on the model will recalculate event rating aggregation.
 *
 * @param {string} reviewId
 * @returns {Promise<Document|null>}
 */
export const deleteReviewById = async (reviewId) => {
  return Review.findByIdAndDelete(reviewId).exec();
};

/**
 * Set or clear the isFlagged status of a review.
 *
 * @param {string} reviewId
 * @param {boolean} isFlagged
 * @param {string|null} reason
 * @param {string|null} flaggedById - Admin's userId
 * @returns {Promise<Document|null>}
 */
export const setReviewFlagged = async (reviewId, isFlagged, reason = null, flaggedById = null) => {
  const update = isFlagged
    ? { isFlagged: true, flagReason: reason, flaggedAt: new Date(), flaggedBy: flaggedById }
    : { isFlagged: false, flagReason: null, flaggedAt: null, flaggedBy: null };

  return Review.findByIdAndUpdate(reviewId, update, { new: true }).exec();
};
