/**
 * @file eventReminder.js
 * @description Event reminder email sent 24 hours before the event.
 *
 * TRIGGER:
 * A BullMQ delayed job is scheduled when a booking is confirmed.
 * It fires 24 hours before event.date.
 * The worker calls this template and sends via Nodemailer.
 *
 * WHAT'S INCLUDED:
 * - Event details (title, date, time, venue, city)
 * - Seat info (which seats they have)
 * - Booking ID (for QR access)
 * - Practical tips (arrive early, bring ID)
 */
import { baseLayout } from './baseLayout.js';

/**
 * @param {string} name
 * @param {object} event - { title, date, time, venue, city }
 * @param {object} booking - { bookingId, seats }
 * @returns {{ subject: string, html: string, text: string }}
 */
export const eventReminderEmail = (name, event, booking) => {
  const subject = `⏰ Reminder: ${event.title} is Tomorrow!`;

  const eventDate = new Date(event.date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const seatBadges = booking.seats
    .map(
      (s) => `<span style="display:inline-block;background:#6366f1;color:#ffffff;
                 padding:4px 12px;border-radius:20px;margin:4px;font-size:13px;font-weight:600;">
        Row ${s.row} · Seat ${s.seatNumber}
      </span>`
    )
    .join('');

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1f2937;">
      Your Event is Tomorrow! 🎉
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#4b5563;">
      Hi <strong>${name}</strong>, just a reminder about your upcoming event.
    </p>

    <!-- Event Summary -->
    <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:20px;">
        <h3 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">
          ${event.title}
        </h3>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:15px;color:#374151;">
          📅 <strong>${eventDate}</strong> at <strong>${event.time}</strong>
        </p>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:15px;color:#374151;">
          📍 ${event.venue}, ${event.city}
        </p>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6b7280;
                  text-transform:uppercase;letter-spacing:1px;">Your Seats</p>
        <div>${seatBadges}</div>
      </div>

      <div style="background:#eff6ff;padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:13px;color:#1e40af;">
          🎟 Booking ID: <strong style="font-family:monospace;">${booking.bookingId}</strong>
        </p>
      </div>
    </div>

    <!-- Tips -->
    <div style="background:#f9fafb;border-radius:10px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;">
        📌 Before you go:
      </p>
      <ul style="margin:0;padding-left:20px;color:#4b5563;font-size:14px;line-height:2;">
        <li>Arrive at least <strong>30 minutes early</strong></li>
        <li>Keep your QR code ready (in the app or email)</li>
        <li>Bring a valid photo ID</li>
        <li>Download your PDF ticket for offline access</li>
      </ul>
    </div>

    <p style="margin:0;font-size:15px;color:#4b5563;text-align:center;">
      Can't wait to see you there! 🎊
    </p>
  `;

  const seatList = booking.seats.map((s) => `Row ${s.row}, Seat ${s.seatNumber}`).join(' | ');
  const text = [
    `Hi ${name}, your event is tomorrow!`,
    `Event: ${event.title}`,
    `Date: ${eventDate} at ${event.time}`,
    `Venue: ${event.venue}, ${event.city}`,
    `Seats: ${seatList}`,
    `Booking ID: ${booking.bookingId}`,
    `Remember: Arrive 30 minutes early and bring your ID.`,
  ].join('\n');

  return { subject, html: baseLayout(content, subject), text };
};
