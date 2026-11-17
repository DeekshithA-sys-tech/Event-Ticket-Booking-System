/**
 * @file generatePdfTicket.js
 * @description PDF ticket generation using PDFKit.
 *
 * WHAT IS IN THE PDF TICKET?
 * ───────────────────────────
 *  ┌──────────────────────────────────────────┐
 *  │  🎟 EVENT TICKET BOOKING                 │
 *  │  ────────────────────────────────────    │
 *  │  [EVENT TITLE — large]                   │
 *  │                                          │
 *  │  📅  Saturday, 15 July 2026 at 7:30 PM  │
 *  │  📍  Royal Arena, Mumbai                 │
 *  │                                          │
 *  │  ┌────────────────────────────────────┐  │
 *  │  │ Booking ID   TKT-20260715-X7K2M   │  │
 *  │  │ Name         Alice Johnson         │  │
 *  │  │ Seats        Row A · Seat 5        │  │
 *  │  │              Row A · Seat 6        │  │
 *  │  │ Total Paid   ₹2,500               │  │
 *  │  └────────────────────────────────────┘  │
 *  │                                          │
 *  │  [QR CODE — centred]                     │
 *  │  Scan at venue entrance                  │
 *  │                                          │
 *  │  This ticket is non-transferable.        │
 *  │  Keep this PDF as your entry pass.       │
 *  └──────────────────────────────────────────┘
 *
 * WHY PDFKIT?
 * ────────────
 * PDFKit is a pure JavaScript PDF generation library.
 * No external binaries (unlike wkhtmltopdf, Puppeteer).
 * Already in package.json from Sprint 1 planning.
 *
 * QR CODE IN PDF:
 * ───────────────
 * The QR code is stored on the booking as a base64 PNG data URI.
 * PDFKit can embed images from a Buffer:
 *   doc.image(Buffer.from(base64data, 'base64'), x, y, options)
 *
 * OUTPUT:
 * ────────
 * We pipe the PDF stream directly to Express res so no temp file needed.
 * For large-scale production, we'd generate the PDF once and store in
 * Cloudinary, returning a URL instead of streaming on every request.
 */

import PDFDocument from 'pdfkit';
import { logger } from './logger.js';

/**
 * Generates a PDF ticket and pipes it to a writable stream.
 *
 * @param {object} options
 * @param {object} options.event      - { title, date, time, venue, city }
 * @param {object} options.booking    - { bookingId, seats, totalAmount }
 * @param {object} options.user       - { name }
 * @param {string} options.qrCode     - base64 PNG data URI from booking
 * @param {import('stream').Writable} options.stream - Writable stream (res)
 * @returns {Promise<void>}
 */
