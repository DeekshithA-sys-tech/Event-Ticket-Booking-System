/**
 * @file auth.middleware.js
 * @description JWT access token verification middleware.
 *
 * WHAT THIS MIDDLEWARE DOES:
 * ---------------------------
 * 1. Reads the Authorization header: `Bearer <token>`
 * 2. Verifies the JWT signature using the access token secret
 * 3. Checks the token is not expired
 * 4. Fetches the user from the database (to check isActive, role)
 * 5. Attaches the user object to `req.user`
 * 6. Calls `next()` to proceed to the route handler
 *
 * WHY FETCH THE USER FROM DB ON EVERY REQUEST?
 * ---------------------------------------------
 * You might think: "The JWT already contains id and role — why go to the DB?"
 *
 * Answer: The JWT contains the state AT THE TIME IT WAS ISSUED.
 * Between token issuance and now:
 *   - An admin might have suspended the user (isActive = false)
 *   - A user's role might have changed (customer → organizer)
 *
*/
import User from '../models/user.model.js';
import { verifyAccessToken } from '../utils/generateTokens.js';
import { AuthenticationError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { MESSAGES } from '../constants/messages.js';


export const protect = asyncHandler(async (req, _res, next) => {
  // ── Step 1: Extract token from Authorization header ──────────────────────
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError(MESSAGES.AUTH.UNAUTHORIZED);
  }

  const token = authHeader.split(' ')[1]; // 'Bearer <token>' → '<token>'

  if (!token) {
    throw new AuthenticationError(MESSAGES.AUTH.UNAUTHORIZED);
  }

  // ── Step 2: Verify JWT signature and expiry ──────────────────────────────
  // verifyAccessToken throws JsonWebTokenError or TokenExpiredError if invalid.
  // These are caught by the global error middleware and formatted correctly.
  const decoded = verifyAccessToken(token);

  // ── Step 3: Fetch user from DB ───────────────────────────────────────────
  // Validates the user still exists and is active
  const user = await User.findById(decoded.id);

  if (!user) {
    throw new AuthenticationError('The user belonging to this token no longer exists.');
  }

  if (!user.isActive) {
    throw new AuthenticationError('Your account has been suspended. Please contact support.');
  }

  // ── Step 4: Attach user to request ───────────────────────────────────────
  // All subsequent middleware and controllers can access req.user
  req.user = user;
  next();
});

/**
 * Optional authentication middleware.
 * Same as protect, but NEVER throws — it simply skips setting req.user
 * if no valid token is provided.
 *
 * USE CASE: Public endpoints that grant extra capabilities to admins.
 *   Example: GET /events/:id/reviews
 *   - Public users: see only non-flagged reviews
 *   - Admins (with valid token): can pass ?includeFlagged=true
 *
 * The route handler must check `if (req.user)` before using req.user.
 */
export const optionalProtect = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id);

    req.user = user?.isActive ? user : null;
  } catch {
    // Any error (expired token, invalid signature, etc.) → unauthenticated
    req.user = null;
  }
  next();
};

