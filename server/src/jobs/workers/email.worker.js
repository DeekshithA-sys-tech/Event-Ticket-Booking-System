/**
 * @file email.worker.js
 * @description BullMQ worker that processes email jobs from the email queue.
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

/**
 * Processes a single email job.
 * @param {import('bullmq').Job} job
 */
const processEmailJob = async (job) => {
  const { type, ...payload } = job.data;

  logger.info(`[EmailWorker] Processing job ${job.id} — type: ${type}`);

  let emailContent;
  const attachments = [];

  switch (type) {
    case 'booking_confirmation': {
      const { name, event, booking, qrCode } = payload;
      emailContent = bookingConfirmationEmail(name, event, booking, qrCode);
      try {
        const { generatePdfTicketBuffer } = await import('../../utils/generatePdfTicket.js');
        const pdfBuffer = await generatePdfTicketBuffer({
          event,
          booking,
          user: { name },
          qrCode,
        });
        attachments.push({
          filename: `ticket-${booking.bookingId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        });
        logger.info(`[EmailWorker] Attached background generated PDF for booking ${booking.bookingId}`);
      } catch (err) {
        logger.warn(`[EmailWorker] Failed to generate PDF attachment: ${err.message}`);
      }
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

  await sendEmail({
    to: payload.to,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    attachments,
  });

  logger.info(
    `[EmailWorker] ✅ Email sent — type: ${type} | to: ${payload.to} | jobId: ${job.id}`
  );
};

let workerInstance = null;

/**
 * Creates and starts the email worker.
 * @returns {Worker|null}
 */
export const startEmailWorker = () => {
  if (workerInstance) return workerInstance;

  try {
    workerInstance = new Worker('email', processEmailJob, {
      connection: {
        url: env.BULLMQ_REDIS_URL || env.REDIS_URL,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000,
      },
    });

    workerInstance.on('completed', (job) => {
      logger.info(`[EmailWorker] Job ${job.id} (${job.name}) completed.`);
    });

    workerInstance.on('failed', (job, err) => {
      logger.error(
        `[EmailWorker] Job ${job?.id} (${job?.name}) failed: ${err.message}`
      );
    });

    workerInstance.on('error', (_err) => {
      // Suppress connection error spam when Redis is offline
    });

    logger.info('[EmailWorker] Email worker started. Listening for jobs...');
    return workerInstance;
  } catch (err) {
    logger.warn(`[EmailWorker] Could not start worker: ${err.message}`);
    return null;
  }
};

/**
 * Gracefully shuts down the email worker.
 */
export const stopEmailWorker = async () => {
  if (workerInstance) {
    try {
      await workerInstance.close();
    } catch (_err) {
      // Ignore cleanup error
    }
    workerInstance = null;
    logger.info('[EmailWorker] Worker shut down gracefully.');
  }
};
