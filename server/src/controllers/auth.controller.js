

import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { getRefreshTokenCookieOptions } from '../utils/generateTokens.js';
import { env } from '../config/env.js';


export const register = asyncHandler(async (req, res) => {
  const meta = {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };

  const { user, accessToken, refreshToken } = await authService.register(req.body, meta);

  // Set refresh token in httpOnly cookie (secure, not accessible by JS)
  res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

  return res
    .status(HTTP_STATUS.CREATED)
    .json(
      new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.AUTH.REGISTER_SUCCESS, { user, accessToken })
    );
});

// ─── Login ────────────────────────────────────────────────────────────────────

export const login = asyncHandler(async (req, res) => {
  const meta = {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };

  const { user, accessToken, refreshToken } = await authService.login(req.body, meta);

  res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

  return res
    .status(HTTP_STATUS.OK)
    .json(
      new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.LOGIN_SUCCESS, { user, accessToken })
    );
});

// ─── Logout ───────────────────────────────────────────────────────────────────


export const logout = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken;

  await authService.logout(rawRefreshToken);

  // Clear the refresh token cookie
  res.clearCookie('refreshToken', {
    ...getRefreshTokenCookieOptions(),
    maxAge: 0, // Immediately expire
  });

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.LOGOUT_SUCCESS));
});

// ─── Refresh Token ────────────────────────────────────────────────────────────


export const refreshToken = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken;

  const meta = {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };

  const { accessToken, refreshToken: newRefreshToken } = await authService.refreshAccessToken(
    rawRefreshToken,
    meta
  );

  // Rotate: set the new refresh token cookie
  res.cookie('refreshToken', newRefreshToken, getRefreshTokenCookieOptions());

  return res
    .status(HTTP_STATUS.OK)
    .json(
      new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.TOKEN_REFRESHED, { accessToken })
    );
});

// ─── Forgot Password ──────────────────────────────────────────────────────────

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Pass CLIENT_URL so the service can build the password reset link
  await authService.forgotPassword(email, env.CLIENT_URL);

  // Always return success — even if email doesn't exist (anti-enumeration)
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.FORGOT_PASSWORD_EMAIL_SENT));
});

// ─── Reset Password ───────────────────────────────────────────────────────────


export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  await authService.resetPassword(token, password);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.PASSWORD_RESET_SUCCESS));
});

// ─── Get Current User ─────────────────────────────────────────────────────────


export const getMe = asyncHandler(async (req, res) => {
  // req.user is set by the protect middleware
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.FETCHED, req.user));
});

// ─── Change Password ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change password (authenticated user)
 *     description: |
 *       Requires the current password for verification.
 *       After a successful change, ALL refresh tokens are revoked,
 *       forcing re-login on all devices.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully — user must log in again
 *       401:
 *         description: Current password is incorrect
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  await authService.changePassword(req.user._id, currentPassword, newPassword);

  // Clear the refresh token cookie — all server-side tokens were revoked
  // The user must log in again with the new password
  res.clearCookie('refreshToken', {
    ...getRefreshTokenCookieOptions(),
    maxAge: 0,
  });

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.PASSWORD_CHANGED));
});

