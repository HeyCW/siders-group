import { describe, expect, it } from 'vitest';
import { staffSignInRequestSchema } from './auth.js';
import { staffCreateRequestSchema } from './staff.js';

describe('staffCreateRequestSchema', () => {
  const valid = {
    email: 'editor@example.com',
    name: 'Editor One',
    roleId: '3f1c1b6e-6f0e-4a1e-9f0a-2b7a5c9d1e33',
  };

  it('accepts a well-formed creation request', () => {
    expect(staffCreateRequestSchema.parse(valid)).toEqual(valid);
  });

  // specs/staff-account-management/spec.md - "Caller cannot choose the initial password".
  it('rejects a caller-supplied password rather than ignoring it', () => {
    const result = staffCreateRequestSchema.safeParse({ ...valid, password: 'hunter2' });
    expect(result.success).toBe(false);
  });

  it('rejects a caller-supplied passwordHash', () => {
    const result = staffCreateRequestSchema.safeParse({ ...valid, passwordHash: 'argon2id$...' });
    expect(result.success).toBe(false);
  });

  /**
   * Without normalization the duplicate-email rejection is bypassable by changing one letter's
   * case: `Owner@example.com` and `owner@example.com` are two rows for one mailbox, and the
   * second is a fresh account the caller controls (specs/staff-account-management/spec.md -
   * "Creating an account for an email that already has one is rejected").
   */
  it('lowercases and trims the email so one mailbox cannot become two accounts', () => {
    const parsed = staffCreateRequestSchema.parse({ ...valid, email: '  Editor@Example.COM  ' });
    expect(parsed.email).toBe('editor@example.com');
  });

  it('still rejects an address that is not an email after normalizing', () => {
    expect(staffCreateRequestSchema.safeParse({ ...valid, email: '   not-an-email  ' }).success).toBe(false);
  });
});

describe('staffSignInRequestSchema', () => {
  it('normalizes the email the same way creation does, so either casing signs in', () => {
    const parsed = staffSignInRequestSchema.parse({ email: 'Editor@Example.COM', password: 'pw' });
    expect(parsed.email).toBe('editor@example.com');
  });
});
