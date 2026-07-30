/**
 * @file admin.service.js
 * @description Admin platform management business logic.
 *
 * RESPONSIBILITIES:
 * ─────────────────
 * 1. Platform Dashboard  — aggregated view of the entire system
 * 2. Event Management    — force-change event status (cancel/publish any event)
 * 3. Booking Management  — view all bookings, force-cancel with seat release
 * 4. Review Moderation   — view all reviews platform-wide (flag/unflag in review.service)
 * 5. Audit Logging       — write immutable record after every destructive action
 * 6. System Health       — DB, Redis, queue depth
 *
 * CROSS-CUTTING CONCERN: AUDIT LOGGING
 * ──────────────────────────────────────
 * Every mutating operation in this service writes an AuditLog entry.
 * Pattern:
 *   1. Perform the action
 *   2. Write audit log (non-blocking — does NOT block the response)
 *   3. Return the result
 *
 * WHY NON-BLOCKING AUDIT LOG?
 *   - Audit log failure should NEVER roll back the admin action
 *   - If the DB is partially degraded, we still want the action to succeed
 *   - We log the error and continue (best-effort audit logging)
 *
 * SEAT RELEASE ON FORCE-CANCEL:
 * ───────────────────────────────
 * When an admin force-cancels a booking, we reuse the same Mongoose
 * transaction logic as the customer cancel flow. This guarantees
 * the same atomicity — booking status + seat status + availableSeats
 * all update together or not at all.
 *
 * We intentionally REUSE booking.service.cancelBooking() by passing
 * userRole='admin' — this bypasses the ownership check while keeping
 * the transaction logic in one place (DRY).
 */

import * as adminRepo from '../repositories/admin.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import * as bookingService from './booking.service.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { NotFoundError, ValidationError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';
import { EVENT_STATUS } from '../constants/eventStatus.js';
import { AUDIT_ACTIONS } from '../models/auditLog.model.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('AdminService');

// ─── Helper: Write Audit Log ──────────────────────────────────────────────────
/**
 * Writes an audit log entry. Non-blocking — errors are logged but not thrown.
 * @param {object} adminUser - req.user (admin performing the action)
 * @param {object} logData
 */
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

/**
 * Returns an aggregated platform overview for the admin dashboard.
 * Runs 12 DB queries in parallel via Promise.all.
 *
 * @returns {Promise<object>}
 */
export const getAdminDashboard = async () => {
  return adminRepo.getDashboardStats();
};

// ─── 2. All Events (Admin View) ───────────────────────────────────────────────

/**
 * Returns a paginated, filterable list of all events platform-wide.
 * Admins can see ALL events regardless of organizer or status.
 *
 * Filters: status, organizer (userId), city, search (title)
 *
 * @param {object} queryParams - req.query
 * @returns {{ events: object[], meta: object }}
 */
export const listAllEvents = async (queryParams) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams);

  const filter = {};
  if (queryParams.status) filter.status = queryParams.status;
  if (queryParams.organizer) filter.organizer = queryParams.organizer;
  if (queryParams.city) filter.city = { $regex: queryParams.city, $options: 'i' };
  if (queryParams.search) {
    filter.title = { $regex: queryParams.search, $options: 'i' };
  }

  const { events, total } = await adminRepo.findAllEvents(filter, { skip, limit, sortObj });
  return { events, meta: buildPaginationMeta(total, page, limit) };
};

// ─── 3. Force-Change Event Status ─────────────────────────────────────────────

/**
 * Admin-only: override the status of any event.
 * Examples: cancel a fraudulent event, republish a mistakenly archived event.
 *
 * ALLOWED TRANSITIONS (admin has fewer restrictions than organizer):
 *   Any status → cancelled   (admin can cancel anything)
 *   draft → published         (admin can bypass organizer publish restrictions)
 *   cancelled → published     (admin can restore cancelled events)
 *
 * CANNOT CHANGE TO:
 *   → 'completed' (system-managed — set by a scheduled job when event.date passes)
 *
 * @param {string} eventId
 * @param {string} newStatus
 * @param {string} reason
 * @param {object} adminUser - req.user
 * @returns {Promise<Document>}
 */
export const adminChangeEventStatus = async (eventId, newStatus, reason, adminUser) => {
  if (newStatus === 'completed') {
    throw new ValidationError(
      'Cannot manually set status to "completed". This is system-managed.'
    );
  }

  const event = await eventRepo.findEventById(eventId);
  if (!event) throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);

  const previousStatus = event.status;

  const updated = await eventRepo.updateEventById(eventId, { status: newStatus });

  // Write audit log (non-blocking)
  logAdminAction(adminUser, {
    action: AUDIT_ACTIONS.EVENT_STATUS_CHANGE,
    targetModel: 'Event',
    targetId: event._id,
    targetSummary: `Event: "${event.title}"`,
    reason: reason || null,
    changes: { before: { status: previousStatus }, after: { status: newStatus } },
  });

  logger.info(
    `[Admin] Event "${event.title}" status: ${previousStatus} → ${newStatus} | Admin: ${adminUser.email}`
  );

  return updated;
};

// ─── 4. All Bookings (Admin View) ─────────────────────────────────────────────

/**
 * Returns paginated, filterable platform-wide booking list.
 * Admins can filter by status, eventId, userId.
 *
 * @param {object} queryParams
 * @returns {{ bookings: object[], meta: object }}
 */
