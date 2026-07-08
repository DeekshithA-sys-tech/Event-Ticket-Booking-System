/**
 * @file category.routes.js
 * @description Category route definitions.
 *
 * ACCESS CONTROL SUMMARY:
 * -----------------------
 * GET /categories          → Public (no auth needed)
 * POST /categories         → Admin only
 * PATCH /categories/:id    → Admin only
 * DELETE /categories/:id   → Admin only
 */

import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryParamSchema,
} from '../validators/category.validator.js';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/', categoryController.getAllCategories);

// ── Admin Only ────────────────────────────────────────────────────────────────
router.post(
  '/',
  protect,
  adminOnly,
  validate(createCategorySchema),
  categoryController.createCategory
);

router.patch(
  '/:categoryId',
  protect,
  adminOnly,
  validate(updateCategorySchema),
  categoryController.updateCategory
);

router.delete(
  '/:categoryId',
  protect,
  adminOnly,
  validate(categoryParamSchema),
  categoryController.deleteCategory
);

export default router;
