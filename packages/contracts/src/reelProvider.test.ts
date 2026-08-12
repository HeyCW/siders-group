import { describe, expect, it } from 'vitest';
import { buildReelEmbedUrl, parseReelUrl } from './reelProvider.js';

describe('parseReelUrl', () => {
  it('accepts an Instagram reel URL', () => {
    expect(parseReelUrl('https://www.instagram.com/reel/AbC-123x/')).toEqual({
      provider: 'instagram',
      externalId: 'AbC-123x',
    });
  });

  it('accepts an Instagram reel URL without www', () => {
    expect(parseReelUrl('https://instagram.com/reel/AbC-123x')).toEqual({
      provider: 'instagram',
      externalId: 'AbC-123x',
    });
  });

  it('accepts a TikTok video URL', () => {
    expect(parseReelUrl('https://www.tiktok.com/@someuser/video/7123456789012345678')).toEqual({
      provider: 'tiktok',
      externalId: '7123456789012345678',
    });
  });

  it('accepts a YouTube Shorts URL', () => {
    expect(parseReelUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      externalId: 'dQw4w9WgXcQ',
    });
  });

  it('accepts a youtu.be short link', () => {
    expect(parseReelUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      externalId: 'dQw4w9WgXcQ',
    });
  });

  it('discards query parameters and fragments so tracking params do not change identity', () => {
    const withTracking = parseReelUrl('https://www.instagram.com/reel/AbC-123x/?igsh=abc123&utm_source=x#frag');
    expect(withTracking).toEqual({ provider: 'instagram', externalId: 'AbC-123x' });
  });

  it('rejects an unrecognized host', () => {
    expect(parseReelUrl('https://example.com/reel/AbC-123x')).toBeNull();
  });

  it('rejects a lookalike host that merely contains the provider name', () => {
    expect(parseReelUrl('https://evil-instagram.com/reel/AbC-123x')).toBeNull();
    expect(parseReelUrl('https://instagram.com.attacker.net/reel/AbC-123x')).toBeNull();
  });

  it('rejects a recognized host with an unexpected path', () => {
    expect(parseReelUrl('https://www.instagram.com/p/AbC-123x/')).toBeNull();
    expect(parseReelUrl('https://www.instagram.com/reel/')).toBeNull();
  });

  it('rejects an identifier containing a path separator', () => {
    expect(parseReelUrl('https://www.instagram.com/reel/..%2f..%2fetc/')).toBeNull();
  });

  it('rejects an identifier containing a quote character', () => {
    expect(parseReelUrl(`https://www.instagram.com/reel/abc"def/`)).toBeNull();
  });

  it('rejects a javascript: URL', () => {
    expect(parseReelUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects a protocol-relative URL', () => {
    expect(parseReelUrl('//www.instagram.com/reel/AbC-123x/')).toBeNull();
  });

  it('rejects a URL carrying embedded credentials', () => {
    expect(parseReelUrl('https://user:pass@www.instagram.com/reel/AbC-123x/')).toBeNull();
  });

  it('rejects a non-URL string', () => {
    expect(parseReelUrl('not a url')).toBeNull();
  });
});

describe('buildReelEmbedUrl', () => {
  it('composes the embed URL from a code literal host plus the stored identifier', () => {
    expect(buildReelEmbedUrl('instagram', 'AbC-123x')).toBe('https://www.instagram.com/reel/AbC-123x/embed');
    expect(buildReelEmbedUrl('tiktok', '7123456789012345678')).toBe(
      'https://www.tiktok.com/embed/v2/7123456789012345678',
    );
    expect(buildReelEmbedUrl('youtube', 'dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('throws rather than composing a URL for an identifier outside the character class', () => {
    expect(() => buildReelEmbedUrl('instagram', 'has a space')).toThrow();
  });
});
