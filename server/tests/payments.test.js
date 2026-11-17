import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/app.js';
import { processPayment } from '../src/controllers/payment.controller.js';
import { ValidationError } from '../src/utils/ApiError.js';

describe('Payment & Refund API Suite', () => {
  it('POST /api/v1/payments/process without auth token should return 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/payments/process')
      .send({ bookingId: 'TKT-12345' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/payments/booking/invalid-id without auth should return 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/payments/booking/invalid-id');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/payments/some-id without auth should return 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/payments/some-id');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('processPayment unit handler should throw ValidationError when bookingId is missing', async () => {
    const req = {
      body: {},
      user: { _id: 'user-123', role: 'customer' },
    };
    const res = {};
    const next = jest.fn();

    // asyncHandler wraps the controller and forwards caught error to next()
    await processPayment(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toMatch(/Booking ID is required/i);
  });
});
