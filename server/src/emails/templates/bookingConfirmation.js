/**
 * @file bookingConfirmation.js
 * @description Booking confirmation email with QR code and seat details.
 *
 * WHAT IS INCLUDED:
 * - Booking ID (prominent, monospace)
 * - Event title, date, time, venue, city
 * - Seat list (each as a badge)
 * - Total amount paid
 * - QR code (embedded base64 PNG)
 * - Instruction: PDF ticket available in the app
 *
 * QR CODE EMBEDDING:
 * We embed the QR code as a base64 PNG data URI directly in the HTML.
 * Gmail clips emails >102KB — if the QR is large, we might need to
 * upload it to Cloudinary and use a URL instead.
 * For Sprint 10, base64 embedding is fine (QR PNGs are ~4KB).
 */
import { baseLayout } from './baseLayout.js';

/**
 * @param {string} name
 * @param {object} event - { title, date, time, venue, city }
 * @param {object} booking - { bookingId, seats, totalAmount }
 * @param {string} qrCode - base64 data URI
 * @returns {{ subject: string, html: string, text: string }}
 */
export const bookingConfirmationEmail = (name, event, booking, qrCode) => {
  const subject = `✅ Booking Confirmed: ${event.title} 🎟`;

  const seatBadges = booking.seats
    .map(
      (s) => `
      <span style="display:inline-block;background:#6366f1;color:#ffffff;
                   padding:4px 12px;border-radius:20px;margin:4px;font-size:13px;
                   font-weight:600;">
        Row ${s.row} · Seat ${s.seatNumber}
      </span>`
    )
    .join('');

  const eventDate = new Date(event.date).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1f2937;">
      Booking Confirmed! 🎉
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#4b5563;">
      Hi <strong>${name}</strong>, your booking is all set.
    </p>

    <!-- Booking ID -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;
                padding:16px 20px;margin-bottom:20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;
                text-transform:uppercase;letter-spacing:1px;">Booking ID</p>
      <p style="margin:0;font-family:monospace;font-size:24px;font-weight:700;
                color:#4f46e5;letter-spacing:3px;">
        ${booking.bookingId}
      </p>
    </div>

    <!-- Event Details -->
    <div style="border:1px solid #e5e7eb;border-radius:10px;
                overflow:hidden;margin-bottom:20px;">

      <div style="background:#f9fafb;padding:14px 20px;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#9ca3af;
                  text-transform:uppercase;letter-spacing:1px;">Event</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#111827;">
          ${event.title}
        </p>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#9ca3af;
                  text-transform:uppercase;letter-spacing:1px;">Date &amp; Time</p>
        <p style="margin:0;font-size:15px;color:#374151;">
          📅 ${eventDate} at ${event.time}
        </p>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#9ca3af;
                  text-transform:uppercase;letter-spacing:1px;">Venue</p>
        <p style="margin:0;font-size:15px;color:#374151;">
          📍 ${event.venue}, ${event.city}
        </p>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#9ca3af;
                  text-transform:uppercase;letter-spacing:1px;">Your Seats</p>
        <div>${seatBadges}</div>
      </div>

      <div style="background:#f0fdf4;padding:14px 20px;border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#9ca3af;
                  text-transform:uppercase;letter-spacing:1px;">Total Paid</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#15803d;">
          ₹${booking.totalAmount.toLocaleString('en-IN')}
        </p>
      </div>
    </div>

    <!-- QR Code -->
    <div style="text-align:center;background:#f9fafb;border:1px solid #e5e7eb;
                border-radius:10px;padding:24px;margin-bottom:20px;">
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        Present this QR code at the venue entrance
      </p>
      <img src="${qrCode}" alt="Booking QR Code"
           style="width:180px;height:180px;border-radius:8px;" />
      <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">
        Booking ID: <strong>${booking.bookingId}</strong>
      </p>
    </div>

    <!-- Download tip -->
    <div style="background:#f0f9ff;border-left:4px solid #0ea5e9;
                border-radius:0 8px 8px 0;padding:14px 18px;">
      <p style="margin:0;font-size:13px;color:#075985;">
        💡 <strong>Tip:</strong> Download your PDF ticket from the app for offline access.
        Log in → My Bookings → ${booking.bookingId} → Download PDF
      </p>
    </div>

    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;">
      Please arrive 30 minutes before the event. See you there! 🎉
    </p>
  `;

  const seatList = booking.seats.map((s) => `Row ${s.row}, Seat ${s.seatNumber}`).join(' | ');
  const text = [
    `Hi ${name}, your booking is confirmed!`,
    `Booking ID: ${booking.bookingId}`,
    `Event: ${event.title}`,
    `Date: ${eventDate} at ${event.time}`,
    `Venue: ${event.venue}, ${event.city}`,
    `Seats: ${seatList}`,
    `Total Paid: ₹${booking.totalAmount}`,
    `Arrive 30 minutes before the event.`,
  ].join('\n');

  return { subject, html: baseLayout(content, subject), text };
};
