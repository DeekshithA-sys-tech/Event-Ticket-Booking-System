/**
 * @file baseLayout.js
 * @description Shared HTML email shell.
 *
 * Every email template calls this layout with a content block.
 * This guarantees consistent branding, fonts, and footer across all emails.
 *
 * WHY A SHARED LAYOUT?
 * - DRY: header/footer HTML written once
 * - Consistency: brand colours, logo, font identical in every email
 * - Easy global changes: update header colour → all emails update automatically
 *
 * PLAIN TEXT RULE:
 * Every email must include a plain-text version.
 * Screen readers, corporate firewalls, and CLI email clients need it.
 * We pass plainText as a param; if omitted we strip HTML tags as fallback.
 *
 * INLINE STYLES ONLY:
 * Email clients strip <style> and <link> tags.
 * All CSS must be inline on each element — this is how email HTML works.
 * (Gmail, Outlook, Apple Mail all have different rendering engines.)
 */

/**
 * Wraps content in a responsive email shell.
 *
 * @param {string} content - The inner HTML body content
 * @param {string} [title] - Email subject/title for the preheader
 * @returns {string} Complete HTML email document
 */
export const baseLayout = (content, title = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">
  <!-- Preheader (hidden, shows in email preview) -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f3f4f6;">${title}</div>

  <!-- Outer container -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Card container -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;
                      box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
                       padding:28px 40px;text-align:center;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">
                🎟 Event Ticket Booking
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;
                       border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">
                © ${new Date().getFullYear()} Event Ticket Booking. All rights reserved.
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because you have an account with us.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;
