/**
 * @file auth.validator.js
 * @description Zod validation schemas for all authentication endpoints.

 *

 *
 * WHAT VALIDATION DOES FOR SECURITY:
 * ------------------------------------
 * - Rejects unexpected fields (prevents mass assignment attacks)
 * - Enforces types (prevents type coercion attacks)
 * - Enforces length limits (prevents buffer-size DoS)
 * - Enforces formats (email, password complexity)
 */

import { z } from 'zod';

// ─── Reusable Sub-Schemas ─────────────────────────────────────────────────────

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .email('Please enter a valid email address')
  .toLowerCase() // Normalise to lowercase before saving
  .trim();

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password cannot exceed 72 characters') // bcrypt silently truncates at 72 bytes
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// ─── Schema: Register ─────────────────────────────────────────────────────────
export const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name cannot exceed 100 characters'),
    email: emailSchema,
    password: passwordSchema,
    // Role can only be 'customer' or 'organizer' — 'admin' is never self-assigned
    role: z
      .enum(['customer', 'organizer'], {
        errorMap: () => ({ message: 'Role must be either customer or organizer' }),
      })
      .optional()
      .default('customer'),
  }),
});

// ─── Schema: Login ────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    // We use a simple string here, not passwordSchema
    // Reason: login should fail with "invalid credentials", not "password too short"
    // Detailed password errors help attackers enumerate what passwords exist
    password: z.string({ required_error: 'Password is required' }),
  }),
});

// ─── Schema: Forgot Password ──────────────────────────────────────────────────
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

// ─── Schema: Reset Password ───────────────────────────────────────────────────
export const resetPasswordSchema = z.object({
  body: z
    .object({
      token: z.string({ required_error: 'Reset token is required' }).min(1),
      password: passwordSchema,
      confirmPassword: z.string({ required_error: 'Please confirm your password' }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'], // Attach the error to the confirmPassword field
    }),
});

// ─── Schema: Change Password ──────────────────────────────────────────────────
export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string({ required_error: 'Current password is required' }),
      newPassword: passwordSchema,
      confirmPassword: z.string({ required_error: 'Please confirm your new password' }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      message: 'New password must be different from your current password',
      path: ['newPassword'],
    }),
});
