import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Shared by tokens.ts (refresh tokens) and staffTokens.ts (invite/reset tokens). */
export function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Keyed digest. Used wherever the input space is small enough that a plain SHA-256 would be
 * reversible by exhaustive search — an IPv4 address is only 2^32 candidates, so `sha256Hex`
 * of one is pseudonymous in name only.
 */
export function hmacSha256Hex(raw: string, secret: string): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

/** Constant-time comparison against a stored hash — never compare raw tokens with `===`. */
export function verifyHash(raw: string, storedHex: string): boolean {
  const candidate = Buffer.from(sha256Hex(raw), 'hex');
  const stored = Buffer.from(storedHex, 'hex');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

/** Constant-time string equality — for comparing two secrets neither of which is pre-hashed. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
