/**
 * Fails at import time rather than surfacing as a mysterious fetch failure deep in a Server
 * Component — every route in this app depends on reaching the API (`docs/ARCHITECTURE.md` §10).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const API_URL = requireEnv('NEXT_PUBLIC_API_URL');
