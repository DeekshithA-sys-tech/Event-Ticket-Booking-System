

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  ORGANIZER: 'organizer',
  CUSTOMER: 'customer',
});

/**
 * Array of all valid roles.
 * Used for Mongoose schema enum validation.
 * @example
 * role: { type: String, enum: ALL_ROLES }
 */
export const ALL_ROLES = Object.values(ROLES);
