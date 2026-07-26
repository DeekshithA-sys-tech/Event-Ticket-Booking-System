/**
 * @file index.js
 * @description Central re-export for all email templates.
 *
 * WHY THIS FILE?
 * Services import from here instead of reaching into individual template files.
 * This makes future template reorganisation transparent to callers.
 *
 * Example usage in email.worker.js:
 *   import { bookingConfirmationEmail, eventReminderEmail } from '../emails/index.js';
 */

export { welcomeEmail } from './templates/welcome.js';
export { passwordResetEmail } from './templates/passwordReset.js';
export { bookingConfirmationEmail } from './templates/bookingConfirmation.js';
export { bookingCancellationEmail } from './templates/bookingCancellation.js';
export { eventReminderEmail } from './templates/eventReminder.js';
