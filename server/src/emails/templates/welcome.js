/**
 * @file welcome.js
 * @description Welcome email sent when a new user registers.
 */
import { baseLayout } from './baseLayout.js';

/**
 * @param {string} name - User's display name
 * @returns {{ subject: string, html: string, text: string }}
 */
export const welcomeEmail = (name) => {
  const subject = '🎉 Welcome to Event Ticket Booking!';

  const content = `
    <h2 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1f2937;">
      Hi ${name}! 👋
    </h2>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#4b5563;">
      Your account has been created successfully. You're all set to start
      discovering and booking amazing events near you.
    </p>

    <div style="background:#f0fdf4;border-left:4px solid #22c55e;
                border-radius:0 8px 8px 0;padding:16px 20px;margin:24px 0;">
      <p style="margin:0;font-size:14px;color:#166534;font-weight:600;">
        What you can do now:
      </p>
      <ul style="margin:8px 0 0;padding-left:20px;color:#166534;font-size:14px;line-height:1.8;">
        <li>Browse concerts, sports, workshops, and more</li>
        <li>Select your seats on an interactive seat map</li>
        <li>Get instant booking confirmation with QR code</li>
        <li>Download your PDF ticket anytime</li>
      </ul>
    </div>

    <p style="margin:24px 0 0;font-size:15px;color:#6b7280;">
      Happy Booking! 🎟
    </p>
  `;

  const text = `Hi ${name}!\n\nWelcome to Event Ticket Booking! Your account has been created successfully.\n\nStart browsing events and book your next experience.\n\nHappy Booking!`;

  return { subject, html: baseLayout(content, subject), text };
};
