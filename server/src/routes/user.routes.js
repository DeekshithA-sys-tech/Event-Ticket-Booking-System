/**
 * @file user.routes.js
 * @description User profile and admin user management route definitions.
 *
 * ACCESS CONTROL SUMMARY:
 * -----------------------
 * GET    /users/me                → Any authenticated user
 * PATCH  /users/me                → Any authenticated user
 * POST   /users/me/avatar         → Any authenticated user
 *
 * GET    /users                   → Admin only
 * GET    /users/:userId           → Admin only
 * PATCH  /users/:userId/status    → Admin only
 * PATCH  /users/:userId/role      → Admin only
 * DELETE /users/:userId           → Admin only
 *
 * ROUTE ORDER REMINDER:
 * ---------------------
 * '/me' and '/me/avatar' must be registered BEFORE '/:userId'
 * to prevent Express treating 'me' as a userId param.
 */

import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { uploadSingle } from '../middlewares/upload.middleware.js';
import {
  updateProfileSchema,
  updateUserStatusSchema,
  updateUserRoleSchema,
  userParamSchema,
  listUsersQuerySchema,
} from '../validators/user.validator.js';

const router = Router();

// All user routes require authentication
router.use(protect);

// ── Self Profile Routes (static — must precede /:userId) ──────────────────────
router.get('/me', userController.getMyProfile);

router.patch('/me', validate(updateProfileSchema), userController.updateMyProfile);

router.post(
  '/me/avatar',
  uploadSingle('avatar'), // Multer parses multipart/form-data → req.file.buffer
  userController.uploadMyAvatar
);

// ── Admin Routes ──────────────────────────────────────────────────────────────
router.get('/', adminOnly, validate(listUsersQuerySchema), userController.getAllUsers);

router.get('/:userId', adminOnly, validate(userParamSchema), userController.getUserById);

router.patch(
  '/:userId/status',
  adminOnly,
  validate(updateUserStatusSchema),
  userController.updateUserStatus
);

router.patch(
  '/:userId/role',
  adminOnly,
  validate(updateUserRoleSchema),
  userController.updateUserRole
);

router.delete('/:userId', adminOnly, validate(userParamSchema), userController.deleteUser);

export default router;
