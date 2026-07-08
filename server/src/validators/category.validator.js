/**
 * @file category.validator.js
 * @description Zod validation schemas for Category endpoints.
 */

import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Category name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name cannot exceed 50 characters'),
    description: z.string().trim().max(200).optional(),
    icon: z.string().trim().max(10).optional(),
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(50).optional(),
    description: z.string().trim().max(200).optional(),
    icon: z.string().trim().max(10).optional(),
    isActive: z.boolean().optional(),
  }),
  params: z.object({
    categoryId: z.string().min(1, 'Category ID is required'),
  }),
});

export const categoryParamSchema = z.object({
  params: z.object({
    categoryId: z.string().min(1, 'Category ID is required'),
  }),
});
