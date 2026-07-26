/**
 * @file passwordReset.js
 * @description Password reset email template.
 */
import { baseLayout } from './baseLayout.js';

/**
 * @param {string} name - User's display name
 * @param {string} resetUrl - The password reset URL (with raw token)
 * @returns {{ subject: string, html: string, text: string }}
 */
export const passwordResetEmail = (name, resetUrl) => {
  const subject = '🔐 Reset Your Password — Action Required';

  const content = `
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1f2937;">
      Password Reset Request
    </h2>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#4b5563;">
      Hi <strong>${name}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#4b5563;">
      We received a request to reset your password. Click the button below to
      create a new password:
    </p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${resetUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                color:#ffffff;padding:14px 36px;border-radius:8px;font-size:16px;
                font-weight:600;text-decoration:none;letter-spacing:0.5px;">
        Reset My Password
      </a>
    </div>

    <div style="background:#fef3c7;border-left:4px solid #f59e0b;
                border-radius:0 8px 8px 0;padding:14px 18px;margin:24px 0;">
      <p style="margin:0;font-size:13px;color:#92400e;">
        ⏱ This link expires in <strong>10 minutes</strong>.
      </p>
    </div>

    <p style="margin:16px 0 0;font-size:14px;color:#9ca3af;line-height:1.6;">
      If you didn't request this, please ignore this email — your password won't change.
      <br>
      If you're concerned, please contact our support team.
    </p>

    <p style="margin:16px 0 0;font-size:12px;color:#d1d5db;word-break:break-all;">
      Or copy this link: ${resetUrl}
    </p>
  `;

  const text = `Hi ${name},\n\nReset your password here:\n${resetUrl}\n\nThis link expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`;

  return { subject, html: baseLayout(content, subject), text };
};
