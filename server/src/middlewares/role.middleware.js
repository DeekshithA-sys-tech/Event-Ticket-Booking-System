/**

 * WHAT IS RBAC?
 * -------------
 * Role-Based Access Control means: "you can do this because of YOUR ROLE,
 * not because of who you specifically are."
 *
 * Our roles:
 *   admin     → Can do everything
 *   organizer → Can create/manage events, view their own bookings
 *   customer  → Can browse events, book tickets, view their own profile
 *
 * HOW THIS MIDDLEWARE WORKS:
 * ---------------------------
 * `authorize` is a FACTORY function — it returns a middleware:
 *
 *   router.delete('/events/:id',
 *     protect,                              // Must be logged in
 *     authorize('admin', 'organizer'),      // Must have one of these roles
 *     eventController.deleteEvent
 *   );
 *
 * If the user's role is NOT in the allowed list → 403 Forbidden.



 */

import { ROLES } from '../constants/roles.js';
import { AuthorizationError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';

/**
 * Restricts route access to users with the specified role(s).
 * Must be used AFTER the `protect` middleware.
 *
 * @param {...string} allowedRoles - One or more role strings that can access the route
 * @returns {import('express').RequestHandler} Authorization middleware
 *

 */
export const authorize = (...allowedRoles) => {
  return (req, _res, next) => {
    // req.user is set by the `protect` middleware that must run before this
    if (!req.user) {
      // This should never happen in a correctly configured route, but we guard it
      throw new AuthorizationError('Access denied. Authentication required first.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AuthorizationError(MESSAGES.AUTH.FORBIDDEN);
    }

    next();
  };
};



/** Allows only admin users */
export const adminOnly = authorize(ROLES.ADMIN);

/** Allows only organizer users */
export const organizerOnly = authorize(ROLES.ORGANIZER);

/** Allows only customer users */
export const customerOnly = authorize(ROLES.CUSTOMER);

/** Allows admins and organizers */
export const adminOrOrganizer = authorize(ROLES.ADMIN, ROLES.ORGANIZER);
