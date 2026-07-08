/**
 * @file generateQrCode.js
 * @description QR code generation utility using the `qrcode` package.
 *
 * WHAT IS ENCODED IN THE QR CODE?
 * ---------------------------------
 * We encode a JSON payload containing:
 *   - bookingId: human-readable ID (TKT-YYYYMMDD-XXXXX)
 *   - userId: booking owner
 *   - eventId: which event
 *   - seats: which seats
 *   - issuedAt: ISO timestamp (for audit)
 *
 * The QR code is scanned at the venue gate. The scanner app decodes the JSON
 * and cross-references with the DB to verify the booking is valid and not
 * already scanned (Sprint 9 will add the "scan-once" validation).
 *
 * WHY NOT SIGN THE QR CODE PAYLOAD?
 * -----------------------------------
 * For production hardening (Sprint 9), we'll sign the payload with an HMAC
 * secret so counterfeit QR codes are rejected without a DB lookup.
 * For now, the QR code is just a convenient way to encode the booking data.
 *
 * OUTPUT FORMAT:
 * --------------
 * We generate the QR code as a base64-encoded PNG data URI:
 *   "data:image/png;base64,iVBOR..."
 *
 * This can be:
 *   - Embedded directly in an HTML email <img src="data:...">
 *   - Sent to a PDF generation library in Sprint 9
 *   - Stored in Cloudinary and returned as a URL
 */

import QRCode from 'qrcode';
import { logger } from './logger.js';

/**
 * Generates a QR code data URI from a booking payload.
 *
 * @param {object} payload - The data to encode in the QR code
 * @param {string} payload.bookingId - Human-readable booking ID
 * @param {string} payload.userId - User's MongoDB ObjectId
 * @param {string} payload.eventId - Event's MongoDB ObjectId
 * @param {Array<{seatId: string, row: string}>} payload.seats - Booked seats
 * @returns {Promise<string>} Base64 PNG data URI
 */
export const generateQrCode = async ({ bookingId, userId, eventId, seats }) => {
  const qrPayload = JSON.stringify({
    bookingId,
    userId: userId.toString(),
    eventId: eventId.toString(),
    seats: seats.map((s) => s.seatId),
    issuedAt: new Date().toISOString(),
  });

  try {
    // toDataURL returns a base64-encoded PNG suitable for embedding in HTML/PDF
    const dataUri = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H', // Highest error correction (30% damage tolerance)
      margin: 2,
      width: 300,
      color: {
        dark: '#1a1a2e',   // Dark navy — matches our brand
        light: '#ffffff',
      },
    });

    return dataUri;
  } catch (error) {
    logger.error(`[QRCode] Failed to generate QR code for booking ${bookingId}: ${error.message}`);
    throw error;
  }
};
