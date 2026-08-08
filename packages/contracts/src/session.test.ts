import { describe, expect, it } from 'vitest';
import {
  readerAccountResponseSchema,
  staffAccountResponseSchema,
  staffCreateResponseSchema,
  staffResetResponseSchema,
} from './session.js';

const CREDENTIAL_FIELD_NAMES = ['accessToken', 'refreshToken', 'sid', 'sessionId', 'token'];

// The only schemas allowed to carry a plaintext credential — creation and reset each
// disclose a system-generated temporary password exactly once, in the response that
// produced it (specs/staff-account-management/spec.md - "Temporary passwords are
// generated, disclosed once, and hashed at rest").
const SCHEMAS_ALLOWED_A_TEMPORARY_PASSWORD = new Set([staffCreateResponseSchema, staffResetResponseSchema]);

const ALL_RESPONSE_SCHEMAS = {
  staffAccountResponseSchema,
  staffCreateResponseSchema,
  staffResetResponseSchema,
  readerAccountResponseSchema,
};

describe('session response schemas', () => {
  it('staff account response never declares a session-credential field', () => {
    const keys = Object.keys(staffAccountResponseSchema.shape);
    for (const field of CREDENTIAL_FIELD_NAMES) {
      expect(keys).not.toContain(field);
    }
  });

  it('reader account response never declares a session-credential field', () => {
    const keys = Object.keys(readerAccountResponseSchema.shape);
    for (const field of CREDENTIAL_FIELD_NAMES) {
      expect(keys).not.toContain(field);
    }
  });

  it('temporaryPassword appears on exactly the create and reset responses, nowhere else', () => {
    for (const [name, schema] of Object.entries(ALL_RESPONSE_SCHEMAS)) {
      const hasField = Object.keys(schema.shape).includes('temporaryPassword');
      expect(hasField).toBe(SCHEMAS_ALLOWED_A_TEMPORARY_PASSWORD.has(schema as never));
      if (hasField) {
        expect(SCHEMAS_ALLOWED_A_TEMPORARY_PASSWORD.has(schema as never), name).toBe(true);
      }
    }
  });

  it('parses a well-formed staff account response', () => {
    const parsed = staffAccountResponseSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'owner@example.com',
      name: 'Owner',
      roleId: '22222222-2222-2222-2222-222222222222',
      roleName: 'Owner',
      status: 'active',
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    });
    expect(parsed.status).toBe('active');
  });

  it('parses a well-formed staff create response carrying a temporary password', () => {
    const parsed = staffCreateResponseSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'new@example.com',
      name: 'New Staff',
      roleId: '22222222-2222-2222-2222-222222222222',
      roleName: 'Editor',
      status: 'active',
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      temporaryPassword: 'Xk9-Qm2-Rt7-Vb4',
    });
    expect(parsed.temporaryPassword).toBe('Xk9-Qm2-Rt7-Vb4');
  });
});
