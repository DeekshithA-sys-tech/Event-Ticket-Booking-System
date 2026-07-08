/**
 * @file pagination.js
 * @description Reusable pagination, sorting, and filtering query builder.
 *
 * WHY A DEDICATED PAGINATION UTILITY?
 * ------------------------------------
 * Every listing endpoint needs pagination: GET /events?page=2&limit=10&sort=-date
 * Without a utility, each repository method has its own pagination logic:
 *
 *   const page = parseInt(req.query.page) || 1;
 *   const limit = Math.min(parseInt(req.query.limit) || 10, 50);
 *   const skip = (page - 1) * limit;
 *   ...
 *
 * This duplicates 10+ lines in every repository method.
 *
 * WHAT THIS UTILITY PROVIDES:
 * ----------------------------
 * parsePaginationParams(query) → { page, limit, skip, sort }
 *   Safely extracts and validates pagination params from req.query.
 *
 * buildTextSearch(searchTerm, fields) → Mongoose filter object
 *   Builds a case-insensitive regex search across multiple fields.
 *
 * DESIGN DECISIONS:
 * -----------------
 * - `limit` is capped at 50 — prevents "give me all 10,000 events" DoS
 * - `sort` supports multiple fields: 'date,-price' → { date: 1, price: -1 }
 * - Prefix '-' = descending, no prefix = ascending (matches MongoDB convention)
 */

/**
 * Parses and validates pagination parameters from a query string object.
 *
 * @param {object} query - The req.query object
 * @param {object} [defaults]
 * @param {number} [defaults.defaultLimit=10]
 * @param {string} [defaults.defaultSort='-createdAt']
 * @returns {{ page: number, limit: number, skip: number, sortObj: object }}
 *
 * @example
 * // req.query = { page: '2', limit: '5', sort: '-date' }
 * const { page, limit, skip, sortObj } = parsePaginationParams(req.query);
 * // → { page: 2, limit: 5, skip: 5, sortObj: { date: -1 } }
 */
export const parsePaginationParams = (
  query = {},
  { defaultLimit = 10, defaultSort = '-createdAt' } = {}
) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;

  // Parse sort string: 'date,-price' → { date: 1, price: -1 }
  const sortString = query.sort || defaultSort;
  const sortObj = sortString.split(',').reduce((acc, field) => {
    const trimmed = field.trim();
    if (trimmed.startsWith('-')) {
      acc[trimmed.slice(1)] = -1;
    } else {
      acc[trimmed] = 1;
    }
    return acc;
  }, {});

  return { page, limit, skip, sortObj };
};

/**
 * Builds a Mongoose filter for case-insensitive text search across fields.
 * Uses regex — for full-text search at scale, use MongoDB Atlas Search.
 *
 * @param {string} searchTerm - The raw search query string
 * @param {string[]} fields - Field names to search across
 * @returns {object|null} Mongoose $or filter object, or null if no search term
 *
 * @example
 * buildTextSearch('rock concert', ['title', 'venue'])
 * // → { $or: [{ title: /rock concert/i }, { venue: /rock concert/i }] }
 */
export const buildTextSearch = (searchTerm, fields) => {
  if (!searchTerm || searchTerm.trim() === '') return null;

  // Escape special regex characters to prevent regex injection
  const escaped = searchTerm.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');

  return {
    $or: fields.map((field) => ({ [field]: regex })),
  };
};

/**
 * Builds a price range filter.
 *
 * @param {string|number} minPrice
 * @param {string|number} maxPrice
 * @returns {object|null} Mongoose range filter or null
 */
export const buildPriceFilter = (minPrice, maxPrice) => {
  const filter = {};
  const min = parseFloat(minPrice);
  const max = parseFloat(maxPrice);

  if (!isNaN(min)) filter.$gte = min;
  if (!isNaN(max)) filter.$lte = max;

  return Object.keys(filter).length > 0 ? filter : null;
};

/**
 * Builds a date range filter.
 *
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {object|null} Mongoose date range filter or null
 */
export const buildDateFilter = (startDate, endDate) => {
  const filter = {};
  if (startDate) filter.$gte = new Date(startDate);
  if (endDate) filter.$lte = new Date(endDate);
  return Object.keys(filter).length > 0 ? filter : null;
};
