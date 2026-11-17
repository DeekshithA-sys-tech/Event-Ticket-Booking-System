/**
 * @file reviewService.js
 * @description Event reviews & ratings API calls.
 */

import { api } from './api.js';

export const reviewService = {
  /**
   * Fetches reviews for a specific event.
   * @param {string} eventId
   * @param {object} params - { page, limit }
   */
  async getEventReviews(eventId, params = {}) {
    return api.get(`/events/${eventId}/reviews`, { params });
  },

  /**
   * Submits a new event review (requires confirmed attendance).
   * @param {{ eventId: string, rating: number, comment: string }} data
   */
  async createReview(data) {
    return api.post('/reviews', data);
  },

  /**
   * Updates an existing review.
   * @param {string} reviewId
   * @param {{ rating?: number, comment?: string }} updates
   */
  async updateReview(reviewId, updates) {
    return api.patch(`/reviews/${reviewId}`, updates);
  },

  /**
   * Deletes a review.
   * @param {string} reviewId
   */
  async deleteReview(reviewId) {
    return api.delete(`/reviews/${reviewId}`);
  },

  /**
   * Flags a review for moderation (Admin only).
   * @param {string} reviewId
   * @param {string} reason
   */
  async flagReview(reviewId, reason) {
    return api.post(`/reviews/${reviewId}/flag`, { reason });
  },
};
