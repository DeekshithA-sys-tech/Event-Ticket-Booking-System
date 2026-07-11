

export const MESSAGES = Object.freeze({
  // ── Generic ──────────────────────────────────────────────────────────────────
  SUCCESS: 'Operation successful',
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  FETCHED: 'Data fetched successfully',
  NOT_FOUND: 'Resource not found',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
  VALIDATION_ERROR: 'Validation failed. Please check your input.',

  // ── Auth ─────────────────────────────────────────────────────────────────────
  AUTH: {
    REGISTER_SUCCESS: 'Account created successfully. Welcome!',
    LOGIN_SUCCESS: 'Logged in successfully.',
    LOGOUT_SUCCESS: 'Logged out successfully.',
    TOKEN_REFRESHED: 'Access token refreshed successfully.',
    INVALID_CREDENTIALS: 'Invalid email or password.',
    EMAIL_TAKEN: 'An account with this email already exists.',
    UNAUTHORIZED: 'Authentication required. Please log in.',
    FORBIDDEN: 'You do not have permission to perform this action.',
    TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
    TOKEN_INVALID: 'Invalid or malformed token.',
    FORGOT_PASSWORD_EMAIL_SENT: 'If an account exists with that email, a reset link has been sent.',
    PASSWORD_RESET_SUCCESS: 'Password reset successfully. Please log in with your new password.',
    PASSWORD_RESET_TOKEN_INVALID: 'Invalid or expired password reset token.',
    EMAIL_VERIFIED: 'Email verified successfully.',
    EMAIL_ALREADY_VERIFIED: 'Email is already verified.',
  },

  // ── User ──────────────────────────────────────────────────────────────────────
  USER: {
    FETCHED: 'User fetched successfully.',
    UPDATED: 'Profile updated successfully.',
    DELETED: 'User deleted successfully.',
    NOT_FOUND: 'User not found.',
    PASSWORD_CHANGED: 'Password changed successfully.',
    ACCOUNT_DEACTIVATED: 'Account has been deactivated.',
    ACCOUNT_ACTIVATED: 'Account has been activated.',
  },

  // ── Events ────────────────────────────────────────────────────────────────────
  EVENT: {
    CREATED: 'Event created successfully.',
    UPDATED: 'Event updated successfully.',
    DELETED: 'Event deleted successfully.',
    FETCHED: 'Event fetched successfully.',
    LIST_FETCHED: 'Events fetched successfully.',
    NOT_FOUND: 'Event not found.',
    NOT_OWNER: 'You can only manage your own events.',
    HAS_BOOKINGS: 'Cannot delete an event that has confirmed bookings.',
    BANNER_UPLOADED: 'Event banner uploaded successfully.',
    STATUS_UPDATED: 'Event status updated successfully.',
  },

  // ── Booking ───────────────────────────────────────────────────────────────────
  BOOKING: {
    CREATED: 'Booking confirmed successfully!',
    FETCHED: 'Booking fetched successfully.',
    LIST_FETCHED: 'Bookings fetched successfully.',
    NOT_FOUND: 'Booking not found.',
    CANCELLED: 'Booking cancelled successfully.',
    CANNOT_CANCEL: 'This booking cannot be cancelled.',
    SEATS_LOCKED: 'Seats locked successfully. You have 10 minutes to complete your booking.',
    SEATS_LOCK_EXPIRED: 'Your seat lock has expired. Please select seats again.',
    SEAT_UNAVAILABLE: 'One or more selected seats are no longer available.',
    DOUBLE_BOOKING: 'You have already booked this event.',
  },

  // ── Categories ────────────────────────────────────────────────────────────────
  CATEGORY: {
    CREATED: 'Category created successfully.',
    UPDATED: 'Category updated successfully.',
    DELETED: 'Category deleted successfully.',
    LIST_FETCHED: 'Categories fetched successfully.',
    NOT_FOUND: 'Category not found.',
    NAME_TAKEN: 'A category with this name already exists.',
  },

  // ── Health ────────────────────────────────────────────────────────────────────
  HEALTH: {
    OK: 'Server is healthy.',
    DB_ERROR: 'Database connection is unhealthy.',
  },

  // ── Reviews ───────────────────────────────────────────────────────────────────
  REVIEW: {
    CREATED: 'Review submitted successfully.',
    UPDATED: 'Review updated successfully.',
    DELETED: 'Review deleted successfully.',
    FETCHED: 'Review fetched successfully.',
    LIST_FETCHED: 'Reviews fetched successfully.',
    NOT_FOUND: 'Review not found.',
    ALREADY_REVIEWED: 'You have already reviewed this event.',
    NOT_ELIGIBLE: 'You can only review events you have attended with a confirmed booking.',
    FLAGGED: 'Review has been flagged for moderation.',
    UNFLAGGED: 'Review flag has been removed.',
  },
});
