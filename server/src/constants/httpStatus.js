/**
 * @file httpStatus.js
 * @description HTTP status code constants.
 *
 * WHY NOT USE THE STATUS CODE NUMBER DIRECTLY?
 * --------------------------------------------
 * Writing `res.status(404)` is fine for a tutorial.
 * In production code, `res.status(HTTP_STATUS.NOT_FOUND)` is better because:
 *  - The intent is immediately clear to any reader
 *  - Numbers are magic values — 422 means nothing without context
 *  - Grouped by category (2xx, 4xx, 5xx) for easier navigation
 *
 * This pattern is used in production systems at Google, Stripe, and Netflix.
 */

export const HTTP_STATUS = Object.freeze({
  // ── 2xx Success ─────────────────────────────────────────────────────────────
  OK: 200,                    // Standard success
  CREATED: 201,               // Resource created successfully
  NO_CONTENT: 204,            // Success but no body to return

  // ── 4xx Client Errors ────────────────────────────────────────────────────────
  BAD_REQUEST: 400,           // Invalid request body / params
  UNAUTHORIZED: 401,          // Not authenticated (no/invalid token)
  FORBIDDEN: 403,             // Authenticated but not authorized (wrong role)
  NOT_FOUND: 404,             // Resource doesn't exist
  METHOD_NOT_ALLOWED: 405,    // Wrong HTTP method for this endpoint
  CONFLICT: 409,              // Duplicate resource (e.g., email already exists)
  UNPROCESSABLE_ENTITY: 422,  // Validation failed
  TOO_MANY_REQUESTS: 429,     // Rate limit exceeded

  // ── 5xx Server Errors ────────────────────────────────────────────────────────
  INTERNAL_SERVER_ERROR: 500, // Unexpected server error
  BAD_GATEWAY: 502,           // Upstream service failed
  SERVICE_UNAVAILABLE: 503,   // Server temporarily unavailable
});
