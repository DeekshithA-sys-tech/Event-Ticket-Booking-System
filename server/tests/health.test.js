import request from 'supertest';
import app from '../src/app.js';

describe('System Health & Error Handling', () => {
  it('GET /api/v1/health should respond with service health metrics payload', async () => {
    const res = await request(app).get('/api/v1/health');

    // Status is 200 when DB is connected, or 503 if disconnected in standalone test environment
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('status');
    expect(res.body.data).toHaveProperty('uptime');
    expect(res.body.data).toHaveProperty('timestamp');
    expect(res.body.data).toHaveProperty('database');
  });

  it('GET /api/v1/unknown-endpoint should return 404 with error contract', async () => {
    const res = await request(app).get('/api/v1/unknown-endpoint');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('message');
  });
});
