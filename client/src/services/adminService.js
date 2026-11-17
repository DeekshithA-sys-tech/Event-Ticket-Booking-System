/**
 * @file adminService.js
 * @description Platform Administration & Audit Log API calls.
 */

import { api } from './api.js';

export const adminService = {
  /**
   * Fetches platform overview dashboard statistics.
   */
  async getDashboard() {
    return api.get('/admin/dashboard');
  },

  /**
   * Fetches all events platform-wide with filters (Admin view).
   * @param {object} params - { page, limit, status, organizer, search }
   */
  async listEvents(params = {}) {
    return api.get('/admin/events', { params });
  },

  /**
   * Force-changes the status of any event (Admin override / approval).
   * @param {string} eventId
   * @param {{ status: string, reason?: string }} data
   */
  async updateEventStatus(eventId, data) {
    return api.patch(`/admin/events/${eventId}/status`, data);
  },

  async changeEventStatus(eventId, data) {
    return api.patch(`/admin/events/${eventId}/status`, data);
  },

  /**
   * Fetches all bookings platform-wide with filters (Admin view).
   * @param {object} params - { page, limit, status, event, user }
   */
  async listBookings(params = {}) {
    return api.get('/admin/bookings', { params });
  },

  /**
   * Force-cancels any booking and releases seats (Admin override).
   * @param {string} bookingId
   * @param {string} [reason]
   */
  async forceCancelBooking(bookingId, reason) {
    return api.post(`/admin/bookings/${bookingId}/cancel`, { reason });
  },

  /**
   * Fetches paginated user list (Admin view).
   * @param {object} params - { page, limit, role, isActive, search }
   */
  async listUsers(params = {}) {
    return api.get('/users', { params });
  },

  /**
   * Activates or suspends a user account.
   * @param {string} userId
   * @param {{ isActive: boolean, reason?: string }} data
   */
  async updateUserStatus(userId, data) {
    return api.patch(`/users/${userId}/status`, data);
  },

  /**
   * Changes a user's role.
   * @param {string} userId
   * @param {{ role: string }} data
   */
  async updateUserRole(userId, data) {
    return api.patch(`/users/${userId}/role`, data);
  },

  /**
   * Deletes a user account.
   * @param {string} userId
   */
  async deleteUser(userId) {
    return api.delete(`/users/${userId}`);
  },

  /**
   * Fetches immutable audit logs.
   * @param {object} params - { page, limit, action, targetModel, admin }
   */
  async getAuditLogs(params = {}) {
    return api.get('/admin/audit-logs', { params });
  },

  /**
   * Fetches system health status (DB, Redis, Queue, Process).
   */
  async getSystemHealth() {
    return api.get('/admin/health');
  },
};
