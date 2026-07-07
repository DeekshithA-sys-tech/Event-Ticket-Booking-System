/**
 * @file roles.js
 * @description User role constants used throughout the application.
 *
 * WHY A CONSTANT INSTEAD OF HARDCODING STRINGS?
 * -----------------------------------------------
 * Hardcoding 'admin', 'organizer', 'customer' as strings is a classic
 * junior mistake. Problems with strings:
 *  - Typos cause silent bugs: 'Admin' !== 'admin'
 *  - Find-and-replace becomes risky when adding a new role
 *  - No IDE autocomplete or type safety
 *
 * Using a frozen constant object means:
 *  - A typo in ROLES.ADMINN causes a ReferenceError (caught immediately)
 *  - One source of truth for all role names across the codebase
 *  - Easy to add new roles without hunting through files
 *
 * Object.freeze() prevents accidental mutation of the constants at runtime.
 */

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
