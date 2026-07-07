/**
 * @file ApiResponse.js
 * @description Standardised API success response builder.
 *
 * WHY A RESPONSE CLASS?
 * ----------------------
 * Without a standard response format, different developers write responses
 * differently:
 *   res.json({ data: user })
 *   res.json({ result: user, ok: true })
 *   res.json({ success: true, user })
 *
 * This is a maintenance nightmare for the frontend team.
 *
 * The ApiResponse class enforces a consistent shape:
 * {
 *   "success": true,
 *   "message": "User fetched successfully",
 *   "data": { ... },
 *   "meta": { ... }  ← for pagination
 * }
 *
 * HOW TO USE IN A CONTROLLER:
 * ----------------------------
 * return res.status(HTTP_STATUS.OK).json(
 *   new ApiResponse(HTTP_STATUS.OK, 'User fetched.', user)
 * );
 *
 * The `statusCode` is included in the body for logging/debugging convenience,
 * even though it's already in the HTTP status header.
 */

export class ApiResponse {
  /**
   * @param {number} statusCode - HTTP status code (e.g. 200, 201)
   * @param {string} message - Human-readable success message
   * @param {*} [data=null] - The response payload (object, array, null)
   * @param {object} [meta=null] - Optional metadata (pagination, totals, etc.)
   */
  constructor(statusCode, message, data = null, meta = null) {
    this.success = statusCode < 400; // Derived automatically from status code
    this.statusCode = statusCode;
    this.message = message;

    // Only include 'data' key if there is data — avoids null clutter
    if (data !== null && data !== undefined) {
      this.data = data;
    }

    // Only include 'meta' key if there is metadata — avoids null clutter
    if (meta !== null && meta !== undefined) {
      this.meta = meta;
    }
  }
}

/**
 * Helper to build a standardised pagination meta object.
 * Use this alongside list responses.
 *
 * @param {number} total - Total number of records in the dataset
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {{ total, totalPages, currentPage, pageSize }}
 *
 * @example
 * const meta = buildPaginationMeta(100, 1, 10);
 * // { total: 100, totalPages: 10, currentPage: 1, pageSize: 10 }
 */
export const buildPaginationMeta = (total, page, limit) => ({
  total,
  totalPages: Math.ceil(total / limit),
  currentPage: page,
  pageSize: limit,
});
