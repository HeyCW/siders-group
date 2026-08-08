import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, getDummyHash, hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('produces an argon2id hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('exposes a stable dummy hash for timing-equivalent unknown-account checks', async () => {
    const first = await getDummyHash();
    const second = await getDummyHash();
    expect(first).toBe(second);
  });
});

describe('generateTemporaryPassword', () => {
  it('produces a password an admin-issued account can sign in with once hashed', async () => {
    const temp = generateTemporaryPassword();
    const hash = await hashPassword(temp);
    expect(await verifyPassword(temp, hash)).toBe(true);
  });

  it('excludes visually confusable characters', () => {
    const temp = generateTemporaryPassword();
    expect(temp).not.toMatch(/[0O1Il]/);
  });

  it('generates a fresh value on every call', () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();
    expect(first).not.toBe(second);
  });
});
