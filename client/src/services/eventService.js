/**
 * @file eventService.js
 * @description Event management API calls.
 */

import { api } from './api.js';

export const eventService = {
  /**
   * Fetches paginated event list.
   * @param {object} params - { page, limit, category, city, search, sort }
   */
  async getEvents(params = {}) {
    return api.get('/events', { params });
  },

  /**
   * Fetches a single event by ID with seat map layout.
   * @param {string} id
   */
  async getEventById(id) {
    return api.get(`/events/${id}`);
  },

  /**
   * Creates a new event (Organizer / Admin).
   * @param {object} eventData
   */
  async createEvent(eventData) {
    return api.post('/events', eventData);
  },

  /**
   * Updates an event by ID (Organizer / Admin).
   * @param {string} id
   * @param {object} updates
   */
  async updateEvent(id, updates) {
    return api.patch(`/events/${id}`, updates);
  },

  /**
   * Uploads an event banner image (Organizer / Admin).
   * @param {string} id
   * @param {FormData} formData
   */
  async uploadBanner(id, formData) {
    return api.post(`/events/${id}/banner`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * Deletes an event by ID (Organizer / Admin).
   * @param {string} id
   */
  async deleteEvent(id) {
    return api.delete(`/events/${id}`);
  },

  /**
   * Fetches categories list.
   */
  async getCategories() {
    return api.get('/categories');
  },
};
