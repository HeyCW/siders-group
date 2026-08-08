import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  issueRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  verifyAccessToken,
  type TokenSigningEnv,
} from './tokens.js';

function makeKeyPairEnv(): TokenSigningEnv {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    ACCESS_TOKEN_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ACCESS_TOKEN_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

describe('access tokens', () => {
  it('round-trips claims through sign and verify', async () => {
    const env = makeKeyPairEnv();
    const token = await signAccessToken(
      { subjectId: 'user-1', subjectType: 'staff', sessionId: 'session-1' },
      env,
    );
    const claims = await verifyAccessToken(token, env);
    expect(claims).toEqual({ subjectId: 'user-1', subjectType: 'staff', sessionId: 'session-1' });
  });

  it('never carries a role or permission claim', async () => {
    const env = makeKeyPairEnv();
    const token = await signAccessToken(
      { subjectId: 'user-1', subjectType: 'staff', sessionId: 'session-1' },
      env,
    );
    const parts = token.split('.');
    const decoded = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8'));
    expect(decoded).not.toHaveProperty('role');
    expect(decoded).not.toHaveProperty('permissions');
    expect(decoded).not.toHaveProperty('roleId');
  });

  it('rejects a token signed with a different key pair', async () => {
    const env = makeKeyPairEnv();
    const otherEnv = makeKeyPairEnv();
    const token = await signAccessToken(
      { subjectId: 'user-1', subjectType: 'staff', sessionId: 'session-1' },
      env,
    );
    await expect(verifyAccessToken(token, otherEnv)).rejects.toThrow();
  });
});

describe('refresh tokens', () => {
  it('issues a fresh family id for a new session', () => {
    const a = issueRefreshToken();
    const b = issueRefreshToken();
    expect(a.familyId).not.toBe(b.familyId);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toHaveLength(64); // sha256 hex
  });

  it('rotation carries the family id forward', () => {
    const original = issueRefreshToken();
    const rotated = rotateRefreshToken(original.familyId);
    expect(rotated.familyId).toBe(original.familyId);
    expect(rotated.token).not.toBe(original.token);
    expect(rotated.tokenHash).not.toBe(original.tokenHash);
  });
});
