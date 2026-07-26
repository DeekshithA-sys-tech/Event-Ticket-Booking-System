/**
 * @file email.queue.js
 * @description BullMQ email job queue definition.
 *
 * WHAT IS BULLMQ?
 * ───────────────
 * BullMQ is a Redis-backed job queue for Node.js.
 * It allows us to defer work (sending emails) to a background worker process.
 *
 * WHY A JOB QUEUE FOR EMAILS?
 * ────────────────────────────
 *
 * PROBLEM WITH FIRE-AND-FORGET (Sprint 5 approach):
 *   sendEmail(...).catch(err => logger.warn(...))  // ← LOST on failure
 *
 * If the SMTP server is down at booking time:
 *   - User never gets their confirmation email
 *   - No retry — the email is permanently lost
 *   - We don't even know which bookings are missing emails
 *
 * SOLUTION — JOB QUEUE:
 *   1. Booking confirmed → enqueue email job to Redis
 *   2. Worker picks up job → sends email
 *   3. If SMTP fails → job retries with exponential backoff
 *   4. After 3 retries → job moves to "failed" queue for inspection
 *   5. We can inspect failed jobs in Bull Dashboard or via API
 *
 * RESULT:
 *   - Email delivery is RELIABLE (not best-effort)
 *   - API response time is FASTER (no SMTP round-trip in request path)
 *   - Failed emails are VISIBLE and RETRYABLE
 *
 * JOB TYPES:
 * ──────────
 * All email jobs share the same queue but have a `type` field
 * that tells the worker which template to use:
 *
 *   type: 'booking_confirmation'  → bookingConfirmationEmail()
 *   type: 'booking_cancellation'  → bookingCancellationEmail()
 *   type: 'event_reminder'        → eventReminderEmail()
 *   type: 'welcome'               → welcomeEmail()
 *   type: 'password_reset'        → passwordResetEmail()
 *
 * DELAYED JOBS:
 * ─────────────
 * BullMQ supports scheduling jobs to run at a future time.
 * Event reminders use this: when booking is confirmed, we schedule
 * a reminder job to run 24 hours before event.date.
 *
 *   addEmailJob('event_reminder', payload, {
 *     delay: msUntil24HoursBeforeEvent
 *   })
 */

import { Queue } from 'bullmq';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

// ─── Queue Singleton ──────────────────────────────────────────────────────────
let emailQueue = null;

/**
 * Returns the email Queue instance (singleton).
 * Lazily initialised on first call.
 *
 * @returns {Queue}
 */
export const getEmailQueue = () => {
  if (emailQueue) return emailQueue;

  emailQueue = new Queue('email', {
    connection: {
      url: env.BULLMQ_REDIS_URL || env.REDIS_URL,
    },
    defaultJobOptions: {
      // Remove completed jobs after 24 hours (keep storage tidy)
      removeOnComplete: { age: 24 * 60 * 60 },
      // Keep failed jobs for 7 days (so we can inspect and replay them)
      removeOnFail: { age: 7 * 24 * 60 * 60 },
      // Default retry strategy: 3 attempts with exponential backoff
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start at 2s, then 4s, then 8s
      },
    },
  });

  emailQueue.on('error', (err) => {
    logger.error(`[EmailQueue] Queue error: ${err.message}`);
  });

  logger.info('[EmailQueue] Email queue initialised.');
  return emailQueue;
};

// ─── Job Adder ────────────────────────────────────────────────────────────────

/**
 * Adds an email job to the queue.
 *
 * @param {string} type - Job type (see types above)
 * @param {object} payload - Email-specific data (user, event, booking, etc.)
 * @param {object} [options] - BullMQ job options (e.g. delay for reminders)
 * @param {number} [options.delay] - Delay in ms before job is processed
 * @returns {Promise<import('bullmq').Job>}
 *
 * @example
 * // Immediate email
 * await addEmailJob('booking_confirmation', { userId, eventId, bookingId });
 *
 * @example
 * // Delayed reminder (24h before event)
 * const delay = new Date(event.date).getTime() - Date.now() - 24 * 60 * 60 * 1000;
 * await addEmailJob('event_reminder', { userId, bookingId }, { delay });
 */
export const addEmailJob = async (type, payload, options = {}) => {
  const queue = getEmailQueue();

  const job = await queue.add(
    type, // Job name (used for filtering in Bull Dashboard)
    { type, ...payload },
    options
  );

  logger.info(`[EmailQueue] Job enqueued — type: ${type} | jobId: ${job.id}`);
  return job;
};

/**
 * Close the queue connection gracefully.
 * Called during server shutdown.
 */
export const closeEmailQueue = async () => {
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = null;
    logger.info('[EmailQueue] Queue connection closed.');
  }
};
