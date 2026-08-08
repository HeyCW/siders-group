import { z } from 'zod';

/** `.env` files can't hold real newlines cleanly, so PEM keys travel as one line with literal `\n`. */
function unescapeNewlines(value: string): string {
  return value.replace(/\\n/g, '\n');
}

const pemPrivateKeySchema = z
  .string()
  .min(1)
  .transform(unescapeNewlines)
  .refine((v) => v.includes('BEGIN PRIVATE KEY') && v.includes('END PRIVATE KEY'), {
    message: 'must be a PKCS#8 PEM-encoded private key',
  });

const pemPublicKeySchema = z
  .string()
  .min(1)
  .transform(unescapeNewlines)
  .refine((v) => v.includes('BEGIN PUBLIC KEY') && v.includes('END PUBLIC KEY'), {
    message: 'must be an SPKI PEM-encoded public key',
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  // CSRF double-submit token signing secret (openspec/changes/add-auth-foundation/design.md -
  // "SESSION_SECRET is repurposed, not orphaned"). Access credentials are EdDSA-signed and
  // refresh credentials are opaque hashed-at-rest values, so nothing else consumes this.
  SESSION_SECRET: z.string().min(32),
  REVALIDATE_SECRET: z.string().min(16),

  // Access-credential signing key pair (EdDSA). See apps/api/src/lib/tokens.ts.
  ACCESS_TOKEN_PRIVATE_KEY: pemPrivateKeySchema,
  ACCESS_TOKEN_PUBLIC_KEY: pemPublicKeySchema,

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),

  APP_ORIGIN: z.string().url(),
  ADMIN_ORIGIN: z.string().url(),

  // Number of reverse proxies in front of the API, so Express can resolve `req.ip` to the
  // real client rather than the proxy. Defaults to 0 (trust nothing): every rate limit here
  // is keyed on `req.ip`, and trusting `X-Forwarded-For` when nothing strips it lets a
  // caller spoof the header and sidestep the limits entirely. Set to the actual hop count
  // (usually 1) once the API sits behind a load balancer, or every caller shares one bucket.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  // Shared registrable domain for session/CSRF cookies (e.g. `.siders.id` in production so
  // web/admin/api subdomains all receive them). Unset in local dev, where api/admin/web run
  // on different hosts/ports and a cookie `domain` would make the browser reject the cookie
  // entirely rather than scope it (docs/ARCHITECTURE.md §5.3, §12 pitfall #4).
  COOKIE_DOMAIN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cachedEnv = result.data;
  return cachedEnv;
}

/** Test-only: clears the memoized env so a test can reload with different values. */
export function __resetEnvCacheForTests(): void {
  cachedEnv = undefined;
}
