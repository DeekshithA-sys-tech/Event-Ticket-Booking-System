/**
 * @file searchService.js
 * @description Search & Discovery API calls.
 */

import { api } from './api.js';

export const searchService = {
  /**
   * Search events with keyword & filters.
   * @param {object} params - { q, category, city, minPrice, maxPrice, page, limit }
   */
  async searchEvents(params = {}) {
    return api.get('/search/events', { params });
  },

  /**
   * Fetches trending events list.
   */
  async getTrendingEvents() {
    return api.get('/search/trending');
  },

  /**
   * Fetches available event cities.
   */
  async getCities() {
    return api.get('/search/cities');
  },

  /**
   * Fetches category event counts.
   */
  async getCategoryCounts() {
    return api.get('/search/categories/counts');
  },

  /**
   * Fetches related events for a given event ID.
   * @param {string} eventId
   */
  async getRelatedEvents(eventId) {
    return api.get(`/search/events/${eventId}/related`);
  },

  /**
   * Fetches real-time seat availability for an event.
   * @param {string} eventId
   */
  async getSeatAvailability(eventId) {
    return api.get(`/search/events/${eventId}/seats`);
  },
};
