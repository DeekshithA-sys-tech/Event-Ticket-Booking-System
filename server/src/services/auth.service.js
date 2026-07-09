import * as userRepo from '../repositories/user.repository.js';
import * as tokenRepo from '../repositories/refreshToken.repository.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiryDate,
} from '../utils/generateTokens.js';
import { hashToken, generateSecureToken } from '../utils/hashToken.js';
import { sendEmail, passwordResetTemplate, welcomeEmailTemplate } from '../utils/sendEmail.js';
import { ConflictError, AuthenticationError, NotFoundError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('AuthService');

// ─── Helper: Issue Token Pair ─────────────────────────────────────────────────
/**
 * Issues a new access and refresh token pair for the user.
 *
 * @param {object} user - User document
 * @param {object} meta - Request metadata (userAgent, ipAddress)
 * @returns {{ accessToken: string, refreshToken: string }}
 */
const issueTokenPair = async (user, meta = {}) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const tokenHash = hashToken(refreshToken);

  // Store the hashed refresh token in DB for revocation capability
  await tokenRepo.createRefreshToken({
    userId: user._id,
    tokenHash,
    expiresAt: getRefreshTokenExpiryDate(),
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  return { accessToken, refreshToken };
};

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * Registers a new user account.

 * @param {{ name, email, password, role }} userData
 * @param {object} meta - { userAgent, ipAddress }
 * @returns {{ user, accessToken, refreshToken }}
 */
export const register = async ({ name, email, password, role }, meta) => {
  // ── Check for duplicate email ────────────────────────────────────────────
  const exists = await userRepo.emailExists(email);
  if (exists) {
    throw new ConflictError(MESSAGES.AUTH.EMAIL_TAKEN);
  }

  // ── Create user (password will be hashed by the model's pre-save hook) ──
  const user = await userRepo.createUser({ name, email, password, role });
  logger.info(`User registered: ${user.email} (${user.role})`);

  // ── Issue tokens ─────────────────────────────────────────────────────────
  const { accessToken, refreshToken } = await issueTokenPair(user, meta);

  // ── Send welcome email (non-blocking — don't await) ──────────────────────
  // We don't await so email failure doesn't block the registration response.
  // In Sprint 10 this moves to a BullMQ job for retry capability.
  sendEmail({
    to: user.email,
    subject: 'Welcome to Event Ticket Booking! 🎟',
    html: welcomeEmailTemplate(user.name),
  }).catch((err) => logger.warn(`Welcome email failed for ${user.email}: ${err.message}`));

  // Return the user without sensitive fields (toJSON handles this)
  return { user, accessToken, refreshToken };
};

// ─── Login ────────────────────────────────────────────────────────────────────

/**

 * @param {{ email, password }} credentials
 * @param {object} meta - { userAgent, ipAddress }
 * @returns {{ user, accessToken, refreshToken }}
 */
export const login = async ({ email, password }, meta) => {
  // Fetch user WITH password (normally excluded by select: false)
  const user = await userRepo.findUserByEmail(email, true);

  // Use identical error message for "user not found" AND "wrong password"
  // This prevents enumeration: attacker cannot tell if the email exists
  const genericError = MESSAGES.AUTH.INVALID_CREDENTIALS;

  if (!user) {
    throw new AuthenticationError(genericError);
  }

  // Check password BEFORE checking isActive to keep error message generic
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new AuthenticationError(genericError);
  }

  // Now we can check account status with a specific message
  if (!user.isActive) {
    throw new AuthenticationError('Your account has been suspended. Please contact support.');
  }

  logger.info(`User logged in: ${user.email}`);

  const { accessToken, refreshToken } = await issueTokenPair(user, meta);
  return { user, accessToken, refreshToken };
};

// ─── Logout ───────────────────────────────────────────────────────────────────


export const logout = async (rawRefreshToken) => {
  if (!rawRefreshToken) return; // Already logged out — no-op

  const tokenHash = hashToken(rawRefreshToken);
  await tokenRepo.deleteRefreshToken(tokenHash);
  logger.info(`Refresh token revoked.`);
};

// ─── Refresh Token ────────────────────────────────────────────────────────────

export const refreshAccessToken = async (rawRefreshToken, meta) => {
  if (!rawRefreshToken) {
    throw new AuthenticationError(MESSAGES.AUTH.TOKEN_INVALID);
  }

  // ── Verify JWT signature ─────────────────────────────────────────────────
  // Throws TokenExpiredError or JsonWebTokenError if invalid
  let decoded;
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new AuthenticationError(MESSAGES.AUTH.TOKEN_INVALID);
  }

  // ── Check token exists in DB (not revoked) ───────────────────────────────
  const tokenHash = hashToken(rawRefreshToken);
  const storedToken = await tokenRepo.findRefreshTokenByHash(tokenHash);

  if (!storedToken) {
    // Token has been revoked (logout) or used already (rotation)
    throw new AuthenticationError(MESSAGES.AUTH.TOKEN_INVALID);
  }

  // ── Fetch the user ────────────────────────────────────────────────────────
  const user = await userRepo.findUserById(decoded.id);
  if (!user || !user.isActive) {
    throw new AuthenticationError(MESSAGES.AUTH.UNAUTHORIZED);
  }

  // ── Delete old token (rotation — it can only be used once) ───────────────
  await tokenRepo.deleteRefreshToken(tokenHash);

  // ── Issue new token pair ──────────────────────────────────────────────────
  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user, meta);

  return { accessToken, refreshToken: newRefreshToken };
};

