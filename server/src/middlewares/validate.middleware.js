/**
 * @file validate.middleware.js
 * @description Zod schema validation middleware runner.
 *
 * HOW THIS CONNECTS TO THE VALIDATORS:
 * -------------------------------------
 * 1. A Zod schema is defined in validators/auth.validator.js
 * 2. The route applies: router.post('/register', validate(registerSchema), controller)
 * 3. THIS middleware runs the schema against { body, params, query }
 * 4. If validation fails → 400 response with field-level error details
 * 5. If validation passes → cleaned data is written back to req and next() is called
 *
 * WHY WRITE PARSED DATA BACK TO req?
 * ------------------------------------
 * Zod doesn't just validate — it also TRANSFORMS:
 *   - .toLowerCase() on email fields
 *   - .default('customer') on optional role
 *   - .trim() on string fields
 *
 * By assigning the Zod-parsed output back to req.body, the controller
 * receives cleaned, normalised data — not the raw user input.
 * This eliminates an entire class of bugs from case-sensitive comparisons.
 */

import { z } from 'zod';
import { HTTP_STATUS } from '../constants/httpStatus.js';

/**
 * Factory function that returns an Express middleware for a given Zod schema.
 *
 * @param {z.ZodSchema} schema - A Zod schema object with optional body/params/query keys
 * @returns {import('express').RequestHandler} Validation middleware
 *
 * @example
 * router.post('/register', validate(registerSchema), authController.register);
 */
export const validate = (schema) => (req, res, next) => {
  // Parse the relevant parts of the request through the schema
  const result = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!result.success) {
    // Zod's `flatten()` gives us a clean { fieldErrors, formErrors } structure
    const { fieldErrors, formErrors } = result.error.flatten();

    // Build an array of { field, message } objects for our standard error format
    const errors = [
      // Field-level errors (e.g. email is invalid, password too short)
      ...Object.entries(fieldErrors).flatMap(([field, messages]) =>
        messages.map((message) => ({
          field: field.replace(/^(body|params|query)\./, ''), // strip "body." prefix
          message,
        }))
      ),
      // Form-level errors (e.g. passwords don't match — attached to the form, not a single field)
      ...formErrors.map((message) => ({ field: 'form', message })),
    ];

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed. Please check your input.',
      errors,
    });
  }

  // Write Zod's parsed (and transformed) data back to the request object
  // This ensures controllers work with cleaned, normalised data
  if (result.data.body) req.body = result.data.body;
  if (result.data.params) req.params = result.data.params;
  if (result.data.query) req.query = result.data.query;

  next();
};
