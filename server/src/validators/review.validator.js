/**
 * @file review.validator.js
 * @description Zod validation schemas for Review endpoints.
 *
 * KEY DESIGN DECISIONS:
 * ----------------------
 * 1. RATING AS INTEGER
 *    Rating must be 1, 2, 3, 4, or 5 — not 4.5.
 *    We use z.number().int() to enforce this.
 *    Half-star ratings add complexity (display, averaging) with minimal benefit.
 *
 * 2. BODY REQUIRED, TITLE OPTIONAL
 *    A meaningful review body is required (min 10 chars).
 *    The title is optional — forces users to write something substantive.
 *
 * 3. SEPARATE CREATE vs UPDATE SCHEMAS
 *    Create requires eventId (which event you're reviewing).
 *    Update only allows rating/title/body — not eventId (immutable after creation).
 *    This prevents a user from "moving" a review to a different event.
 */

import { z } from 'zod';

// ─── Create Review ────────────────────────────────────────────────────────────
export const createReviewSchema = z.object({
  body: z
    .object({
      eventId: z.string({ required_error: 'Event ID is required' }).min(1),
      rating: z
        .number({ required_error: 'Rating is required' })
        .int('Rating must be a whole number')
        .min(1, 'Rating must be at least 1')
        .max(5, 'Rating cannot exceed 5'),
      title: z
        .string()
        .trim()
        .max(150, 'Review title cannot exceed 150 characters')
        .optional(),
      body: z
        .string()
        .trim()
        .min(3, 'Review must be at least 3 characters')
        .max(2000, 'Review cannot exceed 2000 characters')
        .optional(),
      comment: z
        .string()
        .trim()
        .min(3, 'Review must be at least 3 characters')
        .max(2000, 'Review cannot exceed 2000 characters')
        .optional(),
    })
    .refine((data) => data.body || data.comment, {
      message: 'Review content is required (minimum 3 characters)',
      path: ['body'],
    }),
});

// ─── Update Review ────────────────────────────────────────────────────────────
export const updateReviewSchema = z.object({
  params: z.object({
    reviewId: z.string().min(1, 'Review ID is required'),
  }),
  body: z
    .object({
      rating: z
        .number()
        .int('Rating must be a whole number')
        .min(1)
        .max(5)
        .optional(),
      title: z
        .string()
        .trim()
        .max(150)
        .nullable()
        .optional(),
      body: z
        .string()
        .trim()
        .min(10, 'Review must be at least 10 characters')
        .max(2000)
        .optional(),
    })
    .refine(
      (data) => Object.keys(data).some((k) => data[k] !== undefined),
      'At least one field (rating, title, body) must be provided'
    ),
});

// ─── Review ID Param ──────────────────────────────────────────────────────────
export const reviewParamSchema = z.object({
  params: z.object({
    reviewId: z.string().min(1, 'Review ID is required'),
  }),
});

// ─── Flag Review (admin) ──────────────────────────────────────────────────────
export const flagReviewSchema = z.object({
  params: z.object({
    reviewId: z.string().min(1, 'Review ID is required'),
  }),
  body: z.object({
    reason: z
      .string({ required_error: 'Flag reason is required' })
      .trim()
      .min(5, 'Please provide a meaningful reason')
      .max(500),
  }),
});

// ─── Get Reviews Query ────────────────────────────────────────────────────────
export const getEventReviewsSchema = z.object({
  params: z.object({
    eventId: z.string().min(1, 'Event ID is required'),
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).optional(),
    includeFlagged: z.string().optional(), // admin only — default false
  }),
});
