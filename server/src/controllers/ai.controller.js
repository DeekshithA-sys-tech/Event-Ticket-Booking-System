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
    const aiResponse = await fetch(`${AI_SERVICE_URL.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      logger.warn(`[AI Controller] AI Service responded with status ${aiResponse.status}: ${errText}`);

      return res.status(HTTP_STATUS.OK).json(
        new ApiResponse(HTTP_STATUS.OK, 'AI assistant response generated.', {
          conversation_id,
          message: '🤖 I encountered a momentary issue processing your request. Please try rephrasing or asking again.',
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
