/**
 * @file user.repository.js
 * @description All MongoDB operations for the User collection.
 *
 * THE REPOSITORY PATTERN — WHY IT EXISTS:
 * -----------------------------------------
 * Without a repository layer, services do their own DB queries:
 *   const user = await User.findOne({ email }).select('+password');
 *
 * This is fine for small apps but causes problems at scale:
 *   - Business logic and DB query syntax are interleaved
 *   - Testing the service requires a real MongoDB connection
 *   - If you switch from Mongoose to Prisma, you change the service
 *   - The same complex query gets duplicated across multiple services
 *
 * With a repository:
 *   - Service calls: userRepository.findByEmail(email)
 *   - Repository owns all Mongoose/MongoDB syntax
 *   - Service tests can mock the repository (no DB required)
 *   - DB query changes happen in ONE place
 *
 * RULE: Repositories contain ONLY database operations.
 * No business logic. No HTTP. No validation.
 * Just: find, create, update, delete.
 */

import User from '../models/user.model.js';

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Find a user by their email address.
 * By default, password is excluded. Pass selectPassword=true to include it.
 *
 * @param {string} email
 * @param {boolean} [selectPassword=false] - Whether to include hashed password
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const findUserByEmail = async (email, selectPassword = false) => {
  const query = User.findOne({ email: email.toLowerCase() });
  if (selectPassword) {
    query.select('+password');
  }
  return query.exec();
};

/**
 * Find a user by their MongoDB ObjectId.
 *
 * @param {string} id
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const findUserById = async (id) => {
  return User.findById(id).exec();
};

/**
 * Find a user by password reset token (stored as SHA-256 hash).
 * Also checks that the token hasn't expired.
 *
 * @param {string} hashedToken - SHA-256 hash of the raw reset token
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const findUserByResetToken = async (hashedToken) => {
  return User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }, // Token must not be expired
  })
    .select('+passwordResetToken +passwordResetExpires')
    .exec();
};

/**
 * Get a paginated list of all users (admin use).
 *
 * @param {object} filter - Mongoose filter object
 * @param {object} options - Pagination options
 * @param {number} options.page
 * @param {number} options.limit
 * @param {string} options.sort
 * @returns {Promise<{ users: Document[], total: number }>}
 */
export const findAllUsers = async (filter = {}, { skip = 0, limit = 10, sortObj = { createdAt: -1 } } = {}) => {
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    User.countDocuments(filter),
  ]);
  return { users, total };
};

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Create a new user document.
 *
 * @param {object} userData - Fields to create the user with
 * @returns {Promise<import('mongoose').Document>}
 */
export const createUser = async (userData) => {
  return User.create(userData);
};

/**
 * Update a user by ID and return the updated document.
 *
 * @param {string} id
 * @param {object} updates - Fields to update
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const updateUserById = async (id, updates) => {
  return User.findByIdAndUpdate(id, updates, {
    new: true,         // Return the updated document
    runValidators: true, // Run schema validators on the update
  }).exec();
};

/**
 * Save a user document (used after modifying a fetched document directly).
 * Triggers pre-save hooks (e.g., password hashing).
 *
 * @param {import('mongoose').Document} user - A fetched Mongoose user document
 * @returns {Promise<import('mongoose').Document>}
 */
export const saveUser = async (user) => {
  return user.save();
};

/**
 * Delete a user by ID.
 *
 * @param {string} id
 * @returns {Promise<import('mongoose').Document|null>}
 */
export const deleteUserById = async (id) => {
  return User.findByIdAndDelete(id).exec();
};

/**
 * Check if an email is already registered.
 *
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export const emailExists = async (email) => {
  const count = await User.countDocuments({ email: email.toLowerCase() });
  return count > 0;
};