export const listAllBookings = async (queryParams) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams);

  const filter = {};
  if (queryParams.status) filter.status = queryParams.status;
  if (queryParams.event) filter.event = queryParams.event;
  if (queryParams.user) filter.user = queryParams.user;

  const { bookings, total } = await adminRepo.findAllBookings(filter, { skip, limit, sortObj });
  return { bookings, meta: buildPaginationMeta(total, page, limit) };
};

// ─── 5. Force-Cancel Booking ──────────────────────────────────────────────────

/**
 * Admin-only: force-cancel any booking and release its seats.
 *
 * REUSES booking.service.cancelBooking() with role='admin'.
 * This gives us:
 *   - Same Mongoose transaction (atomic seat release)
 *   - Same cancellation email (sent to the customer)
 *   - Ownership check bypassed (admin can cancel anyone's booking)
 *
 * Then writes an audit log on top.
 *
 * @param {string} bookingId - human-readable booking ID (TKT-...)
 * @param {string} reason
 * @param {object} adminUser - req.user
 */
export const adminForceCancelBooking = async (bookingId, reason, adminUser) => {
  // Get booking details BEFORE cancelling (for the audit log)
  const booking = await adminRepo.findBookingByBookingId(bookingId);
  if (!booking) throw new NotFoundError(MESSAGES.BOOKING.NOT_FOUND);

  if (booking.status === 'cancelled') {
    throw new ValidationError('Booking is already cancelled.');
  }

  // Reuse customer cancel flow — passing adminUser._id + role='admin' bypasses ownership check
  await bookingService.cancelBooking(bookingId, adminUser._id, 'admin', reason);

  // Write audit log (non-blocking)
  logAdminAction(adminUser, {
    action: AUDIT_ACTIONS.BOOKING_FORCE_CANCEL,
    targetModel: 'Booking',
    targetId: booking._id,
    targetSummary: `Booking: ${bookingId} | User: ${booking.user?.email || booking.user}`,
    reason: reason || null,
    changes: { before: { status: 'confirmed' }, after: { status: 'cancelled' } },
  });

  logger.info(
    `[Admin] Force-cancelled booking ${bookingId} | Admin: ${adminUser.email} | Reason: ${reason || 'none'}`
  );
};

// ─── 6. All Reviews (Admin Moderation View) ───────────────────────────────────

/**
 * Returns paginated platform-wide reviews.
 * Admins can filter by flagged status, eventId, rating.
 *
 * @param {object} queryParams
 * @returns {{ reviews: object[], meta: object }}
 */
export const listAllReviews = async (queryParams) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams);

  const filter = {};
  if (queryParams.isFlagged === 'true') filter.isFlagged = true;
  if (queryParams.isFlagged === 'false') filter.isFlagged = false;
  if (queryParams.event) filter.event = queryParams.event;
  if (queryParams.rating) filter.rating = parseInt(queryParams.rating, 10);

  const { reviews, total } = await adminRepo.findAllReviews(filter, { skip, limit, sortObj });
  return { reviews, meta: buildPaginationMeta(total, page, limit) };
};

// ─── 7. Audit Logs ────────────────────────────────────────────────────────────

/**
 * Returns paginated audit log entries.
 * Admins can filter by action type, targetModel, or specific admin.
 *
 * @param {object} queryParams
 * @returns {{ logs: object[], meta: object }}
 */
export const getAuditLogs = async (queryParams) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams);

  const filter = {};
  if (queryParams.action) filter.action = queryParams.action;
  if (queryParams.targetModel) filter.targetModel = queryParams.targetModel;
  if (queryParams.admin) filter.admin = queryParams.admin;

  const { logs, total } = await adminRepo.findAuditLogs(filter, { skip, limit, sortObj });
  return { logs, meta: buildPaginationMeta(total, page, limit) };
};

// ─── 8. System Health ─────────────────────────────────────────────────────────

/**
 * Returns the current health status of all system components.
 * Used by monitoring tools and the admin dashboard.
 *
 * Checks:
 *   - MongoDB: can we execute a ping command?
 *   - Redis: is the client connected?
 *   - BullMQ: how many jobs are waiting/active/failed?
 *   - Process: uptime, memory usage
 *
 * @returns {Promise<object>}
 */
export const getSystemHealth = async () => {
  const startTime = Date.now();
  const checks = {};

  // ── MongoDB ──────────────────────────────────────────────────────────────
  try {
    const mongoose = await import('mongoose');
    await mongoose.default.connection.db.admin().ping();
    checks.database = { status: 'healthy', latencyMs: Date.now() - startTime };
  } catch (err) {
    checks.database = { status: 'unhealthy', error: err.message };
  }

  // ── Redis ─────────────────────────────────────────────────────────────────
  try {
    const { getRedisClient } = await import('../config/redis.js');
    const redis = getRedisClient();
    const redisPing = Date.now();
    await redis.ping();
    checks.redis = { status: 'healthy', latencyMs: Date.now() - redisPing };
  } catch (err) {
    checks.redis = { status: 'unhealthy', error: err.message };
  }

  // ── BullMQ Email Queue ────────────────────────────────────────────────────
  try {
    const { getEmailQueue } = await import('../jobs/queues/email.queue.js');
    const queue = getEmailQueue();
    const [waiting, active, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    checks.emailQueue = { status: 'healthy', waiting, active, failed, delayed };
  } catch (err) {
    checks.emailQueue = { status: 'unhealthy', error: err.message };
  }

  // ── Process ───────────────────────────────────────────────────────────────
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

  const overallStatus = Object.values(checks).every(
    (c) => typeof c === 'object' && c.status !== 'unhealthy'
  )
    ? 'healthy'
    : 'degraded';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
  };
};
