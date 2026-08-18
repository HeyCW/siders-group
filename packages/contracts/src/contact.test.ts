import { describe, expect, it } from 'vitest';
import {
  contactMessageQuerySchema,
  contactMessageSubmitRequestSchema,
  contactMessageUpdateRequestSchema,
} from './contact.js';

describe('contactMessageSubmitRequestSchema', () => {
  it('accepts a valid submission with only the required fields', () => {
    const parsed = contactMessageSubmitRequestSchema.parse({
      name: 'Jamie Doe',
      email: 'jamie@example.com',
      message: 'Hello, I have a question.',
    });
    expect(parsed.organisation).toBeUndefined();
    expect(parsed.subject).toBeUndefined();
  });

  it('accepts optional organisation and subject', () => {
    const parsed = contactMessageSubmitRequestSchema.parse({
      name: 'Jamie Doe',
      organisation: 'Acme Corp',
      email: 'jamie@example.com',
      subject: 'Partnership',
      message: 'Hello, I have a question.',
    });
    expect(parsed.organisation).toBe('Acme Corp');
    expect(parsed.subject).toBe('Partnership');
  });

  it.each(['name', 'email', 'message'])('rejects a submission missing %s', (field) => {
    const body: Record<string, string> = {
      name: 'Jamie Doe',
      email: 'jamie@example.com',
      message: 'Hello, I have a question.',
    };
    delete body[field];
    expect(contactMessageSubmitRequestSchema.safeParse(body).success).toBe(false);
  });

  it('rejects a malformed email address', () => {
    const result = contactMessageSubmitRequestSchema.safeParse({
      name: 'Jamie Doe',
      email: 'not-an-email',
      message: 'Hello, I have a question.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an extra field, such as a client-supplied status', () => {
    const result = contactMessageSubmitRequestSchema.safeParse({
      name: 'Jamie Doe',
      email: 'jamie@example.com',
      message: 'Hello, I have a question.',
      status: 'read',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a blank message', () => {
    const result = contactMessageSubmitRequestSchema.safeParse({
      name: 'Jamie Doe',
      email: 'jamie@example.com',
      message: '   ',
    });
    expect(result.success).toBe(false);
  });
});

describe('contactMessageQuerySchema', () => {
  it('defaults to "all" when no status filter is given', () => {
    expect(contactMessageQuerySchema.parse({}).status).toBe('all');
  });

  it.each(['new', 'read', 'all'])('accepts status=%s', (status) => {
    expect(contactMessageQuerySchema.parse({ status }).status).toBe(status);
  });

  it('rejects a status outside the catalog', () => {
    expect(contactMessageQuerySchema.safeParse({ status: 'archived' }).success).toBe(false);
  });
});

describe('contactMessageUpdateRequestSchema', () => {
  it.each(['new', 'read'])('accepts status=%s', (status) => {
    expect(contactMessageUpdateRequestSchema.parse({ status }).status).toBe(status);
  });

  it('rejects "all" — a value only a read-side filter accepts', () => {
    expect(contactMessageUpdateRequestSchema.safeParse({ status: 'all' }).success).toBe(false);
  });

  it('rejects an extra field, such as a client-supplied id', () => {
    const result = contactMessageUpdateRequestSchema.safeParse({ status: 'read', id: 'x' });
    expect(result.success).toBe(false);
  });
});
