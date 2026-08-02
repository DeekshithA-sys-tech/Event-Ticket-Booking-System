/**
 * @file versioning.middleware.js
 * @description API Versioning, Deprecation Header Control, and Negotiation Middleware.
 *
 * FEATURES:
 * ─────────
 * 1. Version Injection: Attaches `X-API-Version: v1` to every response.
 * 2. Version Header Negotiation: Accepts `X-API-Version` header or URL prefix `/api/v1`.
 * 3. RFC 8594 / RFC 9110 Standard Deprecation Headers (`Deprecation`, `Sunset`, `Link`).
 */

import { HTTP_STATUS } from '../constants/httpStatus.js';

export const CURRENT_API_VERSION = 'v1';
export const SUPPORTED_API_VERSIONS = ['v1'];

/**
 * Standard API Versioning middleware applied globally to /api routes.
 * Ensures `X-API-Version` response header is present on every request.
 */
export const apiVersioningMiddleware = (req, res, next) => {
  // Always attach current API version to response header
  res.setHeader('X-API-Version', CURRENT_API_VERSION);

  const requestedVersion = req.get('X-API-Version');

  // If client specified an unsupported version header, return 400 Bad Request
  if (requestedVersion && !SUPPORTED_API_VERSIONS.includes(requestedVersion.toLowerCase())) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: `Unsupported API version '${requestedVersion}'. Supported versions: ${SUPPORTED_API_VERSIONS.join(', ')}`,
      currentVersion: CURRENT_API_VERSION,
    });
  }

  next();
};

/**
 * Middleware factory to mark specific legacy endpoints as deprecated.
 * Implements RFC 8594 Deprecation header and RFC 9110 Sunset date header.
 *
 * @param {object} options
 * @param {string} options.sunsetDate - ISO date string when endpoint will be retired (e.g. "2026-12-31")
 * @param {string} [options.successorUrl] - Alternative endpoint URL to use
 * @returns {import('express').RequestHandler}
 */
export const deprecateEndpoint = ({ sunsetDate, successorUrl }) => {
  return (_req, res, next) => {
    // Deprecation header indicates the endpoint is deprecated
    res.setHeader('Deprecation', 'true');

    if (sunsetDate) {
      // Sunset header indicates when the endpoint will be turned off
      res.setHeader('Sunset', new Date(sunsetDate).toUTCString());
    }

    if (successorUrl) {
      // Link header points to the successor endpoint resource
      res.setHeader('Link', `<${successorUrl}>; rel="successor-version"`);
    }

    next();
  };
};
