/**
 * @file user.validator.js
 * @description Zod validation schemas for User profile and Admin user management endpoints.
 *
 * DESIGN DECISIONS:
 * -----------------
 * 1. UPDATE PROFILE vs UPDATE EVERYTHING
 *    Users can only update name, phone, and avatar — NOT email or role.
 *    Email changes require a verification flow (Sprint 10).
 *    Role changes are an admin-only operation.
 *    Allowing users to PATCH their own role is a privilege escalation vulnerability.
 *
 * 2. PHONE VALIDATION
 *    We validate E.164 format (international standard): +919876543210
 *    This handles Indian numbers, international users, and is consistent.
 *    We allow null to let users clear their phone number.
 *
 * 3. CHANGE PASSWORD vs RESET PASSWORD
 *    Change Password: requires CURRENT password — used when logged in
 *    Reset Password:  uses a time-limited token — used when forgot password
 *    Both use the same Zod passwordSchema to enforce complexity rules.
 */

import { z } from 'zod';

// ─── Reusable Sub-Schemas ─────────────────────────────────────────────────────

const phoneSchema = z
  .string()
  .regex(
    /^\+?[1-9]\d{6,14}$/,
    'Phone must be a valid international number (e.g. +919876543210)'
  )
  .nullable()
  .optional();

const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password cannot exceed 72 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// ─── Update Profile (self) ────────────────────────────────────────────────────
export const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: phoneSchema,
    })
    .refine(
      (data) => Object.keys(data).some((k) => data[k] !== undefined),
      'At least one field (name, phone) must be provided'
    ),
});

// ─── Change Password (authenticated user) ─────────────────────────────────────
export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string({ required_error: 'Current password is required' }),
      newPassword: strongPasswordSchema,
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

// ─── Admin: Update User Status ────────────────────────────────────────────────
export const updateUserStatusSchema = z.object({
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive (boolean) is required' }),
    reason: z.string().trim().max(300).optional(),
  }),
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
});

// ─── Admin: Update User Role ──────────────────────────────────────────────────
export const updateUserRoleSchema = z.object({
  body: z.object({
    role: z.enum(['customer', 'organizer', 'admin'], {
      errorMap: () => ({ message: 'Role must be one of: customer, organizer, admin' }),
    }),
  }),
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
});

// ─── User ID Param ────────────────────────────────────────────────────────────
export const userParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'User ID is required'),
  }),
});

// ─── Admin: List Users Query ──────────────────────────────────────────────────
export const listUsersQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    sort: z.string().optional(),
    search: z.string().optional(),
    role: z.enum(['customer', 'organizer', 'admin']).optional(),
    isActive: z
      .string()
      .transform((v) => v === 'true')
      .optional(),
  }),
});
