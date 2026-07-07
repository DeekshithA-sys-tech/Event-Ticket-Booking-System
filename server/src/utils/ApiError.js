/**
 * @file ApiError.js
 * @description Custom error class hierarchy for the application.
 *
 * WHY CUSTOM ERROR CLASSES?
 * --------------------------
 * Without custom errors, controllers look like this:
 *   if (!user) return res.status(404).json({ success: false, message: 'User not found' });
 *   if (!isValid) return res.status(400).json({ success: false, message: 'Bad input' });
 *
 * Problems:
 *   1. Error handling logic is SCATTERED — every controller formats errors differently.
 *   2. Services cannot "throw" errors without knowing they're in an HTTP context.
 *   3. Adding a new error field (e.g., an error code) requires changing every response.
 *
 * With custom error classes:
 *   - Services throw: throw new NotFoundError('User not found')
 *   - The GLOBAL error middleware catches ALL errors and formats ONE response shape
 *   - Status codes are attached to the error class, not hardcoded at call sites
 *   - The controller stays clean — it never handles error responses
 *
 * INHERITANCE CHAIN:
 *   Error → AppError → (NotFoundError, ValidationError, etc.)
 *
 * This is the pattern used in production at large Node.js systems.
 */

import { HTTP_STATUS } from '../constants/httpStatus.js';

// ─── Base Error Class ─────────────────────────────────────────────────────────

/**
 * Base application error class. All custom errors extend this.
 * @extends Error
 */
export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {Array} [errors=[]] - Array of validation error details
   * @param {boolean} [isOperational=true] - true = expected error, false = programming error
   */
  constructor(message, statusCode, errors = [], isOperational = true) {
    super(message);

    this.name = this.constructor.name; // e.g. "NotFoundError", "ValidationError"
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational; // Distinguishes expected vs unexpected errors

    // Capture stack trace pointing to where the error was thrown, not the AppError constructor
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Specific Error Classes ───────────────────────────────────────────────────
// Each class encodes its own HTTP status code — callers never hardcode numbers.

/**
 * 400 — The request body / params / query are invalid or malformed.
 * @example throw new ValidationError('Invalid email format', [{ field: 'email', message: '...' }])
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, HTTP_STATUS.BAD_REQUEST, errors);
  }
}

/**
 * 401 — The request is not authenticated.
 * The user must log in to access this resource.
 * @example throw new AuthenticationError('Token expired')
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, HTTP_STATUS.UNAUTHORIZED);
  }
}

/**
 * 403 — The user is authenticated but not authorized.
 * They don't have the right role / permission.
 * @example throw new AuthorizationError('Admin access required')
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, HTTP_STATUS.FORBIDDEN);
  }
}

/**
 * 404 — The requested resource does not exist.
 * @example throw new NotFoundError('Event not found')
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, HTTP_STATUS.NOT_FOUND);
  }
}

/**
 * 409 — A conflict with the current state of the resource.
 * Typically used for duplicate records.
 * @example throw new ConflictError('Email already registered')
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, HTTP_STATUS.CONFLICT);
  }
}

/**
 * 429 — The user has sent too many requests in a given time window.
 * Usually thrown by rate limiting middleware.
 */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please slow down.') {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS);
  }
}

/**
 * 500 — An unexpected server error.
 * These are NOT operational errors — they represent programming bugs.
 * @example throw new InternalServerError('Unexpected state in booking service')
 */
export class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, [], false);
  }
}