export const generatePdfTicket = ({ event, booking, user, qrCode, stream }) => {
  return new Promise((resolve, reject) => {
    try {
      const eventTitle = event?.title || 'Live Event Entry Ticket';
      const eventDate = event?.date
        ? new Date(event.date).toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Confirmed Booking';
      const eventTime = event?.time || 'Event Time';
      const eventVenue = event?.venue || 'Reserved Venue';
      const eventCity = event?.city || '';
      const userName = user?.name || 'Ticket Holder';

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 60, right: 60 },
        info: {
          Title: `Ticket — ${eventTitle}`,
          Author: 'Event Ticket Booking',
          Subject: `Booking ${booking.bookingId}`,
        },
      });

      // Pipe PDF to the writable stream (HTTP response or file)
      doc.pipe(stream);

      // ── Brand Header ──────────────────────────────────────────────────────
      doc
        .rect(0, 0, doc.page.width, 90)
        .fill('#6366f1');

      doc
        .fillColor('#ffffff')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('🎟 Event Ticket Booking', 60, 30, { align: 'center' });

      doc
        .fillColor('#e0e7ff')
        .fontSize(11)
        .font('Helvetica')
        .text('Official Entry Ticket', 60, 58, { align: 'center' });

      // ── Event Title ───────────────────────────────────────────────────────
      const contentTop = 115;

      doc
        .fillColor('#1e1b4b')
        .fontSize(26)
        .font('Helvetica-Bold')
        .text(eventTitle, 60, contentTop, { align: 'center', width: doc.page.width - 120 });

      doc.moveDown(0.5);

      // ── Date, Time, Venue ──────────────────────────────────────────────────
      const infoTop = doc.y + 10;
      doc.fillColor('#4b5563').fontSize(13).font('Helvetica');

      doc.text(`📅  ${eventDate} at ${eventTime}`, 60, infoTop, { align: 'center' });
      doc.text(`📍  ${eventVenue}, ${eventCity}`, 60, infoTop + 24, { align: 'center' });

      // ── Divider ───────────────────────────────────────────────────────────
      const dividerY = doc.y + 30;
      doc
        .moveTo(60, dividerY)
        .lineTo(doc.page.width - 60, dividerY)
        .strokeColor('#e5e7eb')
        .lineWidth(1)
        .stroke();

      // ── Booking Details Table ─────────────────────────────────────────────
      const tableTop = dividerY + 20;
      const col1 = 60;
      const col2 = 220;
      const rowHeight = 30;

      const drawRow = (label, value, rowIndex) => {
        const y = tableTop + rowIndex * rowHeight;
        if (rowIndex % 2 === 0) {
          doc.rect(col1 - 10, y - 6, doc.page.width - 100, rowHeight).fill('#f9fafb');
        }
        doc.fillColor('#6b7280').fontSize(11).font('Helvetica').text(label, col1, y);
        doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold').text(value, col2, y);
      };

      drawRow('Booking ID', booking.bookingId, 0);
      drawRow('Passenger', userName, 1);

      // Seats — one per sub-row
      (booking.seats || []).forEach((seat, i) => {
        drawRow(i === 0 ? 'Seats' : '', `Row ${seat.row}  ·  Seat ${seat.seatNumber}`, 2 + i);
      });

      const afterSeatsRow = 2 + (booking.seats?.length || 0);
      drawRow('Total Paid', `₹${(booking.totalAmount || 0).toLocaleString('en-IN')}`, afterSeatsRow);

      // ── QR Code ───────────────────────────────────────────────────────────
      const qrTop = tableTop + (afterSeatsRow + 1) * rowHeight + 30;

      if (qrCode && qrCode.startsWith('data:image/png;base64,')) {
        const base64Data = qrCode.split(',')[1];
        const imgBuffer = Buffer.from(base64Data, 'base64');

        doc.image(imgBuffer, (doc.page.width - 160) / 2, qrTop, {
          width: 160,
          height: 160,
        });

        doc
          .fillColor('#6b7280')
          .fontSize(11)
          .font('Helvetica')
          .text('Present this QR code at the venue entrance', 60, qrTop + 170, { align: 'center' });
      }

      // ── Footer Strip ───────────────────────────────────────────────────────
      const footerTop = doc.page.height - 90;

      doc
        .rect(0, footerTop, doc.page.width, 90)
        .fill('#f3f4f6');

      doc
        .fillColor('#9ca3af')
        .fontSize(10)
        .font('Helvetica')
        .text(
          'This ticket is non-transferable and valid for one-time entry only.\n' +
          'Keep this PDF as your official entry pass. Present at the venue gate.',
          60,
          footerTop + 20,
          { align: 'center', width: doc.page.width - 120 }
        );

      doc
        .fillColor('#d1d5db')
        .fontSize(9)
        .text(
          `© ${new Date().getFullYear()} Event Ticket Booking  |  Generated: ${new Date().toISOString()}`,
          60,
          footerTop + 58,
          { align: 'center' }
        );

      // ── Finalise ──────────────────────────────────────────────────────────
      doc.end();
      doc.on('end', resolve);
      doc.on('error', reject);

      logger.info(`[PDF] Ticket generated for booking ${booking.bookingId}`);
    } catch (err) {
      logger.error(`[PDF] Generation failed: ${err.message}`);
      reject(err);
    }
  });
};

/**
 * Generates the official PDF ticket in-memory as a Buffer.
 * Useful for background email attachment delivery and caching.
 *
 * @param {object} options
 * @returns {Promise<Buffer>}
 */
export const generatePdfTicketBuffer = (options) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { PassThrough } = await import('stream');
      const passThrough = new PassThrough();
      const chunks = [];
      passThrough.on('data', (c) => chunks.push(c));
      passThrough.on('end', () => resolve(Buffer.concat(chunks)));
      passThrough.on('error', reject);

      await generatePdfTicket({ ...options, stream: passThrough });
    } catch (err) {
      reject(err);
    }
  });
};
