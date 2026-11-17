/**
 * @file auth.controller.js
 * @description Authentication Controller (Registration, Login, Refresh Token, Password Management).
 */

import * as userRepo from '../repositories/user.repository.js';
import * as tokenRepo from '../repositories/refreshToken.repository.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiryDate,
  getRefreshTokenCookieOptions,
} from '../utils/generateTokens.js';
import { hashToken, generateSecureToken } from '../utils/hashToken.js';
import { addEmailJob } from '../jobs/queues/email.queue.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import crypto from 'crypto';
import { ConflictError, AuthenticationError, ValidationError, NotFoundError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { env } from '../config/env.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('AuthController');

/**
 * Issues an access and refresh token pair for the user and stores the refresh token hash.
 */
const issueTokenPair = async (user, meta = {}) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const tokenHash = hashToken(refreshToken);

  await tokenRepo.createRefreshToken({
    userId: user._id,
    tokenHash,
    expiresAt: getRefreshTokenExpiryDate(),
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  return { accessToken, refreshToken };
};

// ─── Controller Handlers ───────────────────────────────────────────────────────

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const meta = {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };

  const exists = await userRepo.emailExists(email);
  if (exists) {
    throw new ConflictError(MESSAGES.AUTH.EMAIL_TAKEN);
  }

  // Organizers require admin approval before activation
  const isActive = role === 'organizer' ? false : true;

  const user = await userRepo.createUser({ name, email, password, role, isActive });
  logger.info(`User registered: ${user.email} (${user.role}), isActive: ${isActive}`);

  await addEmailJob('welcome', { to: user.email, name: user.name });

  if (role === 'organizer') {
    return res.status(HTTP_STATUS.CREATED).json(
      new ApiResponse(
        HTTP_STATUS.CREATED,
        'Organizer account registered successfully! Your account is pending admin approval before you can log in.',
        { user, isPendingApproval: true }
      )
    );
  }

  const { accessToken, refreshToken } = await issueTokenPair(user, meta);
  res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

  return res
    .status(HTTP_STATUS.CREATED)
    .json(
      new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.AUTH.REGISTER_SUCCESS, { user, accessToken })
    );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const meta = {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };

  const user = await userRepo.findUserByEmail(email, true);
  const genericError = MESSAGES.AUTH.INVALID_CREDENTIALS;

  if (!user) {
    throw new AuthenticationError(genericError);
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new AuthenticationError(genericError);
  }

  if (!user.isActive) {
    if (user.role === 'organizer') {
      throw new AuthenticationError(
        'Your organizer account is pending admin approval. Please wait for an administrator to approve your account.'
      );
    }
    throw new AuthenticationError('Your account has been suspended. Please contact support.');
  }

  logger.info(`User logged in: ${user.email}`);

  const { accessToken, refreshToken } = await issueTokenPair(user, meta);
  res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

  return res
    .status(HTTP_STATUS.OK)
    .json(
      new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.LOGIN_SUCCESS, { user, accessToken })
    );
});

export const logout = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken;

  if (rawRefreshToken) {
    const tokenHash = hashToken(rawRefreshToken);
    await tokenRepo.deleteRefreshToken(tokenHash);
    logger.info('Refresh token revoked.');
  }

  res.clearCookie('refreshToken', {
    ...getRefreshTokenCookieOptions(),
    maxAge: 0,
  });

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.LOGOUT_SUCCESS));
});

