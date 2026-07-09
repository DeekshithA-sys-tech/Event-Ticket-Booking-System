/**
 * @file user.controller.js
 * @description HTTP handlers for User profile and Admin user management endpoints.
 */

import * as userService from '../services/user.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { ValidationError } from '../utils/ApiError.js';

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: User profile management and admin user operations
 */

// ─── Self: Profile Endpoints ─────────────────────────────────────────────────

/**
 * @swagger
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get the current user's profile and booking statistics
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 */
export const getMyProfile = asyncHandler(async (req, res) => {
  const { user, stats } = await userService.getMyProfile(req.user._id);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.FETCHED, { user, stats }));
});

/**
 * @swagger
 * /users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update the current user's profile (name, phone only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               phone:
 *                 type: string
 *                 example: "+919876543210"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
export const updateMyProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateMyProfile(req.user._id, req.body);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.UPDATED, user));
});

/**
 * @swagger
 * /users/me/avatar:
 *   post:
 *     tags: [Users]
 *     summary: Upload or replace the current user's avatar image
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 */
export const uploadMyAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('Please upload an image file.');
  }

  const user = await userService.uploadMyAvatar(req.user._id, req.file.buffer);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Avatar uploaded successfully.', user));
});

// ─── Admin: User Management Endpoints ────────────────────────────────────────

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Get all users with pagination and filters (admin only)
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: role
 *         in: query
 *         schema:
 *           type: string
 *           enum: [customer, organizer, admin]
 *       - name: isActive
 *         in: query
 *         schema:
 *           type: boolean
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Users fetched successfully
 */
export const getAllUsers = asyncHandler(async (req, res) => {
  const { users, meta } = await userService.getAllUsers(req.query);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Users fetched successfully.', users, meta));
});

/**
 * @swagger
 * /users/{userId}:
 *   get:
 *     tags: [Users]
 *     summary: Get a user by ID with booking statistics (admin only)
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User fetched successfully
 *       404:
 *         description: User not found
 */
export const getUserById = asyncHandler(async (req, res) => {
  const { user, bookingStats } = await userService.getUserById(req.params.userId);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.FETCHED, { user, bookingStats }));
});

/**
 * @swagger
 * /users/{userId}/status:
 *   patch:
 *     tags: [Users]
 *     summary: Activate or suspend a user account (admin only)
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive:
 *                 type: boolean
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: User status updated
 *       403:
 *         description: Cannot modify another admin's account
 */
export const updateUserStatus = asyncHandler(async (req, res) => {
  const user = await userService.updateUserStatus(
    req.params.userId,
    req.user._id,
    req.body.isActive
  );

  const message = req.body.isActive
    ? MESSAGES.USER.ACCOUNT_ACTIVATED
    : MESSAGES.USER.ACCOUNT_DEACTIVATED;

  return res.status(HTTP_STATUS.OK).json(new ApiResponse(HTTP_STATUS.OK, message, user));
});

/**
 * @swagger
 * /users/{userId}/role:
 *   patch:
 *     tags: [Users]
 *     summary: Change a user's role (admin only)
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [customer, organizer, admin]
 *     responses:
 *       200:
 *         description: Role updated successfully
 */
export const updateUserRole = asyncHandler(async (req, res) => {
  const user = await userService.updateUserRole(
    req.params.userId,
    req.user._id,
    req.body.role
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'User role updated successfully.', user));
});

/**
 * @swagger
 * /users/{userId}:
 *   delete:
 *     tags: [Users]
 *     summary: Permanently delete a user account (admin only)
 *     description: |
 *       Hard deletes the user document.
 *       Booking history is preserved (financial records).
 *       Cannot delete admin accounts.
 *     parameters:
 *       - name: userId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       403:
 *         description: Cannot delete another admin
 */
export const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(req.params.userId, req.user._id);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.DELETED));
});
