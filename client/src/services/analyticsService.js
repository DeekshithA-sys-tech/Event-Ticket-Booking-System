/**
 * @file analyticsService.js
 * @description Organizer & Admin analytics dashboard API calls.
 */

import { api } from './api.js';

export const analyticsService = {
  /**
   * Fetches high-level sales & revenue overview.
   */
  async getOverview() {
    return api.get('/analytics/overview');
  },

  /**
   * Fetches booking timeline series data for charts.
   * @param {object} params - { period: '7d' | '30d' | '12m' }
   */
  async getBookingTimeline(params = {}) {
    return api.get('/analytics/bookings/timeline', { params });
  },

  /**
   * Fetches revenue breakdown by category or event.
   */
  async getRevenueBreakdown() {
    return api.get('/analytics/revenue/breakdown');
  },

  /**
   * Fetches review summary statistics.
   */
  async getReviewSummary() {
    return api.get('/analytics/reviews/summary');
  },

  /**
   * Fetches event-specific analytics.
   * @param {string} eventId
   */
  async getEventAnalytics(eventId) {
    return api.get(`/analytics/events/${eventId}`);
  },
};
