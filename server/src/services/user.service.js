/**
 * @file user.service.js
 * @description User profile and admin user management business logic.
 *
 * SEPARATION OF CONCERNS:
 * -------------------------
 * Auth operations (login, register, tokens) → auth.service.js
 * Profile operations (view/edit self) → user.service.js
 * Admin operations (manage all users) → user.service.js (admin section)
 *
 * WHY NOT PUT EVERYTHING IN AUTH SERVICE?
 * ----------------------------------------
 * Auth service is already large. User profile management is a DISTINCT
 * concern — it doesn't involve tokens or authentication.
 * Splitting by domain responsibility keeps files focused and maintainable.
 *
 * PRIVILEGE ESCALATION PROTECTION:
 * ----------------------------------
 * Users can update: name, phone — that's it.
 * They CANNOT update: email, role, isActive via the profile endpoint.
 * Email changes require a verification flow (Sprint 10).
 * Role/isActive changes are admin-only, with dedicated endpoints.
 *
 * A missing guard here (e.g., accepting `role` in the update body without
 * stripping it) would be a privilege escalation vulnerability.
 * We explicitly whitelist allowed update fields at the service level.
 */

import * as userRepo from '../repositories/user.repository.js';
import * as bookingRepo from '../repositories/booking.repository.js';
import { uploadImage, deleteImage } from '../utils/uploadToCloudinary.js';
import { NotFoundError, AuthorizationError, ConflictError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';
import { parsePaginationParams, buildTextSearch } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('UserService');

// ─── Profile: Get Current User ────────────────────────────────────────────────

/**
 * Get the current user's profile with booking statistics.
 *
 * WHY INCLUDE BOOKING STATS?
 * ---------------------------
 * The profile page shows: "You have 5 upcoming bookings, 12 past bookings"
 * This is valuable context — we aggregate it here rather than making the
 * frontend call two endpoints. One round-trip is better than two.
 *
 * @param {string} userId
 * @returns {{ user: Document, stats: object }}
 */
export const getMyProfile = async (userId) => {
  const user = await userRepo.findUserById(userId);
  if (!user) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  // Get booking stats for this user
  const now = new Date();

  // Count upcoming confirmed bookings (event date in future)
  // Requires a join — we aggregate in the Booking collection
  const Booking = (await import('../models/booking.model.js')).default;
  const Event = (await import('../models/event.model.js')).default;

  const [totalBookings, upcomingCount, pastCount] = await Promise.all([
    Booking.countDocuments({ user: userId, status: 'confirmed' }),
    Booking.aggregate([
      { $match: { user: user._id, status: 'confirmed' } },
      {
        $lookup: {
          from: 'events',
          localField: 'event',
          foreignField: '_id',
          as: 'eventData',
        },
      },
      { $unwind: '$eventData' },
      { $match: { 'eventData.date': { $gt: now } } },
      { $count: 'count' },
    ]).then((r) => r[0]?.count || 0),
    Booking.aggregate([
      { $match: { user: user._id, status: 'confirmed' } },
      {
        $lookup: {
          from: 'events',
          localField: 'event',
          foreignField: '_id',
          as: 'eventData',
        },
      },
      { $unwind: '$eventData' },
      { $match: { 'eventData.date': { $lte: now } } },
      { $count: 'count' },
    ]).then((r) => r[0]?.count || 0),
  ]);

  return {
    user,
    stats: {
      totalBookings,
      upcomingEvents: upcomingCount,
      pastEvents: pastCount,
    },
  };
};

// ─── Profile: Update Current User ────────────────────────────────────────────

/**
 * Update allowed profile fields: name, phone only.
 * Explicitly whitelist — never pass req.body directly to the DB.
 *
 * @param {string} userId
 * @param {{ name?: string, phone?: string }} updates
 * @returns {Promise<Document>}
 */
export const updateMyProfile = async (userId, updates) => {
  // Whitelist — only these fields can be updated via this endpoint
  const allowedUpdates = {};
  if (updates.name !== undefined) allowedUpdates.name = updates.name;
  if (updates.phone !== undefined) allowedUpdates.phone = updates.phone;

  const user = await userRepo.updateUserById(userId, allowedUpdates);
  if (!user) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  logger.info(`Profile updated: user ${userId}`);
  return user;
};

// ─── Profile: Upload Avatar ───────────────────────────────────────────────────

/**
 * Upload or replace the user's avatar image.
 * Deletes the old Cloudinary image before uploading the new one.
 *
 * @param {string} userId
 * @param {Buffer} imageBuffer - Multer memory buffer
 * @returns {Promise<Document>}
 */
export const uploadMyAvatar = async (userId, imageBuffer) => {
  const user = await userRepo.findUserById(userId);
  if (!user) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  // Delete old avatar from Cloudinary (avoid orphaned assets)
  if (user.avatar?.publicId) {
    await deleteImage(user.avatar.publicId);
  }

  // Upload to Cloudinary → 'user-avatars' folder, square crop
  const { url, publicId } = await uploadImage(imageBuffer, {
    folder: 'user-avatars',
    width: 400,
    height: 400,
  });

  const updated = await userRepo.updateUserById(userId, {
    avatar: { url, publicId },
  });

  logger.info(`Avatar uploaded for user ${userId}: ${url}`);
  return updated;
};

// ─── Admin: Get All Users ─────────────────────────────────────────────────────

/**
 * Paginated list of all users with search and role filter (admin only).
 *
 * @param {object} queryParams - req.query
 * @returns {{ users, meta }}
 */
export const getAllUsers = async (queryParams) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams);

  const filter = {};

  // Filter by role
  if (queryParams.role) filter.role = queryParams.role;

  // Filter by account status
  if (queryParams.isActive !== undefined) {
    filter.isActive = queryParams.isActive === 'true' || queryParams.isActive === true;
  }

  // Text search across name and email
  const searchFilter = buildTextSearch(queryParams.search, ['name', 'email']);
  if (searchFilter) Object.assign(filter, searchFilter);

  const { users, total } = await userRepo.findAllUsers(filter, { skip, limit, sortObj });

  return {
    users,
    meta: buildPaginationMeta(total, page, limit),
  };
};

