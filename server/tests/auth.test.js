import request from 'supertest';
import app from '../src/app.js';
import { generateAccessToken, generateRefreshToken } from '../src/utils/generateTokens.js';
import { hashToken } from '../src/utils/hashToken.js';

describe('Authentication & Validation Suite', () => {
  describe('Input Validation on Public Auth Routes', () => {
    it('POST /api/v1/auth/register with empty body should return 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/v1/auth/register with invalid email should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'not-an-email',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/v1/auth/register with short password should fail validation', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/v1/auth/login with missing password should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('JWT and Token Cryptography', () => {
    const mockUser = {
      _id: '64b1a2f901c890123456789a',
      email: 'cryptotest@example.com',
      role: 'customer',
    };

    it('should generate a valid JWT access token string', () => {
      const token = generateAccessToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('should generate a valid JWT refresh token string', () => {
      const refreshToken = generateRefreshToken(mockUser);
      expect(typeof refreshToken).toBe('string');
      expect(refreshToken.split('.').length).toBe(3);
    });

    it('should consistently generate SHA-256 hash of tokens', () => {
      const raw = 'random-token-secret-value';
      const hash1 = hashToken(raw);
      const hash2 = hashToken(raw);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 produces 64 hex characters
    });
  });
});
