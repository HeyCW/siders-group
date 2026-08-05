import { beforeEach, describe, expect, it } from 'vitest';
import { __resetEnvCacheForTests, loadEnv } from './env.js';

const validEnv = {
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

describe('loadEnv', () => {
  beforeEach(() => {
    __resetEnvCacheForTests();
  });

  it('parses a complete, valid environment', () => {
    const env = loadEnv(validEnv);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('throws when a required variable is missing', () => {
    const incomplete: Partial<typeof validEnv> = { ...validEnv };
    delete incomplete.DATABASE_URL;
    expect(() => loadEnv(incomplete)).toThrow(/DATABASE_URL/);
  });

  it('throws when a secret is too short', () => {
    expect(() => loadEnv({ ...validEnv, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });
});