// ─── Admin: Get Single User ───────────────────────────────────────────────────

/**
 * Get a single user's profile and their booking history summary (admin only).
 *
 * @param {string} userId
 * @returns {{ user, bookingStats }}
 */
export const getUserById = async (userId) => {
  const user = await userRepo.findUserById(userId);
  if (!user) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  const Booking = (await import('../models/booking.model.js')).default;
  const [totalBookings, cancelledBookings] = await Promise.all([
    Booking.countDocuments({ user: userId }),
    Booking.countDocuments({ user: userId, status: 'cancelled' }),
  ]);

  return {
    user,
    bookingStats: { totalBookings, cancelledBookings },
  };
};

// ─── Admin: Update User Status (Activate/Suspend) ────────────────────────────

/**
 * Activates or suspends a user account.
 * When suspended, existing refresh tokens are also revoked.
 *
 * IMPORTANT: Admins cannot suspend other admins.
 * This prevents a rogue admin from locking out other admins.
 *
 * @param {string} targetUserId - User to update
 * @param {string} adminId - The admin performing the action
 * @param {boolean} isActive - true = activate, false = suspend
 * @returns {Promise<Document>}
 */
export const updateUserStatus = async (targetUserId, adminId, isActive) => {
  // Prevent self-suspension
  if (targetUserId.toString() === adminId.toString()) {
    throw new ConflictError('You cannot change your own account status.');
  }

  const targetUser = await userRepo.findUserById(targetUserId);
  if (!targetUser) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  // Prevent admin from suspending another admin
  if (targetUser.role === 'admin') {
    throw new AuthorizationError('Cannot modify the status of another admin account.');
  }

  const updated = await userRepo.updateUserById(targetUserId, { isActive });

  if (!isActive) {
    // Suspend: revoke all existing sessions
    const tokenRepo = await import('../repositories/refreshToken.repository.js');
    await tokenRepo.deleteAllUserRefreshTokens(targetUserId);
    logger.info(`User ${targetUserId} suspended by admin ${adminId}`);
  } else {
    logger.info(`User ${targetUserId} activated by admin ${adminId}`);
  }

  return updated;
};

// ─── Admin: Update User Role ──────────────────────────────────────────────────

/**
 * Changes a user's role (admin only).
 * An admin cannot change another admin's role (same protection as status).
 *
 * @param {string} targetUserId
 * @param {string} adminId
 * @param {string} newRole
 * @returns {Promise<Document>}
 */
export const updateUserRole = async (targetUserId, adminId, newRole) => {
  if (targetUserId.toString() === adminId.toString()) {
    throw new ConflictError('You cannot change your own role.');
  }

  const targetUser = await userRepo.findUserById(targetUserId);
  if (!targetUser) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  if (targetUser.role === 'admin' && newRole !== 'admin') {
    throw new AuthorizationError('Cannot demote another admin account.');
  }

  const updated = await userRepo.updateUserById(targetUserId, { role: newRole });
  logger.info(`User ${targetUserId} role changed to ${newRole} by admin ${adminId}`);
  return updated;
};

// ─── Admin: Delete User ───────────────────────────────────────────────────────

/**
 * Permanently deletes a user account (admin only).
 * Admins cannot delete other admin accounts or themselves.
 * Confirmed bookings are NOT deleted — they're financial records.
 *
 * @param {string} targetUserId
 * @param {string} adminId
 */
export const deleteUser = async (targetUserId, adminId) => {
  if (targetUserId.toString() === adminId.toString()) {
    throw new ConflictError('You cannot delete your own account.');
  }

  const targetUser = await userRepo.findUserById(targetUserId);
  if (!targetUser) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  if (targetUser.role === 'admin') {
    throw new AuthorizationError('Cannot delete another admin account.');
  }

  // Clean up Cloudinary avatar if present
  if (targetUser.avatar?.publicId) {
    await deleteImage(targetUser.avatar.publicId);
  }

  await userRepo.deleteUserById(targetUserId);
  logger.info(`User ${targetUserId} (${targetUser.email}) deleted by admin ${adminId}`);
};
