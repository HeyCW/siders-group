/**
 * Fails at import time rather than surfacing as a mysterious fetch failure deep in a Server
 * Component — every route in this app depends on reaching the API (`docs/ARCHITECTURE.md` §10).
 *
 * `value` must be passed in as a statically-referenced `process.env.NEXT_PUBLIC_...` expression
 * at the call site, not looked up here via `process.env[name]` — Next.js only inlines a
 * `NEXT_PUBLIC_` variable into the browser bundle when it sees that literal dotted form at build
 * time. A dynamic lookup works in Server Components (real `process.env` at runtime) but silently
 * resolves to nothing once this module is bundled into a Client Component (`NewsExplorer.tsx`
 * imports `getArticles` from `lib/api.ts`, which imports this).
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const API_URL = requireEnv('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL);
