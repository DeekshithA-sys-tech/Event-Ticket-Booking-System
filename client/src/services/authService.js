/**
 * @file authService.js
 * @description Authentication & session management API calls.
 */

import { api } from './api.js';

export const authService = {
  /**
   * Registers a new user account.
   * @param {{ name, email, password, role, phone }} data
   */
  async register(data) {
    return api.post('/auth/register', data);
  },

  /**
   * Logs in a user.
   * @param {{ email, password }} credentials
   */
  async login(credentials) {
    return api.post('/auth/login', credentials);
  },

  /**
   * Logs out current user and revokes refresh token.
   */
  async logout() {
    return api.post('/auth/logout');
  },

  /**
   * Fetches current authenticated user profile.
   */
  async getMe() {
    return api.get('/auth/me');
  },

  /**
   * Triggers forgot password reset email.
   * @param {string} email
   */
  async forgotPassword(email) {
    return api.post('/auth/forgot-password', { email });
  },

  /**
   * Resets password using token.
   * @param {{ token, password }} data
   */
  async resetPassword({ token, password }) {
    return api.post(`/auth/reset-password?token=${token}`, { password });
  },
};
