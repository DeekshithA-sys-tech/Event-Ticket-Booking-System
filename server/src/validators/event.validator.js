/**
 * @file event.validator.js
 * @description Zod validation schemas for Event endpoints.
 *
 * DESIGN NOTES:
 * -------------
 * - Seat layout is validated to ensure rows have unique names and each
 *   seat has a unique seatId within its row.
 * - Date must be in the future at time of creation (past dates rejected).
 * - Price can be 0 (free events) but not negative.
 * - Status updates are validated separately from core event updates
 *   because only admins can change status.
 */

import { z } from 'zod';

// ─── Seat Schema (for layout validation) ─────────────────────────────────────
const seatInputSchema = z.object({
  seatId: z.string().min(1, 'Seat ID is required'),
  seatNumber: z.number().int().positive('Seat number must be a positive integer'),
});

const rowInputSchema = z.object({
  row: z
    .string()
    .min(1, 'Row label is required')
    .max(10, 'Row label cannot exceed 10 characters'),
  seats: z
    .array(seatInputSchema)
    .min(1, 'Each row must have at least 1 seat'),
});

// ─── Create Event Schema ──────────────────────────────────────────────────────
export const createEventSchema = z.object({
  body: z.object({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(3, 'Title must be at least 3 characters')
      .max(200, 'Title cannot exceed 200 characters'),
    description: z
      .string({ required_error: 'Description is required' })
      .trim()
      .min(10, 'Description must be at least 10 characters')
      .max(5000, 'Description cannot exceed 5000 characters'),
    category: z.string({ required_error: 'Category ID is required' }).min(1),
    venue: z
      .string({ required_error: 'Venue is required' })
      .trim()
      .min(2)
      .max(200),
    city: z
      .string({ required_error: 'City is required' })
      .trim()
      .min(2)
      .max(100),
    address: z.string().trim().max(300).optional(),
    date: z
      .string({ required_error: 'Date is required' })
      .refine((val) => !isNaN(Date.parse(val)), 'Invalid date format')
      .refine(
        (val) => new Date(val) > new Date(),
        'Event date must be in the future'
      ),
    time: z
      .string({ required_error: 'Time is required' })
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format (24-hour)'),
    duration: z.number().int().positive().optional(),
    ticketPrice: z
      .number({ required_error: 'Ticket price is required' })
      .min(0, 'Price cannot be negative'),
    seatLayout: z
      .array(rowInputSchema)
      .min(1, 'Seat layout must have at least 1 row')
      .refine((rows) => {
        // Ensure row labels are unique within this event
        const rowNames = rows.map((r) => r.row);
        return new Set(rowNames).size === rowNames.length;
      }, 'Row labels must be unique')
      .optional(),
  }),
});

// ─── Update Event Schema ──────────────────────────────────────────────────────
// All fields optional for PATCH — but at least one must be provided
export const updateEventSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(3).max(200).optional(),
      description: z.string().trim().min(10).max(5000).optional(),
      venue: z.string().trim().min(2).max(200).optional(),
      city: z.string().trim().min(2).max(100).optional(),
      address: z.string().trim().max(300).optional(),
      date: z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), 'Invalid date format')
        .optional(),
      time: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:MM format')
        .optional(),
      duration: z.number().int().positive().optional(),
      ticketPrice: z.number().min(0).optional(),
    })
    .refine(
      (data) => Object.keys(data).length > 0,
      'At least one field must be provided to update'
    ),
  params: z.object({
    eventId: z.string().min(1, 'Event ID is required'),
  }),
});

// ─── Update Event Status Schema (Admin only) ──────────────────────────────────
export const updateEventStatusSchema = z.object({
  body: z.object({
    status: z.enum(['published', 'cancelled', 'draft'], {
      errorMap: () => ({
        message: 'Status must be one of: published, cancelled, draft',
      }),
    }),
    reason: z.string().trim().max(500).optional(), // Optional rejection reason
  }),
  params: z.object({
    eventId: z.string().min(1, 'Event ID is required'),
  }),
});

// ─── Event Param Schema ───────────────────────────────────────────────────────
export const eventParamSchema = z.object({
  params: z.object({
    eventId: z.string().min(1, 'Event ID is required'),
  }),
});

// ─── Event List Query Schema ──────────────────────────────────────────────────
export const eventListQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    sort: z.string().optional(),
    search: z.string().optional(),
    city: z.string().optional(),
    category: z.string().optional(),
    status: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional(),
  }),
});
