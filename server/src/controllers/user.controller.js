/**
 * @file user.controller.js
 * @description User profile and Admin user management Controller.
 */

import * as userRepo from '../repositories/user.repository.js';
import * as bookingRepo from '../repositories/booking.repository.js';
import { uploadImage, deleteImage } from '../utils/uploadToCloudinary.js';
import { parsePaginationParams, buildTextSearch } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('UserController');

// ─── Self: Profile Endpoints ─────────────────────────────────────────────────

export const getMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await userRepo.findUserById(userId);
  if (!user) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  const now = new Date();
  const Booking = (await import('../models/booking.model.js')).default;

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

  const stats = {
    totalBookings,
    upcomingEvents: upcomingCount,
    pastEvents: pastCount,
  };

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.FETCHED, { user, stats }));
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { name, phone } = req.body;

  const allowedUpdates = {};
  if (name !== undefined) allowedUpdates.name = name;
  if (phone !== undefined) allowedUpdates.phone = phone;

  const user = await userRepo.updateUserById(userId, allowedUpdates);
  if (!user) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  logger.info(`Profile updated: user ${userId}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.UPDATED, user));
});

export const uploadMyAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('Please upload an image file.');
  }

  const userId = req.user._id;
  const user = await userRepo.findUserById(userId);
  if (!user) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  if (user.avatar && typeof user.avatar === 'object' && user.avatar.publicId) {
    await deleteImage(user.avatar.publicId);
  }

  const { url, publicId } = await uploadImage(req.file.buffer, {
    folder: 'user-avatars',
    width: 400,
    height: 400,
  });

  const updated = await userRepo.updateUserById(userId, {
    avatar: url,
  });

  logger.info(`Avatar uploaded for user ${userId}: ${url}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Avatar uploaded successfully.', updated));
});

// ─── Admin: User Management Endpoints ────────────────────────────────────────

export const getAllUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(req.query);
  const filter = {};

  if (req.query.role) filter.role = req.query.role;

  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true' || req.query.isActive === true;
  }

  const searchFilter = buildTextSearch(req.query.search, ['name', 'email']);
  if (searchFilter) Object.assign(filter, searchFilter);

  const { users, total } = await userRepo.findAllUsers(filter, { skip, limit, sortObj });
  const meta = buildPaginationMeta(total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'Users fetched successfully.', users, meta));
});

export const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await userRepo.findUserById(userId);
  if (!user) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  const Booking = (await import('../models/booking.model.js')).default;
  const [totalBookings, cancelledBookings] = await Promise.all([
    Booking.countDocuments({ user: userId }),
    Booking.countDocuments({ user: userId, status: 'cancelled' }),
  ]);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.FETCHED, { user, bookingStats: { totalBookings, cancelledBookings } }));
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const targetUserId = req.params.userId;
  const adminId = req.user._id;
  const { isActive } = req.body;

  if (targetUserId.toString() === adminId.toString()) {
    throw new ConflictError('You cannot change your own account status.');
  }

  const targetUser = await userRepo.findUserById(targetUserId);
  if (!targetUser) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  if (targetUser.role === 'admin') {
    throw new AuthorizationError('Cannot modify the status of another admin account.');
  }

  const updated = await userRepo.updateUserById(targetUserId, { isActive });

  if (!isActive) {
    const tokenRepo = await import('../repositories/refreshToken.repository.js');
    await tokenRepo.deleteAllUserRefreshTokens(targetUserId);
    logger.info(`User ${targetUserId} suspended by admin ${adminId}`);
  } else {
    logger.info(`User ${targetUserId} activated by admin ${adminId}`);
  }

  const message = isActive
    ? MESSAGES.USER.ACCOUNT_ACTIVATED
    : MESSAGES.USER.ACCOUNT_DEACTIVATED;

  return res.status(HTTP_STATUS.OK).json(new ApiResponse(HTTP_STATUS.OK, message, updated));
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const targetUserId = req.params.userId;
  const adminId = req.user._id;
  const { role } = req.body;

  if (targetUserId.toString() === adminId.toString()) {
    throw new ConflictError('You cannot change your own role.');
  }

  const targetUser = await userRepo.findUserById(targetUserId);
  if (!targetUser) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  if (targetUser.role === 'admin' && role !== 'admin') {
    throw new AuthorizationError('Cannot demote another admin account.');
  }

  const updated = await userRepo.updateUserById(targetUserId, { role });
  logger.info(`User ${targetUserId} role changed to ${role} by admin ${adminId}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, 'User role updated successfully.', updated));
});

export const deleteUser = asyncHandler(async (req, res) => {
  const targetUserId = req.params.userId;
  const adminId = req.user._id;

  if (targetUserId.toString() === adminId.toString()) {
    throw new ConflictError('You cannot delete your own account.');
  }

  const targetUser = await userRepo.findUserById(targetUserId);
  if (!targetUser) throw new NotFoundError(MESSAGES.USER.NOT_FOUND);

  if (targetUser.role === 'admin') {
    throw new AuthorizationError('Cannot delete another admin account.');
  }

  if (targetUser.avatar?.publicId) {
    await deleteImage(targetUser.avatar.publicId);
  }

  await userRepo.deleteUserById(targetUserId);
  logger.info(`User ${targetUserId} (${targetUser.email}) deleted by admin ${adminId}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.DELETED));
});
