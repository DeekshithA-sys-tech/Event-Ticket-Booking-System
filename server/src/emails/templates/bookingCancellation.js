/**
 * @file bookingCancellation.js
 * @description Booking cancellation confirmation email.
 */
import { baseLayout } from './baseLayout.js';

/**
 * @param {string} name
 * @param {object} event - { title, date, time, venue, city }
 * @param {object} booking - { bookingId, seats, totalAmount, cancellationReason? }
 * @returns {{ subject: string, html: string, text: string }}
 */
export const bookingCancellationEmail = (name, event, booking) => {
  const subject = `❌ Booking Cancelled: ${event.title}`;

  const eventDate = new Date(event.date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1f2937;">
      Booking Cancelled
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#4b5563;">
      Hi <strong>${name}</strong>, your booking has been successfully cancelled.
    </p>

    <!-- Booking ID -->
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;
                padding:16px 20px;margin-bottom:20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;
                text-transform:uppercase;letter-spacing:1px;">Cancelled Booking</p>
      <p style="margin:0;font-family:monospace;font-size:22px;font-weight:700;
                color:#dc2626;letter-spacing:3px;text-decoration:line-through;opacity:0.7;">
        ${booking.bookingId}
      </p>
    </div>

    <!-- Event Details -->
    <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#f9fafb;padding:14px 20px;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#9ca3af;
                  text-transform:uppercase;letter-spacing:1px;">Event</p>
        <p style="margin:0;font-size:17px;font-weight:700;color:#374151;">${event.title}</p>
      </div>
      <div style="padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#9ca3af;
                  text-transform:uppercase;letter-spacing:1px;">Date</p>
        <p style="margin:0;font-size:14px;color:#6b7280;">${eventDate} at ${event.time}</p>
      </div>
      <div style="padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#9ca3af;
                  text-transform:uppercase;letter-spacing:1px;">Refund Amount</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#374151;">
          ₹${booking.totalAmount.toLocaleString('en-IN')}
          <span style="font-size:12px;font-weight:400;color:#6b7280;">(${booking.refundStatus || 'processing 5–7 business days'})</span>
        </p>
        ${booking.refundId ? `<p style="margin:4px 0 0;font-size:12px;font-family:monospace;color:#6b7280;">Refund ID: <strong>${booking.refundId}</strong></p>` : ''}
      </div>
      ${booking.cancellationReason ? `
      <div style="padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#9ca3af;
                  text-transform:uppercase;letter-spacing:1px;">Reason</p>
        <p style="margin:0;font-size:14px;color:#6b7280;">${booking.cancellationReason}</p>
      </div>` : ''}
    </div>

    <div style="background:#f0f9ff;border-left:4px solid #0ea5e9;
                border-radius:0 8px 8px 0;padding:14px 18px;">
      <p style="margin:0;font-size:13px;color:#075985;">
        💡 Your seats have been released and are now available for others to book.
        Browse other events and find your next experience!
      </p>
    </div>
  `;

  const text = [
    `Hi ${name}, your booking has been cancelled.`,
    `Booking ID: ${booking.bookingId}`,
    `Event: ${event.title}`,
    `Date: ${eventDate}`,
    `Refund: ₹${booking.totalAmount} (5-7 business days)`,
    booking.cancellationReason ? `Reason: ${booking.cancellationReason}` : '',
  ].filter(Boolean).join('\n');

  return { subject, html: baseLayout(content, subject), text };
};
