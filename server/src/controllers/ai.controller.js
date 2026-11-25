/**
 * @file ai.controller.js
 * @description Controller for forwarding AI chat interactions to Python ai-service.
 */

import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { logger } from '../utils/logger.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

export const chatWithAI = asyncHandler(async (req, res) => {
  const {
    conversation_id = 'default',
    message,
    history = [],
    confirmation_state = null,
  } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Message is required and cannot be empty.',
    });
  }

  // Extract user info if authenticated
  const userContext = req.user
    ? {
        user_id: req.user._id.toString(),
        role: req.user.role,
        email: req.user.email,
      }
    : { role: 'customer' };

  // Forward authorization token if present
  const authHeader = req.headers.authorization;
  const authToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;

  const payload = {
    conversation_id,
    message: message.trim(),
    user: userContext,
    auth_token: authToken,
    history,
    confirmation_state,
  };

  try {
    let aiResponse;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        aiResponse = await fetch(`${AI_SERVICE_URL.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        // If service is temporarily warming up (503), wait and retry once
        if (aiResponse.status === 503 && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          continue;
        }

        break;
      } catch (err) {
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          continue;
        }
        throw err;
      }
    }

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      logger.warn(`[AI Controller] AI Service responded with status ${aiResponse.status}: ${errText}`);

      const fallbackMsg =
        aiResponse.status === 503
          ? '⏳ EventPulse AI is warming up its neural engine. Please try sending your message again in a moment.'
          : '🤖 I encountered a momentary issue processing your request. Please try rephrasing or asking again.';

      return res.status(HTTP_STATUS.OK).json(
        new ApiResponse(HTTP_STATUS.OK, 'AI assistant response generated.', {
          conversation_id,
          message: fallbackMsg,
          requires_confirmation: false,
          pending_action: null,
          tool_calls_used: [],
        })
      );
    }

    const data = await aiResponse.json();
    return res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(HTTP_STATUS.OK, 'AI response generated successfully.', data));
  } catch (error) {
    logger.warn(`[AI Controller] Failed to connect to AI service: ${error.message}`);
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      message: `Failed to connect to AI microservice at ${AI_SERVICE_URL}. Please ensure ai-service is running.`,
      error: error.message,
    });
  }
});

export const queryRAG = asyncHandler(async (req, res) => {
  const { question, top_k = 3 } = req.body;
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Question is required.',
    });
  }

  try {
    const aiResponse = await fetch(`${AI_SERVICE_URL.replace(/\/$/, '')}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.trim(), top_k }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return res.status(aiResponse.status).json({
        success: false,
        message: `RAG service error: ${errText}`,
      });
    }

    const data = await aiResponse.json();
    return res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(HTTP_STATUS.OK, 'RAG query completed successfully.', data));
  } catch (error) {
    logger.warn(`[AI Controller] Failed to connect to AI RAG service: ${error.message}`);
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      message: `Failed to connect to AI microservice at ${AI_SERVICE_URL}.`,
      error: error.message,
    });
  }
});