// ─── Forgot Password ──────────────────────────────────────────────────────────

/**
 * Generates a password reset token and sends it by email.

 * @param {string} email
 * @param {string} clientUrl - Frontend base URL for building the reset link
 */
export const forgotPassword = async (email, clientUrl) => {
  const user = await userRepo.findUserByEmail(email);

  // IMPORTANT: Always succeed, even if user not found (anti-enumeration)
  if (!user) {
    logger.warn(`Forgot password: no account for email ${email}`);
    return; // Silent return — controller sends same success message either way
  }

  // ── Generate raw token ────────────────────────────────────────────────────
  const rawToken = generateSecureToken(32); // 64 hex characters
  const hashedToken = hashToken(rawToken);

  // ── Store hash + expiry on user ───────────────────────────────────────────
  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await userRepo.saveUser(user);

  // ── Build reset URL ───────────────────────────────────────────────────────
  // The raw token is appended to the frontend URL — NOT the API URL
  // The frontend form will POST the token + new password to /api/v1/auth/reset-password
  const resetUrl = `${clientUrl}/reset-password?token=${rawToken}`;

  // ── Send email ────────────────────────────────────────────────────────────
  try {
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request — Event Ticket Booking',
      html: passwordResetTemplate(user.name, resetUrl),
    });
    logger.info(`Password reset email sent to ${user.email}`);
  } catch (error) {
    // If email fails, clean up the reset token so the user can try again
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await userRepo.saveUser(user);
    throw error; // Let the controller handle it
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────


export const resetPassword = async (rawToken, newPassword) => {
  const hashedToken = hashToken(rawToken);

  // Find user with matching unexpired token
  const user = await userRepo.findUserByResetToken(hashedToken);
  if (!user) {
    throw new AuthenticationError(MESSAGES.AUTH.PASSWORD_RESET_TOKEN_INVALID);
  }

  // ── Update password ───────────────────────────────────────────────────────
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await userRepo.saveUser(user);

  // ── Revoke all existing refresh tokens ────────────────────────────────────
  // Force the user to log in fresh — ensures old sessions are invalidated
  await tokenRepo.deleteAllUserRefreshTokens(user._id);

  logger.info(`Password reset successful for user: ${user.email}`);
};

// ─── Change Password ──────────────────────────────────────────────────────────

/**
 * Changes a user's password while they are authenticated.
 *
 * WHY REQUIRE CURRENT PASSWORD HERE BUT NOT IN RESET PASSWORD?
 * ─────────────────────────────────────────────────────────────
 * Reset Password is used when the user CANNOT log in (they forgot it).
 * The reset TOKEN proves identity — issued to a verified email address.
 *
 * Change Password is used when the user IS logged in.
 * Even though they have a valid JWT, we still require the current password.
 * Why? If someone steals the user's device with an active session, they could
 * silently change the password and lock the real user out permanently.
 * Requiring the current password stops this attack.
 *
 * @param {string} userId - Authenticated user's ID
 * @param {string} currentPassword - The user's existing password (plaintext)
 * @param {string} newPassword - The desired new password (will be hashed by model hook)
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
  // Fetch user with password (normally excluded by select: false)
  const user = await userRepo.findUserById(userId);

  // We need the password field explicitly — fetch with +password
  const userWithPassword = await import('../models/user.model.js').then((m) =>
    m.default.findById(userId).select('+password')
  );

  if (!userWithPassword) {
    throw new AuthenticationError(MESSAGES.AUTH.UNAUTHORIZED);
  }

  // Verify current password before allowing the change
  const isCurrentValid = await userWithPassword.comparePassword(currentPassword);
  if (!isCurrentValid) {
    throw new AuthenticationError('Current password is incorrect.');
  }

  // Set new password — the pre-save hook will hash it
  userWithPassword.password = newPassword;
  await userRepo.saveUser(userWithPassword);

  // Revoke ALL existing refresh tokens — forces re-login on all devices
  // This ensures that if the change was triggered by a compromised session,
  // that session is immediately invalidated after the password change.
  await tokenRepo.deleteAllUserRefreshTokens(userId);

  logger.info(`Password changed for user: ${userWithPassword.email}`);
};
