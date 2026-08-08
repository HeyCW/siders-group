import { describe, expect, it } from 'vitest';
import { resolveRedirectTarget, type RedirectAllowlistEnv } from './redirect.js';

const env: RedirectAllowlistEnv = {
  APP_ORIGIN: 'https://siders.id',
  ADMIN_ORIGIN: 'https://admin.siders.id',
};

describe('resolveRedirectTarget', () => {
  it('allows a relative path on the app origin', () => {
    expect(resolveRedirectTarget('/news/some-article', env)).toBe('https://siders.id/news/some-article');
  });

  it('allows an absolute URL on an allowlisted origin', () => {
    expect(resolveRedirectTarget('https://admin.siders.id/articles', env)).toBe('https://admin.siders.id/articles');
  });

  it('falls back to the default path for an off-allowlist origin', () => {
    expect(resolveRedirectTarget('https://evil.example.com/steal', env)).toBe('https://siders.id/');
  });

  it('falls back to the default path for a missing target', () => {
    expect(resolveRedirectTarget(null, env)).toBe('https://siders.id/');
    expect(resolveRedirectTarget(undefined, env)).toBe('https://siders.id/');
  });

  it('falls back to the default path for a protocol-relative off-site target', () => {
    expect(resolveRedirectTarget('//evil.example.com/steal', env)).toBe('https://siders.id/');
  });
});
