/**
 * @file auditLog.model.js
 * @description Audit log schema for tracking all admin actions.
 *
 * WHY AN AUDIT LOG?
 * ─────────────────
 * Every production system with admin access needs an audit trail.
 * Without one:
 *   - "Who cancelled booking TKT-20260715-X7K2M?" → Unknown
 *   - "Who suspended user alice@example.com?" → Unknown
 *   - "Was this a mistake or intentional?" → No way to tell
 *
 * With an audit log:
 *   - Every admin action is timestamped and attributed
 *   - IP address and user agent recorded for forensic analysis
 *   - Before/after state stored (we can see what changed)
 *   - Immutable — admin logs cannot be deleted (even by admins)
 *
 * DESIGN DECISIONS:
 * ─────────────────
 * 1. NO DELETE on AuditLog — no `findByIdAndDelete` in the repository.
 *    Audit logs must be immutable for compliance (SOC2, GDPR, PCI-DSS).
 *
 * 2. `targetModel` + `targetId` (polymorphic reference):
 *    A single AuditLog collection covers actions on User, Event, Booking,
 *    Review — we don't want separate audit tables for each model.
 *    This pattern is called a "polymorphic association" in DB design.
 *
 * 3. `changes` stores a before/after JSON snapshot:
 *    { before: { status: 'published' }, after: { status: 'cancelled' } }
 *    This gives auditors the full context of what changed.
 *
 * 4. TTL Index — auto-expire logs after 1 year:
 *    Most compliance frameworks require 1 year minimum retention.
 *    MongoDB TTL index handles cleanup automatically.
 */

import mongoose from 'mongoose';

// ─── Supported Admin Actions ──────────────────────────────────────────────────
export const AUDIT_ACTIONS = Object.freeze({
  // User management
  USER_SUSPEND: 'user.suspend',
  USER_ACTIVATE: 'user.activate',
  USER_ROLE_CHANGE: 'user.role_change',
  USER_DELETE: 'user.delete',

  // Event management
  EVENT_STATUS_CHANGE: 'event.status_change',
  EVENT_DELETE: 'event.delete',

  // Booking management
  BOOKING_FORCE_CANCEL: 'booking.force_cancel',

  // Review moderation
  REVIEW_FLAG: 'review.flag',
  REVIEW_UNFLAG: 'review.unflag',
  REVIEW_DELETE: 'review.delete',
});

const auditLogSchema = new mongoose.Schema(
  {
    // ── Who did it ──────────────────────────────────────────────────────────
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    adminEmail: {
      type: String,
      required: true,
      // Denormalized — snapshot email at time of action (user might be deleted later)
    },

    // ── What was done ────────────────────────────────────────────────────────
    action: {
      type: String,
      enum: Object.values(AUDIT_ACTIONS),
      required: true,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
      default: null,
    },

    // ── What was affected (polymorphic reference) ────────────────────────────
    targetModel: {
      type: String,
      enum: ['User', 'Event', 'Booking', 'Review'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    targetSummary: {
      type: String,
      // Human-readable description: e.g. "alice@example.com", "Event: Rock Night 2026"
      // Stored as snapshot so it's readable even if the target is later deleted.
    },

    // ── Change details ───────────────────────────────────────────────────────
    changes: {
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // ── Request context ──────────────────────────────────────────────────────
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = when the action happened
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Compound Index for Common Queries ────────────────────────────────────────
auditLogSchema.index({ targetModel: 1, targetId: 1 }); // "All logs for this user/event"
auditLogSchema.index({ admin: 1, createdAt: -1 });      // "All actions by this admin"
auditLogSchema.index({ action: 1, createdAt: -1 });     // "All suspensions this month"

// ─── TTL Index: Auto-expire after 365 days ────────────────────────────────────
// MongoDB automatically deletes documents when createdAt + 365 days is reached
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 } // 1 year
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
