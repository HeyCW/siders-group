import type { Request } from 'express';
import { hmacSha256Hex } from './hashCompare.js';

export interface SessionMetaEnv {
  SESSION_SECRET: string;
}

export interface RequestSessionMeta {
  userAgent?: string | undefined;
  ipHash?: string | undefined;
}

/**
 * `app.sessions.ip_hash` is a hash, so the address never lands in the table in the clear —
 * it exists to recognize "same origin as last time", not to identify a person
 * (design.md - Data model). Keyed with `SESSION_SECRET` rather than plain SHA-256 because
 * an IPv4 address is only 2^32 candidates, which an unkeyed digest reverses in minutes.
 */
export function sessionMetaFromRequest(req: Request, env: SessionMetaEnv): RequestSessionMeta {
  return {
    userAgent: req.get('user-agent') ?? undefined,
    ipHash: req.ip ? hmacSha256Hex(req.ip, env.SESSION_SECRET) : undefined,
  };
}
