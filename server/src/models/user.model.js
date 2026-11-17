/**
 * @file user.model.js
 * @description Mongoose schema for the User collection.
 *
 * DESIGN DECISIONS:
 * -----------------
 *
 * 1. PASSWORD HASHING IN A PRE-SAVE HOOK — NOT IN THE SERVICE
 *    ──────────────────────────────────────────────────────────
 *    A common mistake is hashing passwords in the service layer:
 *      user.password = await bcrypt.hash(password, 12); // ← in service
 *
 *    The problem: every code path that saves a password (register, reset,
 *    change-password) must remember to hash. One forgotten call = plaintext
 *    passwords in the DB.
 *
 *    Our approach: the Mongoose pre-save hook ALWAYS hashes before writing to
 *    the DB. The service just sets user.password = plainText and saves. The
 *    model layer is the single enforcement point.
 *
 *    We skip hashing if the password wasn't modified (e.g. updating the name).
 *    That's what `if (!this.isModified('password')) return next()` does.
 *
 * 2. `select: false` ON SENSITIVE FIELDS
 *    ─────────────────────────────────────
 *    By default, Mongoose returns ALL fields in every query. If you do
 *    `User.findById(id)` and send the result to the client, you accidentally
 *    expose the hashed password.
 *
 *    `select: false` means these fields are NEVER returned unless you
 *    explicitly request them: `User.findById(id).select('+password')`
 *    This is a security default — opt-IN to sensitive data, not opt-OUT.
 *
 * 3. VIRTUAL `comparePassword` METHOD
 *    ────────────────────────────────────
 *    We attach `comparePassword` to the schema instance (not the service)
 *    because it's intrinsically tied to the model — it needs access to the
 *    hashed password stored in `this.password`.
 *
 * 4. NO PLAINTEXT TOKENS IN DB
 *    ──────────────────────────
 *    `passwordResetToken` stores a SHA-256 HASH of the token, not the raw
 *    token. We email the raw token to the user, hash it server-side, and
 *    compare against the hash in the DB. If the DB is breached, attackers
 *    can't use the hashed token directly.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { ALL_ROLES, ROLES } from '../constants/roles.js';

const userSchema = new mongoose.Schema(
  {
    // ── Personal Info ────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address',
      ],
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    avatar: {
      type: String, // Cloudinary URL
      default: null,
    },

    // ── Authentication ───────────────────────────────────────────────────────
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // NEVER returned in queries by default
    },
    role: {
      type: String,
      enum: {
        values: ALL_ROLES,
        message: `Role must be one of: ${ALL_ROLES.join(', ')}`,
      },
      default: ROLES.CUSTOMER,
    },

    // ── Account Status ───────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
      // If false, user cannot log in — used for admin suspension
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    // ── Password Reset ────────────────────────────────────────────────────────
    // We store the SHA-256 HASH of the reset token, not the raw token.
    // The raw token is emailed to the user. This protects against DB breaches.
    passwordResetToken: {
      type: String,
      select: false, // Never returned unless explicitly requested
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },

    // ── Email Verification Token ──────────────────────────────────────────────
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
  },
  {
    // Automatically adds `createdAt` and `updatedAt` timestamps
    timestamps: true,
    // When converting to JSON (for API responses), remove internal fields
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        // Remove sensitive fields from any JSON serialization
        delete ret.password;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpires;
        delete ret.__v; // Mongoose internal version key
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// email is already indexed via `unique: true` above.
// Additional indexes for common query patterns:
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// ─── Pre-Save Hook: Password Hashing ─────────────────────────────────────────
/**
 * Before saving a user document, hash the password if it was modified.
 * Cost factor 12 = 2^12 bcrypt iterations.
 *
 * Why 12?
 * - 10 is the default (too low for 2024 hardware)
 * - 14 starts to feel slow for login (~1.5s)
 * - 12 is the industry sweet spot: secure enough, fast enough (~250ms)
 */
userSchema.pre('save', async function (next) {
  // Skip if password wasn't changed (e.g. updating name, avatar, etc.)
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Compares a plaintext candidate password against the stored hash.
 * Must be called on a user fetched with `.select('+password')`.
 *
 * @param {string} candidatePassword - The password entered by the user
 * @returns {Promise<boolean>} true if passwords match
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Checks if the user's password was changed after a JWT was issued.
 * Used to invalidate tokens that were issued before a password reset.
 *
 * @param {number} jwtIssuedAt - JWT `iat` claim (seconds since epoch)
 * @returns {boolean} true if password was changed after token was issued
 */
userSchema.methods.changedPasswordAfter = function (jwtIssuedAt) {
  if (this.passwordChangedAt) {
    const changedAtSeconds = Math.floor(this.passwordChangedAt.getTime() / 1000);
    return jwtIssuedAt < changedAtSeconds;
  }
  return false; // Password was never changed
};

/**
 * Generates a random 32-byte email verification token, hashes it for storage,
 * and sets expiration to 24 hours.
 * @returns {string} Raw unhashed token to email to the user
 */
userSchema.methods.createEmailVerificationToken = function () {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return rawToken;
};

const User = mongoose.model('User', userSchema);
export default User;
