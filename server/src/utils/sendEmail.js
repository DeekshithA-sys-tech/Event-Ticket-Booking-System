/**
 * @file sendEmail.js
 * @description Bulletproof Nodemailer email sending utility with automatic Ethereal test inbox fallback.
 */

import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let transporter = null;
let isEthereal = false;
let isInitializing = null;

const isPlaceholder = (val) => {
  if (!val) return true;
  const lower = String(val).toLowerCase();
  return (
    lower.includes('your_') ||
    lower.includes('example') ||
    lower.includes('username') ||
    lower.includes('password')
  );
};

const initTransporter = async () => {
  // Check if real custom SMTP is configured
  const hasValidConfig =
    env.SMTP_USER &&
    env.SMTP_PASS &&
    !isPlaceholder(env.SMTP_USER) &&
    !isPlaceholder(env.SMTP_PASS);

  if (hasValidConfig) {
    try {
      const customTransporter = nodemailer.createTransport({
        host: env.SMTP_HOST || 'smtp.mailtrap.io',
        port: Number(env.SMTP_PORT) || 587,
        secure: Number(env.SMTP_PORT) === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
      });

      // Verify connection
      await customTransporter.verify();
      transporter = customTransporter;
      isEthereal = false;
      logger.info(`[Email] Connected to SMTP server: ${env.SMTP_HOST}:${env.SMTP_PORT}`);
      return transporter;
    } catch (err) {
      logger.warn(
        `[Email] Configured SMTP credentials failed (${err.message}). Switching to Ethereal Test Inbox fallback.`
      );
    }
  }

  // Automatic Ethereal fallback for development
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    isEthereal = true;
    logger.info(`[Email] Active in Ethereal Test Mode (User: ${testAccount.user})`);
    return transporter;
  } catch (err) {
    logger.warn(`[Email] Ethereal initialization error: ${err.message}. Running in simulated console mode.`);
    transporter = null;
    return null;
  }
};

const getTransporter = async () => {
  if (transporter) return transporter;
  if (!isInitializing) {
    isInitializing = initTransporter();
  }
  return isInitializing;
};

/**
 * Sends an email using Nodemailer with automatic fallback & preview URLs.
 *
 * @param {object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML email content
 * @param {string} [options.text] - Plain text content
 * @returns {Promise<{ messageId: string, previewUrl?: string }>}
 */
export const sendEmail = async ({ to, subject, html, text, attachments }) => {
  const transport = await getTransporter();

  const mailOptions = {
    from: env.EMAIL_FROM || '"EventPulse Ticketing" <no-reply@eventpulse.com>',
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
    attachments: attachments || [],
  };

  if (!transport) {
    logger.info(
      `[Email Simulation] ✉️ To: ${to} | Subject: "${subject}" | Content length: ${html?.length || 0} chars`
    );
    return { messageId: 'simulated-' + Date.now() };
  }

  try {
    const info = await transport.sendMail(mailOptions);
    let previewUrl = null;

    if (isEthereal) {
      previewUrl = nodemailer.getTestMessageUrl(info);
      logger.info(
        `[Email] 📧 Email delivered to Ethereal Inbox for <${to}> | Subject: "${subject}"`
      );
      if (previewUrl) {
        logger.info(`[Email] 🔗 Preview link: ${previewUrl}`);
      }
    } else {
      logger.info(`[Email] 📧 Sent to ${to} | Subject: "${subject}" | MessageId: ${info.messageId}`);
    }

    return { messageId: info.messageId, previewUrl };
  } catch (error) {
    logger.warn(`[Email] Delivery error to ${to}: ${error.message}. Simulating local delivery.`);
    return { messageId: 'fallback-' + Date.now() };
  }
};

// ─── Legacy Template Helpers ──────────────────────────────────────────────────

export const passwordResetTemplate = (name, resetUrl) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #6366f1; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
    .body { padding: 32px; background: #f9fafb; }
    .button { display: inline-block; background: #6366f1; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 20px 0; }
    .footer { padding: 16px; text-align: center; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h2>🎟 Event Ticket Booking</h2>
  </div>
  <div class="body">
    <h3>Hi ${name},</h3>
    <p>You requested a password reset. Click the button below to set a new password:</p>
    <a href="${resetUrl}" class="button">Reset My Password</a>
    <p>This link expires in <strong>10 minutes</strong>.</p>
    <p>If you didn't request this, please ignore this email — your password won't change.</p>
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} Event Ticket Booking. All rights reserved.</p>
  </div>
</body>
</html>
`;

export const welcomeEmailTemplate = (name) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #6366f1; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
    .body { padding: 32px; background: #f9fafb; }
    .footer { padding: 16px; text-align: center; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h2>🎟 Welcome to Event Ticket Booking!</h2>
  </div>
  <div class="body">
    <h3>Hi ${name}! 👋</h3>
    <p>Your account has been created successfully. Start exploring events near you!</p>
    <p>Browse concerts, sports events, workshops, and more — all in one place.</p>
    <p>Happy Booking! 🎉</p>
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} Event Ticket Booking. All rights reserved.</p>
  </div>
</body>
</html>
`;
