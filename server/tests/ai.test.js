/**
 * @file ai.test.js
 * @description Unit & integration tests for AI agent gateway router.
 */

import request from 'supertest';
import app from '../src/app.js';
import { jest } from '@jest/globals';

describe('AI Agent Gateway Routes (/api/v1/ai)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should return 400 when message is empty or missing', async () => {
    const res = await request(app)
      .post('/api/v1/ai/chat')
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should forward chat payload and return AI response', async () => {
    const mockAiResponse = {
      conversation_id: 'test-conv-1',
      message: 'Hello, I found 3 upcoming events for you.',
      requires_confirmation: false,
      pending_action: null,
      tool_calls_used: [],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAiResponse,
    });

    const res = await request(app)
      .post('/api/v1/ai/chat')
      .send({
        conversation_id: 'test-conv-1',
        message: 'Show upcoming concerts',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe(mockAiResponse.message);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should return 503 when AI microservice connection fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app)
      .post('/api/v1/ai/chat')
      .send({
        conversation_id: 'test-conv-fail',
        message: 'Hello',
      });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Failed to connect to AI microservice');
  });
});
