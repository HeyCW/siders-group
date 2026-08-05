import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

const requiredEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  SESSION_SECRET: 'a'.repeat(32),
  REVALIDATE_SECRET: 'b'.repeat(16),
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
  R2_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
  RESEND_API_KEY: 'resend-key',
  APP_ORIGIN: 'https://example.com',
  ADMIN_ORIGIN: 'https://admin.example.com',
};

let app: Express;

beforeAll(async () => {
  Object.assign(process.env, requiredEnv);
  const { createServer } = await import('../../server.js');
  app = createServer();
});

describe('GET /health', () => {
  it('returns the PingResponse shape', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });
});