export const refreshToken = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken;

  if (!rawRefreshToken) {
    throw new AuthenticationError(MESSAGES.AUTH.TOKEN_INVALID);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new AuthenticationError(MESSAGES.AUTH.TOKEN_INVALID);
  }

  const tokenHash = hashToken(rawRefreshToken);
  const storedToken = await tokenRepo.findRefreshTokenByHash(tokenHash);

  if (!storedToken) {
    throw new AuthenticationError(MESSAGES.AUTH.TOKEN_INVALID);
  }

  const user = await userRepo.findUserById(decoded.id);
  if (!user || !user.isActive) {
    throw new AuthenticationError(MESSAGES.AUTH.UNAUTHORIZED);
  }

  await tokenRepo.deleteRefreshToken(tokenHash);

  const meta = {
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  };

  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user, meta);
  res.cookie('refreshToken', newRefreshToken, getRefreshTokenCookieOptions());

  return res
    .status(HTTP_STATUS.OK)
    .json(
      new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.TOKEN_REFRESHED, { accessToken })
    );
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await userRepo.findUserByEmail(email);

  if (!user) {
    logger.warn(`Forgot password: no account for email ${email}`);
    return res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.FORGOT_PASSWORD_EMAIL_SENT));
  }

  const rawToken = generateSecureToken(32);
  const hashedToken = hashToken(rawToken);

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);
  await userRepo.saveUser(user);

  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${rawToken}`;

  try {
    await addEmailJob('passwordReset', { to: user.email, name: user.name, resetUrl });
    logger.info(`Password reset email sent to ${user.email}`);
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await userRepo.saveUser(user);
    throw error;
  }

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.FORGOT_PASSWORD_EMAIL_SENT));
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const hashedToken = hashToken(token);
  const user = await userRepo.findUserByResetToken(hashedToken);

  if (!user) {
    throw new AuthenticationError(MESSAGES.AUTH.PASSWORD_RESET_TOKEN_INVALID);
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await userRepo.saveUser(user);

  await tokenRepo.deleteAllUserRefreshTokens(user._id);
  logger.info(`Password reset successful for user: ${user.email}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.PASSWORD_RESET_SUCCESS));
});

export const getMe = asyncHandler(async (req, res) => {
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.USER.FETCHED, req.user));
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const userWithPassword = await import('../models/user.model.js').then((m) =>
    m.default.findById(req.user._id).select('+password')
  );

  if (!userWithPassword) {
    throw new AuthenticationError(MESSAGES.AUTH.UNAUTHORIZED);
  }

  const isCurrentValid = await userWithPassword.comparePassword(currentPassword);
  if (!isCurrentValid) {
    throw new AuthenticationError('Current password is incorrect.');
  }

  userWithPassword.password = newPassword;
  await userRepo.saveUser(userWithPassword);

  await tokenRepo.deleteAllUserRefreshTokens(req.user._id);
  logger.info(`Password changed for user: ${userWithPassword.email}`);

  res.clearCookie('refreshToken', {
    ...getRefreshTokenCookieOptions(),
    maxAge: 0,
  });

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.AUTH.PASSWORD_CHANGED));
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const token = req.query.token || req.body.token;
  if (!token) {
    throw new ValidationError('Verification token is required.');
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const User = (await import('../models/user.model.js')).default;
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new ValidationError('Email verification token is invalid or has expired.');
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  logger.info(`Email verified for user: ${user.email}`);

  return res.status(HTTP_STATUS.OK).json(
    new ApiResponse(HTTP_STATUS.OK, { isEmailVerified: true }, 'Email has been verified successfully.')
  );
});

export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new ValidationError('Email is required.');
  }

  const User = (await import('../models/user.model.js')).default;
  const user = await User.findOne({ email });

  if (!user) {
    throw new NotFoundError('No account found with that email address.');
  }

  if (user.isEmailVerified) {
    return res.status(HTTP_STATUS.OK).json(
      new ApiResponse(HTTP_STATUS.OK, { isEmailVerified: true }, 'Email is already verified.')
    );
  }

  const rawToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  const verificationUrl = `${env.CLIENT_URL}/verify-email?token=${rawToken}`;
  await addEmailJob('welcome', {
    to: user.email,
    name: user.name,
    verificationUrl,
  });

  return res.status(HTTP_STATUS.OK).json(
    new ApiResponse(HTTP_STATUS.OK, null, 'Verification email resent successfully.')
  );
});

