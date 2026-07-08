/**
 * @file sendEmail.js
 * @description Nodemailer email sending utility.
 *
 * DESIGN DECISIONS:
 * -----------------
 *
 * 1. WHY A STANDALONE UTILITY, NOT DIRECTLY IN THE SERVICE?
 *    Services should not know about SMTP, transport config, or email headers.
 *    This utility handles the WHAT (sending an email). The service decides WHEN.
 *    This lets us swap Nodemailer for SendGrid/AWS SES by changing one file.
 *
 * 2. WHY NOT USE BULLMQ HERE?
 *    In Sprint 10, emails will be queued via BullMQ for reliability and retry.
 *    For now (Sprint 3), we call sendEmail directly so we can develop and test
 *    the auth flow without Redis dependency. The service interface stays the same;
 *    Sprint 10 just wraps it in a queue.
 *
 * 3. NODEMAILER TRANSPORTER POOLING
 *    We create the transporter once and reuse it (singleton pattern).
 *    Creating a new transporter per email wastes TCP connections and is slow.
 *
 * 4. MAILTRAP FOR DEVELOPMENT
 *    Mailtrap intercepts all outgoing emails and shows them in a web UI.
 *    You never accidentally email real users during development.
 *    Sign up free at https://mailtrap.io and put the SMTP credentials in .env
 */

import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// ─── Transporter Singleton ────────────────────────────────────────────────────
// Created once when this module is first imported
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // For port 587 (STARTTLS), secure must be false initially
    // For port 465 (SSL), secure must be true
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    // Nodemailer v7+ default pool
    pool: true,       // Reuse connections (performance)
    maxConnections: 5,
    maxMessages: 100,
  });

  return transporter;
};

/**
 * Sends an email using Nodemailer.
 *
 * @param {object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML email body
 * @param {string} [options.text] - Plain-text fallback (good for accessibility)
 * @returns {Promise<void>}
 * @throws Will throw if the email fails to send
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  const transport = getTransporter();

  const mailOptions = {
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text fallback
  };

  try {
    const info = await transport.sendMail(mailOptions);
    logger.info(`[Email] Sent to ${to} | Subject: "${subject}" | MessageId: ${info.messageId}`);
  } catch (error) {
    logger.error(`[Email] Failed to send to ${to}: ${error.message}`);
    throw error; // Re-throw so the caller (service) can handle it
  }
};

// ─── Email Templates ──────────────────────────────────────────────────────────
// Simple inline templates. In Sprint 10 these move to HTML template files.

/**
 * Generates the password reset email HTML.
 * @param {string} name - User's name
 * @param {string} resetUrl - The password reset URL (with raw token)
 * @returns {string} HTML string
 */
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
