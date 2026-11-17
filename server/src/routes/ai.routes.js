/**
 * @file ai.routes.js
 * @description Route definitions for AI agent chat interactions.
 */

import { Router } from 'express';
import { chatWithAI } from '../controllers/ai.controller.js';
import { optionalProtect } from '../middlewares/auth.middleware.js';

const router = Router();

// POST /api/v1/ai/chat — works for both guests (discovery) and authenticated users (booking, analytics)
router.post('/chat', optionalProtect, chatWithAI);

export default router;
