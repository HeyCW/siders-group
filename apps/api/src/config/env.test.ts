import { beforeEach, describe, expect, it } from 'vitest';
import { __resetEnvCacheForTests, loadEnv } from './env.js';

const validEnv = {
  DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
  SESSION_SECRET: 'a'.repeat(32),
  REVALIDATE_SECRET: 'b'.repeat(16),
  ACCESS_TOKEN_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nZmFrZS1rZXk=\\n-----END PRIVATE KEY-----',
  ACCESS_TOKEN_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\\nZmFrZS1rZXk=\\n-----END PUBLIC KEY-----',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
  R2_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
  MEDIA_STORAGE_PATH: '/var/data/media',
  MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.com',
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

  it('throws when the access token private key is not PEM-encoded', () => {
    expect(() =>
      loadEnv({ ...validEnv, ACCESS_TOKEN_PRIVATE_KEY: 'not-a-pem-key' }),
    ).toThrow(/ACCESS_TOKEN_PRIVATE_KEY/);
  });

  it('unescapes literal \\n sequences in PEM keys', () => {
    const env = loadEnv(validEnv);
    expect(env.ACCESS_TOKEN_PRIVATE_KEY).toContain('\n');
    expect(env.ACCESS_TOKEN_PRIVATE_KEY).not.toContain('\\n');
  });
});
