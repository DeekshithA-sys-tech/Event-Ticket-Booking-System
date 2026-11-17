/**
 * @file bookingService.js
 * @description Seat locking, booking confirmation, PDF ticket download API calls.
 */

import { api } from './api.js';

export const bookingService = {
  /**
   * Locks selected seats for 10 minutes (Atomic Redis lock).
   * @param {{ eventId: string, seatIds: string[] }} data
   */
  async lockSeats(data) {
    return api.post('/bookings/lock-seats', data);
  },

  /**
   * Confirms booking for locked seats.
   * @param {{ eventId: string, seatIds: string[] }} data
   */
  async confirmBooking(data) {
    return api.post('/bookings/confirm', data);
  },

  /**
   * Fetches customer's booking history.
   * @param {object} params - { page, limit }
   */
  async getMyBookings(params = {}) {
    return api.get('/bookings/my-bookings', { params });
  },

  /**
   * Fetches single booking details.
   * @param {string} bookingId
   */
  async getBookingById(bookingId) {
    return api.get(`/bookings/${bookingId}`);
  },

  /**
   * Cancels a booking.
   * @param {string} bookingId
   * @param {string} [reason]
   */
  async cancelBooking(bookingId, reason) {
    return api.post(`/bookings/${bookingId}/cancel`, { reason });
  },

  /**
   * Downloads official PDF ticket for a booking.
   * @param {string} bookingId
   */
  async downloadTicketPdf(bookingId) {
    return api.get(`/bookings/${bookingId}/ticket`, {
      responseType: 'blob',
    });
  },
};
