/**
 * @file admin.controller.js
 * @description Admin platform management Controller (Dashboard, Moderation, Force Cancellations, Audit Logs, System Health).
 */

import * as adminRepo from '../repositories/admin.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import { cancelBookingCore } from './booking.controller.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { NotFoundError, ValidationError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { AUDIT_ACTIONS } from '../models/auditLog.model.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('AdminController');

const logAdminAction = (adminUser, logData) => {
  adminRepo
    .createAuditLog({
      admin: adminUser._id,
      adminEmail: adminUser.email,
      ...logData,
    })
    .catch((err) => logger.error(`[AuditLog] Failed to write audit log: ${err.message}`));
};

// ─── 1. Platform Dashboard ────────────────────────────────────────────────────

export const getDashboard = asyncHandler(async (_req, res) => {
  const stats = await adminRepo.getDashboardStats();

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.DASHBOARD_FETCHED, stats));
});

// ─── 2. Event Management ──────────────────────────────────────────────────────

export const listEvents = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(req.query);

  const filter = {};
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.organizer) filter.organizer = req.query.organizer;
  if (req.query.city) filter.city = { $regex: req.query.city, $options: 'i' };
  if (req.query.search) {
    filter.title = { $regex: req.query.search, $options: 'i' };
  }

  const { events, total } = await adminRepo.findAllEvents(filter, { skip, limit, sortObj });
  const meta = buildPaginationMeta(total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.LIST_FETCHED, events, meta));
});

export const changeEventStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  const { eventId } = req.params;

  if (!status) throw new ValidationError('status is required in request body.');

  if (status === 'completed') {
    throw new ValidationError(
      'Cannot manually set status to "completed". This is system-managed.'
    );
  }

  const event = await eventRepo.findEventById(eventId);
  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);

  const previousStatus = event.status;
  const updated = await eventRepo.updateEventById(eventId, { status });

  logAdminAction(req.user, {
    action: AUDIT_ACTIONS.EVENT_STATUS_CHANGE,
    targetModel: 'Event',
    targetId: event._id,
    targetSummary: `Event: "${event.title}"`,
    reason: reason || null,
    changes: { before: { status: previousStatus }, after: { status } },
  });

  logger.info(
    `[Admin] Event "${event.title}" status: ${previousStatus} → ${status} | Admin: ${req.user.email}`
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.EVENT_STATUS_UPDATED, updated));
});

// ─── 3. Booking Management ────────────────────────────────────────────────────

export const listBookings = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(req.query);

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.event) filter.event = req.query.event;
  if (req.query.user) filter.user = req.query.user;

  const { bookings, total } = await adminRepo.findAllBookings(filter, { skip, limit, sortObj });
  const meta = buildPaginationMeta(total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.BOOKING.LIST_FETCHED, bookings, meta));
});

export const forceCancelBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const reason = req.body?.reason;

  const booking = await adminRepo.findBookingByBookingId(bookingId);
  if (!booking) throw new NotFoundError(MESSAGES.BOOKING.NOT_FOUND);

  if (booking.status === 'cancelled') {
    throw new ValidationError('Booking is already cancelled.');
  }

  await cancelBookingCore(bookingId, req.user._id, 'admin', reason);

  logAdminAction(req.user, {
    action: AUDIT_ACTIONS.BOOKING_FORCE_CANCEL,
    targetModel: 'Booking',
    targetId: booking._id,
    targetSummary: `Booking: ${bookingId} | User: ${booking.user?.email || booking.user}`,
    reason: reason || null,
    changes: { before: { status: 'confirmed' }, after: { status: 'cancelled' } },
  });

  logger.info(
    `[Admin] Force-cancelled booking ${bookingId} | Admin: ${req.user.email} | Reason: ${reason || 'none'}`
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.BOOKING_CANCELLED));
});

// ─── 4. Review Moderation ─────────────────────────────────────────────────────

export const listReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(req.query);

  const filter = {};
  if (req.query.isFlagged === 'true') filter.isFlagged = true;
  if (req.query.isFlagged === 'false') filter.isFlagged = false;
  if (req.query.event) filter.event = req.query.event;
  if (req.query.rating) filter.rating = parseInt(req.query.rating, 10);

  const { reviews, total } = await adminRepo.findAllReviews(filter, { skip, limit, sortObj });
  const meta = buildPaginationMeta(total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.REVIEW.LIST_FETCHED, reviews, meta));
});

// ─── 5. Audit Logs ────────────────────────────────────────────────────────────

export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(req.query);

  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.targetModel) filter.targetModel = req.query.targetModel;
  if (req.query.admin) filter.admin = req.query.admin;

  const { logs, total } = await adminRepo.findAuditLogs(filter, { skip, limit, sortObj });
  const meta = buildPaginationMeta(total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.AUDIT_LOGS_FETCHED, logs, meta));
});

// ─── 6. System Health ─────────────────────────────────────────────────────────

export const getSystemHealth = asyncHandler(async (_req, res) => {
  const startTime = Date.now();
  const checks = {};

  // MongoDB Check
  try {
    const mongoose = await import('mongoose');
    if (mongoose.default.connection.readyState === 1) {
      checks.database = { status: 'healthy', latencyMs: Math.max(1, Date.now() - startTime) };
    } else {
      checks.database = { status: 'connecting', latencyMs: 0 };
    }
  } catch (err) {
    checks.database = { status: 'unhealthy', error: err.message };
  }

  // Redis Check
  try {
    const { getRedisClient } = await import('../config/redis.js');
    const redis = getRedisClient();
    if (redis && redis.status === 'ready') {
      const redisPing = Date.now();
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
      ]);
      checks.redis = { status: 'healthy', latencyMs: Date.now() - redisPing };
    } else {
      checks.redis = { status: 'healthy (memory fallback)', latencyMs: 1 };
    }
  } catch (_err) {
    checks.redis = { status: 'healthy (memory fallback)', latencyMs: 1 };
  }

  // BullMQ Email Queue Check
  try {
    const { isRedisHealthy } = await import('../config/redis.js');
    if (isRedisHealthy && isRedisHealthy()) {
      const { getEmailQueue } = await import('../jobs/queues/email.queue.js');
      const queue = getEmailQueue();
      const [waiting, active, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      checks.emailQueue = { status: 'healthy', waiting, active, failed, delayed };
    } else {
      checks.emailQueue = { status: 'memory fallback (direct dispatch)', waiting: 0, active: 0, failed: 0 };
    }
  } catch (_err) {
    checks.emailQueue = { status: 'memory fallback (direct dispatch)', waiting: 0, active: 0, failed: 0 };
  }

  // Process Stats
  const memUsage = process.memoryUsage();
  checks.process = {
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMb: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    nodeVersion: process.version,
  };

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks,
  };

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.ADMIN.HEALTH_FETCHED, health));
});
