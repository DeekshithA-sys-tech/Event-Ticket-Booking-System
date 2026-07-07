/**
 * @file error.middleware.js
 * @description Global, centralised error handling middleware.
 *
 * WHY CENTRALISED ERROR HANDLING?
 * ---------------------------------
 * Without this, every controller must:
 *   1. Catch its own errors
 *   2. Format an error response
 *   3. Know what status code to use
 *
 * This violates the Single Responsibility Principle — controllers should ONLY
 * handle HTTP request/response mapping, not error formatting.
 *
 * With this middleware:
 *   - Controllers throw errors (using our custom error classes)
 *   - asyncHandler forwards them to next(error)
 *   - THIS middleware is the ONLY place that formats error responses
 *   - Consistent error shape across the entire API
 *
 * EXPRESS ERROR MIDDLEWARE SIGNATURE:
 * ------------------------------------
 * Express identifies error middleware by the 4-parameter signature: (err, req, res, next)
 * It MUST be registered AFTER all routes in app.js.
 *
 * HANDLED ERROR TYPES:
 * --------------------
 * 1. Our custom AppError subclasses (NotFoundError, ValidationError, etc.)
 * 2. Mongoose validation errors (CastError, ValidationError)
 * 3. Mongoose duplicate key errors (code 11000)
 * 4. JWT errors (JsonWebTokenError, TokenExpiredError)
 * 5. Unknown/unhandled errors → 500
 */

import mongoose from 'mongoose';
import { AppError, ValidationError, AuthenticationError, NotFoundError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Converts a Mongoose CastError (invalid ObjectId) to a NotFoundError.
 * @param {mongoose.Error.CastError} err
 * @returns {NotFoundError}
 */
const handleCastError = (err) => {
  return new NotFoundError(`Invalid ${err.path}: ${err.value}. Resource not found.`);
};

/**
 * Converts Mongoose validation errors to our ValidationError class.
 * @param {mongoose.Error.ValidationError} err
 * @returns {ValidationError}
 */
const handleMongooseValidationError = (err) => {
  const errors = Object.values(err.errors).map((el) => ({
    field: el.path,
    message: el.message,
  }));
  return new ValidationError('Database validation failed.', errors);
};

/**
 * Converts MongoDB duplicate key error (11000) to a ConflictError.
 * @param {object} err - MongoDB error with code 11000
 * @returns {AppError}
 */
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  const value = err.keyValue?.[field];
  const message = `A record with ${field} '${value}' already exists.`;
  const { ConflictError } = err; // Lazy import to avoid circular deps
  return new AppError(message, HTTP_STATUS.CONFLICT);
};

/**
 * Converts JWT errors to AuthenticationError.
 * @param {Error} err - JWT error (JsonWebTokenError or TokenExpiredError)
 * @returns {AuthenticationError}
 */
const handleJWTError = (err) => {
  const message =
    err.name === 'TokenExpiredError'
      ? 'Your session has expired. Please log in again.'
      : 'Invalid token. Please log in again.';
  return new AuthenticationError(message);
};

/**
 * Global error handling middleware.
 * Must have 4 parameters for Express to recognise it as error middleware.
 *
 * @param {Error} err - The error that was thrown or passed to next()
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next - Unused but required by Express signature
 */
// eslint-disable-next-line no-unused-vars
export const errorMiddleware = (err, req, res, _next) => {
  // ── Log the error ──────────────────────────────────────────────────────────
  // Always log operational errors at 'warn', programming errors at 'error'
  if (err.isOperational === false) {
    logger.error(`[UNHANDLED ERROR] ${err.message}`, {
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      userId: req.user?.id || 'unauthenticated',
    });
  } else {
    logger.warn(`[APP ERROR] ${err.message}`, {
      statusCode: err.statusCode,
      url: req.originalUrl,
      method: req.method,
    });
  }

  // ── Normalise known error types ────────────────────────────────────────────
  let error = err;

  // Mongoose: invalid ObjectId (e.g. /events/not-a-valid-id)
  if (err instanceof mongoose.Error.CastError) {
    error = handleCastError(err);
  }

  // Mongoose: schema validation failed
  if (err instanceof mongoose.Error.ValidationError) {
    error = handleMongooseValidationError(err);
  }

  // MongoDB: duplicate unique index violation
  if (err.code === 11000) {
    error = handleDuplicateKeyError(err);
  }

  // JWT: invalid signature or expired token
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    error = handleJWTError(err);
  }

  // ── Build Response ─────────────────────────────────────────────────────────
  const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const message = error.message || 'An unexpected error occurred.';

  const response = {
    success: false,
    message,
    ...(error.errors?.length > 0 && { errors: error.errors }),
  };

  // In development, include the stack trace for faster debugging
  // NEVER expose stack traces in production — it leaks implementation details
  if (env.isDev) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 handler — catches requests to undefined routes.
 * Register this AFTER all routes but BEFORE errorMiddleware.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const notFoundMiddleware = (req, res, next) => {
  const error = new AppError(
    `Route '${req.method} ${req.originalUrl}' not found.`,
    HTTP_STATUS.NOT_FOUND
  );
  next(error);
};
