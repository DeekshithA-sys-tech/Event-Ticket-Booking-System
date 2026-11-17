/**
 * @file email.queue.js
 * @description BullMQ email job queue definition with seamless direct-send fallback when Redis is offline.
 */

import { Queue } from 'bullmq';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { isRedisConnected } from '../../config/redis.js';
import { sendEmail } from '../../utils/sendEmail.js';
import {
  bookingConfirmationEmail,
  bookingCancellationEmail,
  eventReminderEmail,
  welcomeEmail,
  passwordResetEmail,
} from '../../emails/index.js';

let emailQueue = null;

/**
 * Returns the email Queue instance (singleton).
 * @returns {Queue}
 */
export const getEmailQueue = () => {
  if (emailQueue) return emailQueue;

  emailQueue = new Queue('email', {
    connection: {
      url: env.BULLMQ_REDIS_URL || env.REDIS_URL,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    },
    defaultJobOptions: {
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  });

  emailQueue.on('error', (_err) => {
    // Quiet queue error log
  });

  logger.info('[EmailQueue] Email queue initialised.');
  return emailQueue;
};

/**
 * Direct email sender fallback when Redis is offline.
 * Ensures registration / booking / password reset NEVER hang.
 */
const sendDirectEmailFallback = async (type, payload) => {
  let emailContent;
  const attachments = [];

  switch (type) {
    case 'booking_confirmation': {
      emailContent = bookingConfirmationEmail(payload.name, payload.event, payload.booking, payload.qrCode);
      try {
        const { generatePdfTicketBuffer } = await import('../../utils/generatePdfTicket.js');
        const pdfBuffer = await generatePdfTicketBuffer({
          event: payload.event,
          booking: payload.booking,
          user: { name: payload.name },
          qrCode: payload.qrCode,
        });
        attachments.push({
          filename: `ticket-${payload.booking?.bookingId || 'pass'}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        });
      } catch (err) {
        logger.warn(`[EmailQueue] Failed to generate PDF attachment in direct fallback: ${err.message}`);
      }
      break;
    }
    case 'booking_cancellation':
      emailContent = bookingCancellationEmail(payload.name, payload.event, payload.booking);
      break;
    case 'event_reminder':
      emailContent = eventReminderEmail(payload.name, payload.event, payload.booking);
      break;
    case 'welcome':
      emailContent = welcomeEmail(payload.name);
      break;
    case 'password_reset':
    case 'passwordReset':
      emailContent = passwordResetEmail(payload.name, payload.resetUrl);
      break;
    default:
      return;
  }

  if (payload.to && emailContent) {
    await sendEmail({
      to: payload.to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      attachments,
    });
  }
};

/**
 * Adds an email job to the queue, or falls back to direct background email if Redis is offline.
 *
 * @param {string} type
 * @param {object} payload
 * @param {object} [options]
 */
export const addEmailJob = async (type, payload, options = {}) => {
  if (!isRedisConnected()) {
    // Non-blocking direct email delivery in background
    sendDirectEmailFallback(type, payload).catch((err) =>
      logger.warn(`[EmailQueue] Direct email fallback error: ${err.message}`)
    );
    return null;
  }

  try {
    const queue = getEmailQueue();
    const job = await queue.add(type, { type, ...payload }, options);
    logger.info(`[EmailQueue] Job enqueued — type: ${type} | jobId: ${job.id}`);
    return job;
  } catch (err) {
    logger.warn(`[EmailQueue] Enqueue error (${err.message}) — sending via direct fallback`);
    sendDirectEmailFallback(type, payload).catch((e) =>
      logger.warn(`[EmailQueue] Direct email fallback error: ${e.message}`)
    );
    return null;
  }
};

/**
 * Close the queue connection gracefully.
 */
export const closeEmailQueue = async () => {
  if (emailQueue) {
    try {
      await emailQueue.close();
    } catch (_err) {
      // Ignore
    }
    emailQueue = null;
    logger.info('[EmailQueue] Queue connection closed.');
  }
};
