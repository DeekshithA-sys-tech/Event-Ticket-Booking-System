/**
 * @file auth.routes.js
 * @description Authentication route definitions.
 *
 * READING A ROUTE DEFINITION:
 * ----------------------------
 * router.post('/register',
 *   authRateLimiter,        ← Rate limiting (10 req/15min per IP)
 *   validate(registerSchema), ← Validate + sanitise request body
 *   authController.register  ← HTTP handler
 * );
 *
 * This line is the complete security + contract specification for the endpoint.
 * You can read the route definition and immediately know:
 *   - What HTTP method and path
 *   - What rate limit applies
 *   - What the request body must look like
 *   - What the handler does
 *
 * This is why we use middleware chains — each middleware does ONE thing,
 * and the chain composition is self-documenting.
 *
 * SWAGGER TAGS:
 * -------------
 * @swagger tags here register the "Authentication" tag in Swagger UI.
 * Individual endpoint docs are in the controller file.
 */

import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authRateLimiter, passwordResetRateLimiter } from '../middlewares/rateLimiter.middleware.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validators/auth.validator.js';

/**
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: User registration, login, logout, and password management
 */

const router = Router();

// ── Public Routes ─────────────────────────────────────────────────────────────
// These do NOT require authentication

router.post('/register',
  authRateLimiter,
  validate(registerSchema),
  authController.register
);

router.post('/login',
  authRateLimiter,
  validate(loginSchema),
  authController.login
);

router.post('/logout',
  authController.logout
);

router.post('/refresh-token',
  authController.refreshToken
);

router.post('/forgot-password',
  passwordResetRateLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

router.post('/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword
);

// ── Protected Routes ──────────────────────────────────────────────────────────
// `protect` middleware verifies JWT and attaches req.user

router.get('/me',
  protect,
  authController.getMe
);

// Change password — requires current password verification
router.post('/change-password',
  protect,
  authRateLimiter,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
