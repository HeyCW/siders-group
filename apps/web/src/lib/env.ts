/**
 * Fails at import time rather than surfacing as a mysterious fetch failure deep in a component
 * tree — every route in this app depends on reaching the API (`docs/ARCHITECTURE.md` §10).
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const API_URL = requireEnv('VITE_API_URL', import.meta.env.VITE_API_URL);
