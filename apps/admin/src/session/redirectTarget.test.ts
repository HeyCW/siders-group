import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDING_ROUTE, resolveInAppTarget } from './redirectTarget.js';

/**
 * specs/admin-session/spec.md - "Deep-link targets are preserved but restricted to relative
 * in-app paths": an absolute, protocol-relative, or cross-origin target is a phishing vector on
 * a route the caller just authenticated through, whether validated server-side or here.
 */
describe('resolveInAppTarget', () => {
  it('accepts a relative in-app path', () => {
    expect(resolveInAppTarget('/articles/42')).toBe('/articles/42');
  });

  it('accepts a relative path with query and hash', () => {
    expect(resolveInAppTarget('/articles?status=draft#top')).toBe('/articles?status=draft#top');
  });

  it('defaults to the landing route when nothing is supplied', () => {
    expect(resolveInAppTarget(undefined)).toBe(DEFAULT_LANDING_ROUTE);
    expect(resolveInAppTarget(null)).toBe(DEFAULT_LANDING_ROUTE);
    expect(resolveInAppTarget('')).toBe(DEFAULT_LANDING_ROUTE);
  });

  it('rejects an absolute cross-origin URL', () => {
    expect(resolveInAppTarget('https://evil.example.com/phish')).toBe(DEFAULT_LANDING_ROUTE);
  });

  it('rejects a protocol-relative URL', () => {
    expect(resolveInAppTarget('//evil.example.com/phish')).toBe(DEFAULT_LANDING_ROUTE);
  });

  it('rejects a non-string value', () => {
    expect(resolveInAppTarget(42)).toBe(DEFAULT_LANDING_ROUTE);
    expect(resolveInAppTarget({ path: '/articles' })).toBe(DEFAULT_LANDING_ROUTE);
  });

  it('rejects a path with no leading slash', () => {
    expect(resolveInAppTarget('articles/42')).toBe(DEFAULT_LANDING_ROUTE);
  });
});
