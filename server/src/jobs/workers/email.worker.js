/**
 * @file email.worker.js
 * @description BullMQ worker that processes email jobs from the email queue.
 *
 * ARCHITECTURE:
 * ─────────────
 *
 *  ┌─────────────────────┐     enqueue      ┌───────────────┐
 *  │  booking.service.js  │ ──────────────→  │  Redis Queue  │
 *  │  auth.service.js     │                  │  (BullMQ)     │
 *  └─────────────────────┘                  └───────┬───────┘
 *                                                   │ dequeue
 *                                                   ▼
 *                                         ┌──────────────────┐
 *                                         │  email.worker.js │
 *                                         │                  │
 *                                         │ 1. Read job type │
 *                                         │ 2. Fetch full    │
 *                                         │    data from DB  │
 *                                         │ 3. Build template│
 *                                         │ 4. Call sendEmail│
 *                                         └──────────────────┘
 *
 * WHY FETCH DATA FROM DB IN THE WORKER?
 * ──────────────────────────────────────
 * We only store IDs in the job payload (userId, eventId, bookingId).
 * We DON'T store the full event/booking objects.
 *
 * WHY NOT STORE FULL OBJECTS?
 *  - Redis memory: storing 10,000 booking objects in Redis is expensive.
 *  - Stale data: if event.title changes between enqueue and processing,
 *    the email would show the old title.
 *  - Consistency: fetching from DB on process guarantees fresh data.
 *
 * TRADE-OFF:
 *  - Extra DB queries in the worker (one per email job).
 *  - Acceptable: worker processes in background, no latency impact on API.
 *
 * CONCURRENCY:
 * ────────────
 * Worker concurrency = 5 means 5 email jobs can process simultaneously.
 * This is safe: Nodemailer transporter is pooled (maxConnections: 5).
 * Increasing concurrency > 5 would exceed the pool limit.
 *
 * RETRY HANDLING:
 * ───────────────
 * BullMQ automatically retries failed jobs per the queue's `defaultJobOptions`.
 * If all 3 retries fail, the job moves to the "failed" set in Redis.
 * We can replay failed jobs via:
 *   - Bull Dashboard (admin UI)
 *   - queue.getFailedJobs() + job.retry()
 */

import { Worker } from 'bullmq';
import { env } from '../../config/env.js';
import { sendEmail } from '../../utils/sendEmail.js';
import {
  bookingConfirmationEmail,
  bookingCancellationEmail,
  eventReminderEmail,
  welcomeEmail,
  passwordResetEmail,
} from '../../emails/index.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('EmailWorker');

// ─── Job Processor ────────────────────────────────────────────────────────────

/**
 * Processes a single email job.
 * This function is called by BullMQ for each job dequeued.
 *
 * @param {import('bullmq').Job} job
 */
const processEmailJob = async (job) => {
  const { type, ...payload } = job.data;

  logger.info(`[EmailWorker] Processing job ${job.id} — type: ${type}`);

  // ── Resolve email content based on job type ───────────────────────────────
  let emailContent;

  switch (type) {
    case 'booking_confirmation': {
      const { name, event, booking, qrCode } = payload;
      emailContent = bookingConfirmationEmail(name, event, booking, qrCode);
      break;
    }

    case 'booking_cancellation': {
      const { name, event, booking } = payload;
      emailContent = bookingCancellationEmail(name, event, booking);
      break;
    }

    case 'event_reminder': {
      const { name, event, booking } = payload;
      emailContent = eventReminderEmail(name, event, booking);
      break;
    }

    case 'welcome': {
      const { name } = payload;
      emailContent = welcomeEmail(name);
      break;
    }

    case 'password_reset':
    case 'passwordReset': {
      const { name, resetUrl } = payload;
      emailContent = passwordResetEmail(name, resetUrl);
      break;
    }

    default:
      throw new Error(`[EmailWorker] Unknown job type: "${type}"`);
  }

  // ── Send the email ────────────────────────────────────────────────────────
  await sendEmail({
    to: payload.to,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  });

  logger.info(
    `[EmailWorker] ✅ Email sent — type: ${type} | to: ${payload.to} | jobId: ${job.id}`
  );
};

// ─── Worker Factory ───────────────────────────────────────────────────────────

let workerInstance = null;

/**
 * Creates and starts the email worker.
 * Called once during server bootstrap in server.js.
 *
 * @returns {Worker}
 */
export const startEmailWorker = () => {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker('email', processEmailJob, {
    connection: {
      url: env.BULLMQ_REDIS_URL || env.REDIS_URL,
    },
    concurrency: 5, // Process up to 5 emails simultaneously
    limiter: {
      max: 10,         // Max 10 emails per duration window
      duration: 1000,  // per 1 second (rate-limit against SMTP provider)
    },
  });

  // ── Worker Event Listeners ────────────────────────────────────────────────
  workerInstance.on('completed', (job) => {
    logger.info(`[EmailWorker] Job ${job.id} (${job.name}) completed.`);
  });

  workerInstance.on('failed', (job, err) => {
    logger.error(
      `[EmailWorker] Job ${job?.id} (${job?.name}) failed: ${err.message} ` +
      `[attempt ${job?.attemptsMade}/${job?.opts?.attempts}]`
    );
  });

  workerInstance.on('error', (err) => {
    logger.error(`[EmailWorker] Worker error: ${err.message}`);
  });

  logger.info('[EmailWorker] Email worker started. Listening for jobs...');
  return workerInstance;
};

/**
 * Gracefully shuts down the email worker.
 * Waits for currently processing jobs to complete before closing.
 * Called during server graceful shutdown.
 */
export const stopEmailWorker = async () => {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    logger.info('[EmailWorker] Worker shut down gracefully.');
  }
};
