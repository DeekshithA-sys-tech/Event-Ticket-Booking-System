/**
 * @file userService.js
 * @description User profile management API calls.
 */

import { api } from './api.js';

export const userService = {
  /**
   * Fetches current user profile and booking statistics.
   */
  async getMyProfile() {
    return api.get('/users/me');
  },

  /**
   * Updates current user profile details (name, phone).
   * @param {{ name?: string, phone?: string }} updates
   */
  async updateMyProfile(updates) {
    return api.patch('/users/me', updates);
  },

  /**
   * Uploads or updates current user avatar image.
   * @param {FormData} formData
   */
  async uploadAvatar(formData) {
    return api.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
