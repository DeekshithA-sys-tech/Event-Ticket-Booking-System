/**
 * @file notification.controller.js
 * @description In-app notification management and retrieval.
 */

import Notification, { NOTIFICATION_TYPES } from '../models/notification.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { NotFoundError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('NotificationController');

/**
 * Internal helper to dispatch in-app notifications
 */
export const dispatchNotification = async ({ user, type = NOTIFICATION_TYPES.SYSTEM, title, message, link = null, metadata = {} }) => {
  try {
    const notification = await Notification.create({
      user,
      type,
      title,
      message,
      link,
      metadata,
    });
    logger.info(`[Notification] Created notification for user ${user}: "${title}"`);
    return notification;
  } catch (err) {
    logger.warn(`[Notification] Failed to create notification: ${err.message}`);
    return null;
  }
};

/**
 * @desc Get authenticated user's notifications
 * @route GET /api/v1/notifications
 * @access Private
 */
export const getUserNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePaginationParams(req.query, { defaultLimit: 20 });

  const filter = { user: req.user._id };
  if (req.query.unread === 'true') {
    filter.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  return res.status(HTTP_STATUS.OK).json(
    new ApiResponse(
      HTTP_STATUS.OK,
      {
        notifications,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      'Notifications retrieved successfully.'
    )
  );
});

/**
 * @desc Mark a notification as read
 * @route PATCH /api/v1/notifications/:id/read
 * @access Private
 */
export const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw new NotFoundError('Notification not found or access denied.');
  }

  return res.status(HTTP_STATUS.OK).json(
    new ApiResponse(HTTP_STATUS.OK, notification, 'Notification marked as read.')
  );
});

/**
 * @desc Mark all notifications as read for current user
 * @route PATCH /api/v1/notifications/read-all
 * @access Private
 */
export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { isRead: true }
  );

  return res.status(HTTP_STATUS.OK).json(
    new ApiResponse(HTTP_STATUS.OK, { success: true }, 'All notifications marked as read.')
  );
});
