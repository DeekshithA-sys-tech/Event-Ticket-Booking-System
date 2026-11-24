/**
 * @file ai.routes.js
 * @description Route definitions for AI agent chat interactions.
 */

import { Router } from 'express';
import { chatWithAI, queryRAG } from '../controllers/ai.controller.js';
import { optionalProtect } from '../middlewares/auth.middleware.js';

const router = Router();

// POST /api/v1/ai/chat — works for both guests (discovery) and authenticated users (booking, analytics)
router.post('/chat', optionalProtect, chatWithAI);

// POST /api/v1/ai/rag/query — direct RAG query for policies, venue guidelines, and FAQs
router.post('/rag/query', queryRAG);

export default router;
