# Siders — Technical Architecture

**Stack:** React (Next.js + Vite) · Node.js (Express) · PostgreSQL on Supabase
**Companion to:** Siders Website Project Spec v1.0
**Version:** 1.0
**Date:** 3 August 2026

---

## 1. The decision that shapes everything

**Supabase is the managed Postgres, and nothing else.** No Supabase Auth, no PostgREST, no `supabase-js` anywhere in the codebase. Google sign-in is implemented directly against Google's OAuth 2.0 endpoints by the Node API, which also issues and owns every session.

This is a coherent position, and it has real advantages:

- **No vendor lock-in on identity.** The user table is yours. Moving off Supabase later is a `pg_dump` and a connection string change, not an auth migration.
- **One security model instead of two.** Every request is authorised in one place, by code you can read in a pull request, rather than split between Express middleware and RLS policies.
- **No publishable key in the browser at all.** The Supabase REST surface is simply never used, so it is never an attack surface.

The costs, stated plainly so nobody is surprised in week 11:

- Google OAuth, session issuance, refresh rotation, staff invitations and password reset are now **your code to write and maintain** — roughly 1.5 to 2 weeks that Supabase Auth would have absorbed.
- You need a transactional email provider for invites and resets.
- Token rotation, reuse detection and cookie configuration are easy to get subtly wrong. §5 specifies them tightly for that reason.

**In one line:** Supabase stores rows; Node owns identity, authorisation and every write.

---

## 2. System diagram

```
                              ┌──────────────┐
                              │   Google     │
                              │   OAuth 2.0  │
                              └──────┬───────┘
                        code exchange│ (server-side only)
                                     │
    ┌─────────────────────────┐     ┌┴────────────────────────┐
    │  apps/web               │     │  apps/api               │
    │  Next.js · SSR/ISR      │     │  Node + Express         │
    │  Public site            │     │                         │
    └───────┬─────────────────┘     │  1. read session cookie │
            │  httpOnly cookies     │  2. verify own JWT      │
            │  + credentials        │  3. authorize by role   │
    ┌───────┴─────────────────┐     │  4. validate (Zod)      │
    │  apps/admin             │─────│  5. service → repo      │
    │  React + Vite · SPA     │     └───────┬──────────┬──────┘
    └─────────────────────────┘             │          │
                                            │          │
                          Drizzle over      │          │  S3 SDK
                          Supavisor :6543   ▼          ▼
                            ┌───────────────────┐  ┌────────────────┐
                            │ Supabase Postgres │  │ Object storage │
                            │ schema `app`      │  │ + image CDN    │
                            │ not API-exposed   │  └────────────────┘
                            └───────────────────┘
                                     ▲
                                     │  transactional email
                            ┌────────┴────────┐
                            │ Resend/Postmark │
                            │ invites, resets │
                            └─────────────────┘
```

**Trust boundary:** the two React apps are untrusted. They hold no keys and no tokens in JavaScript — only httpOnly cookies the browser attaches automatically. Every rule that matters lives in `apps/api`.

---

## 3. Repository layout

A pnpm monorepo. One schema definition, one set of contracts, no drift between three codebases.

```
siders/
├─ apps/
│  ├─ web/                  Next.js — public site
│  ├─ admin/                Vite + React — admin CMS
│  └─ api/                  Express — the only writer
├─ packages/
│  ├─ db/                   Drizzle schema, migrations, client
│  ├─ contracts/            Zod schemas + inferred types, shared by all three
│  └─ config/              tsconfig, eslint, tailwind presets
├─ supabase/
│  ├─ config.toml           local stack definition
│  ├─ migrations/           SQL applied by CI
│  └─ seed.sql              categories, sub-brands, first Owner
└─ .github/workflows/
```

`packages/contracts` is the piece that pays for the monorepo. The Zod schema that validates a request body on the server is the same object that types the form on the client. A field renamed in one place fails the build in the other two.

---

## 4. Backend structure

Module-per-feature, not layer-per-folder. Everything about articles sits in one directory, which is how the Laravel projects are already organised.

```
apps/api/src/
├─ modules/
│  ├─ articles/
│  │   ├─ article.routes.ts        wiring only
│  │   ├─ article.controller.ts    parse, validate, respond
│  │   ├─ article.service.ts       rules, permissions, orchestration
│  │   ├─ article.repository.ts    Drizzle queries only
│  │   └─ article.mapper.ts        row → DTO
│  ├─ comments/  moderation/  analytics/  home/  media/  readers/  users/
├─ middleware/
│  ├─ authenticate.ts    JWT → req.auth
│  ├─ authorize.ts       role guards
│  ├─ rateLimit.ts       per-route buckets
│  ├─ requestId.ts
│  └─ errorHandler.ts    the only place that formats errors
├─ lib/
│  ├─ google.ts         OAuth client, ID token verification
│  ├─ tokens.ts         sign/verify access JWT, rotate refresh
│  ├─ password.ts       Argon2id hash + verify
│  ├─ mailer.ts         Resend — invites, resets
│  ├─ storage.ts        S3 client, presigned URLs
│  ├─ sanitizeHtml.ts   allowlist renderer for article bodies
│  ├─ oembed.ts
│  └─ logger.ts         pino, structured
├─ config/env.ts         Zod-validated, throws at boot
└─ server.ts
```

**Rules that hold everywhere:**

- Controllers contain no `if` about business meaning. They parse, delegate, and return.
- Services never import Drizzle. Repositories never import Express.
- No raw database row ever reaches the client — always through a mapper.
- Errors are thrown as typed `AppError` subclasses and formatted once, in `errorHandler`.
- `config/env.ts` validates every environment variable at boot with Zod. A missing secret should crash on startup, not at 2am on a request.

---

## 5. Authentication

Written by us, owned by us. Three flows: Google sign-in for readers, email + password for staff, and session refresh for both.

### 5.1 Identity tables

No `auth.users` to reference any more. Identity lives in the `app` schema like everything else.

```sql
create table app.users (               -- staff only
  id             uuid primary key default gen_random_uuid(),
  email          citext not null unique,
  password_hash  text,                 -- null until the invite is accepted
  name           text not null,
  role           app.staff_role not null,   -- owner | editor | author
  status         app.user_status not null default 'invited',
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);

create table app.readers (             -- Google-authenticated readers
  id                uuid primary key default gen_random_uuid(),
  google_sub        text not null unique,   -- Google's stable subject ID
  email             citext not null,
  email_verified    boolean not null default false,
  name              text not null,
  avatar_url        text,
  status            app.reader_status not null default 'active',
  muted_until       timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now()
);

create table app.sessions (            -- both audiences, one table
  id                 uuid primary key default gen_random_uuid(),
  subject_id         uuid not null,
  subject_type       app.subject_type not null,   -- staff | reader
  refresh_token_hash text not null unique,
  family_id          uuid not null,               -- rotation lineage
  user_agent         text,
  ip_hash            text,
  expires_at         timestamptz not null,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now()
);
```

**Key on `google_sub`, not email.** Google's `sub` claim is stable forever; a user's email address is not. Matching on email means someone who changes their Google address loses their comment history, and — worse — someone who acquires a recycled address inherits it.

### 5.2 Google sign-in — server-side authorization code flow

The entire exchange happens on the server. The browser never sees a client secret, an ID token, or a Google access token.

```
Browser              API                          Google
   │  GET /auth/google │                             │
   │──────────────────>│                             │
   │                   │ generate state + PKCE       │
   │                   │ store in short-lived cookie │
   │  302 to Google    │                             │
   │<──────────────────│                             │
   │─────────────────────────────────────────────────>│
   │                   │        user consents         │
   │  302 back with ?code&state                       │
   │<─────────────────────────────────────────────────│
   │  GET /auth/google/callback                       │
   │──────────────────>│                             │
   │                   │ verify state matches cookie │
   │                   │ POST /token (code + secret) │
   │                   │────────────────────────────>│
   │                   │ id_token + access_token     │
   │                   │<────────────────────────────│
   │                   │ verify id_token vs Google   │
   │                   │ JWKS: iss, aud, exp, nonce  │
   │                   │ upsert app.readers          │
   │                   │ issue OUR session cookies   │
   │  302 to ?next=... │                             │
   │<──────────────────│                             │
```

Implementation uses **`arctic`** for the provider dance and **`jose`** for ID token verification. `openid-client` is the heavier, fully standards-complete alternative if strict OIDC conformance is ever required.

```ts
// verify Google's ID token — never trust it unverified
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
);

const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
  issuer: ['https://accounts.google.com', 'accounts.google.com'],
  audience: env.GOOGLE_CLIENT_ID,
});

if (!payload.email_verified) throw new AuthError('EMAIL_NOT_VERIFIED');
```

Non-negotiables in this flow:

- **`state`** is random, stored in an httpOnly cookie, and compared on return. This is the CSRF defence and it is not optional.
- **PKCE** even though this is a confidential client. It costs nothing and closes code-interception entirely.
- **`nonce`** in the auth request, checked against the ID token claim.
- Google's tokens are **discarded after the exchange.** We want identity, not API access — there is no reason to store a Google refresh token.
- `redirect_uri` must match the console entry exactly, including trailing slash. This is the single most common cause of a broken deploy.

### 5.3 Our sessions

Two tokens, both in cookies, neither readable by JavaScript.

| Token | Lifetime | Storage | Contents |
|---|---|---|---|
| Access | 15 minutes | httpOnly cookie | Signed JWT: `sub`, `type`, `role`, `exp` |
| Refresh | 30 days, sliding | httpOnly cookie | Opaque 256-bit random; only its SHA-256 hash is stored |

```ts
res.cookie('sid_at', accessJwt, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',        // survives the OAuth redirect back from Google
  domain: '.siders.id',   // shared across web, admin and api subdomains
  path: '/',
  maxAge: 15 * 60 * 1000,
});
```

**Cookies, not localStorage.** A token in `localStorage` is readable by any injected script; one XSS becomes total account takeover. httpOnly cookies survive that. The cost is CSRF exposure, handled by `SameSite=Lax` plus a double-submit CSRF token on state-changing requests.

**Put the API on a subdomain of the same registrable domain** — `api.siders.id` alongside `siders.id`. Different registrable domains force `SameSite=None`, which requires third-party cookies that browsers are actively killing. Getting this wrong is discovered late and is painful to unwind.

**Refresh rotation with reuse detection.** Every refresh issues a new token and revokes the old one. If a *already-revoked* token is presented, the entire `family_id` is revoked and the user is signed out everywhere — that pattern means a token was stolen and replayed.

Access tokens are signed with EdDSA using a key pair held by the API. Verification is local; there is no database read on the hot path. Only refresh touches `app.sessions`.

### 5.4 Staff — invite only

No public route creates a staff account.

1. Owner creates the user; API writes `app.users` with `status = 'invited'`, no password hash.
2. A single-use invite token — random, hashed at rest, 24-hour expiry — is emailed via Resend.
3. Staff member sets a password. **Argon2id**, memory cost 19 MiB, 2 iterations, parallelism 1 (OWASP baseline).
4. Status becomes `active`.

Password reset uses the same token mechanism. Both invite and reset responses are deliberately identical whether or not the address exists, so the endpoint cannot be used to enumerate staff emails.

Login is rate limited to 5 attempts per 15 minutes per IP-and-email pair, and always returns the same generic failure message regardless of which half was wrong.

### 5.5 Authorisation

```ts
// apps/api/src/middleware/authenticate.ts
export async function authenticate(req, _res, next) {
  const token = req.cookies.sid_at;
  if (!token) return next();                       // anonymous is valid

  try {
    const { payload } = await jwtVerify(token, PUBLIC_KEY, {
      issuer: 'siders-api',
      audience: 'siders',
    });
    req.auth = {
      id: payload.sub,
      type: payload.type,        // 'staff' | 'reader'
      role: payload.role,
    };
  } catch {
    /* expired or invalid — treated as anonymous, client will refresh */
  }
  next();
}
```

`requireStaff()` rejects anything where `type !== 'staff'`, and every `/admin/*` route sits behind it. A reader token can never reach an admin handler, because the check is on token type, not on a role string that might be absent.

---

## 6. Data layer

### 6.1 Drizzle, not Prisma

Drizzle is the better fit here for reasons specific to Supabase: migrations are plain readable SQL, RLS policies can be declared beside the table they protect, and there is no engine binary or pooler workaround to manage. Prisma is a defensible alternative if the team already knows it, but its pgBouncer handling adds friction that buys nothing on this project.

<cite index="27-1">The common pattern is supabase-js for auth and storage, Drizzle for the real data queries</cite> — which is exactly the split here.

### 6.2 Connection strings — get this right or nothing works

Supabase exposes the database on two ports and they are not interchangeable.

| Purpose | Port | Mode | Env var |
|---|---|---|---|
| Runtime queries | **6543** | Transaction (Supavisor) | `DATABASE_URL` |
| Migrations, `drizzle-kit`, psql | **5432** | Session / direct | `DIRECT_URL` |

<cite index="17-1">Migrations must use the direct URL, because Supavisor's transaction mode does not support the multi-statement transactions migrations require.</cite> Pointing `drizzle-kit` at 6543 produces failures that look like syntax errors and aren't.

```ts
// packages/db/src/client.ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const sql = postgres(env.DATABASE_URL, {
  prepare: false,     // REQUIRED — transaction pooling breaks prepared statements
  max: 10,
  idle_timeout: 20,
});

export const db = drizzle(sql, { schema });
```

`prepare: false` is not optional. Without it the app works in local development against direct Postgres and fails intermittently in production, which is the worst possible failure shape.

> Also note the shared pooler is IPv4; the direct connection is IPv6 unless the IPv4 add-on is enabled. If CI cannot reach port 5432, this is usually why.

### 6.3 Schema isolation — the security decision that matters most

**All application tables live in an `app` schema, and `app` is not added to Supabase's exposed schemas.**

Since nothing in the browser ever holds a Supabase key, PostgREST is not part of the design at all. Removing the schema from the exposed list closes it completely — the REST surface has nothing to serve even if a key were somehow obtained.

RLS is still enabled on every table as a second layer: default deny, no policies granted to `anon` or `authenticated`. The API connects as a role that owns the tables and is unaffected. The cost is one line per table, and it means a future decision to expose something starts from closed rather than open.

```sql
create schema if not exists app;

create table app.articles (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  slug          text not null unique,
  body_json     jsonb not null,
  body_html     text  not null,
  status        app.article_status not null default 'draft',
  author_id     uuid not null references app.users(id),
  category_id   uuid references app.categories(id),
  published_at  timestamptz,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title,'')),   'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt,'')), 'B')
  ) stored,
  created_at    timestamptz not null default now()
);

alter table app.articles enable row level security;   -- default deny, no policies

create index articles_search_idx    on app.articles using gin (search_vector);
create index articles_published_idx on app.articles (published_at desc)
  where status = 'published';
```

The partial index matters: almost every public query filters to published articles, and indexing only those keeps it small.

### 6.4 Migrations

Drizzle schema in TypeScript is the source of truth. `drizzle-kit generate` emits SQL into `supabase/migrations/`, and the Supabase CLI applies it — one migration history, readable in review.

<cite index="26-1">Run two Supabase projects, development and production, and apply migrations to development first, so production only ever sees a migration that has already succeeded once.</cite> Schema changes and data backfills go in separate migrations and never mix.

> **Free-tier gotcha:** free projects pause after a week of inactivity. Acceptable for a dev project; not acceptable for the staging environment a client reviews on. Staging goes on a paid plan or gets a keep-alive ping.

---

## 7. Storage

With Supabase scoped to the database, media goes to an S3-compatible store. **Cloudflare R2** is the recommendation — S3 API compatible, zero egress fees, and an image resizing service in front of it. Backblaze B2 or plain S3 work identically; the SDK code does not change.

| Bucket / prefix | Access | Contents |
|---|---|---|
| `media/` | Public read via CDN | Article covers, inline images, logos, partner marks |
| `avatars/` | Public read via CDN | Reader avatars cached from Google at first sign-in |
| `private/` | Presigned GET only | Draft assets, analytics exports |

Upload keeps large files off the Node process entirely: the client asks the API for permission, the API validates declared MIME type and size and returns a **presigned PUT URL**, the browser uploads directly to R2, then calls back so the API records the row in `app.media`. Node never proxies bytes.

```ts
const url = await getSignedUrl(s3, new PutObjectCommand({
  Bucket: env.R2_BUCKET,
  Key: `media/${nanoid()}.${ext}`,
  ContentType: mime,
  ContentLength: size,        // pin the size so the URL can't be abused
}), { expiresIn: 300 });
```

Validate the real content type server-side on callback by sniffing magic bytes. A browser-declared `Content-Type` is a claim, not a fact.

**Cache Google avatars, don't hotlink them.** Google's avatar URLs expire and rate limit. Fetch once at first sign-in, store in `avatars/`, refresh on a schedule.

Derivatives are generated on demand through Cloudflare Images (or `sharp` behind a cache if self-hosting), so only originals are stored:

```
https://cdn.siders.id/cdn-cgi/image/width=800,quality=75,format=auto/media/cover.jpg
```

---

## 8. Frontend

### 8.1 `apps/web` — Next.js public site

| Route | Strategy | Why |
|---|---|---|
| `/` | ISR, 60s + on-demand revalidate | Editors publish curation and see it within seconds |
| `/news` | Server-rendered, searchParams-driven | Filters live in the URL, so results are shareable |
| `/news/[slug]` | SSG + on-demand revalidate on publish | Fastest possible article load, correct OG tags |
| `/contact` | Static | — |

Server Components fetch from the API directly over the internal URL, forwarding the incoming cookie header so the server render knows whether the reader is signed in. Only genuinely interactive leaves — like button, comment composer, share sheet, reels player — are Client Components.

Data fetching uses TanStack Query on the client for comments and likes, with `credentials: 'include'` on every request so session cookies travel. A single fetch wrapper handles the 401 → refresh → retry cycle in one place; never scatter that logic across call sites.

### 8.2 `apps/admin` — Vite SPA

No SEO requirement, so no SSR complexity. React Router, TanStack Query for server state, react-hook-form with the shared Zod resolvers.

The editor is the centrepiece: Tiptap with a slash-command extension, bubble menu, drag handles, markdown input rules, and an upload extension wired to the presigned-URL flow. Autosave is a debounced mutation with optimistic status display.

The moderation queue polls every 30 seconds. Without Supabase Realtime, a websocket layer would be the only alternative, and it is not worth building for a queue two people look at.

---

## 9. Cross-cutting patterns

### 9.1 View counting

The one endpoint that must be cheap, since it fires on every article read.

```sql
-- single statement, no read-then-write race
insert into app.article_views_daily (article_id, date, views, unique_views)
values ($1, current_date, 1, $2::int)
on conflict (article_id, date) do update
  set views        = app.article_views_daily.views + 1,
      unique_views = app.article_views_daily.unique_views + $2::int;
```

Uniqueness is decided first by an insert into `app.view_seen` with `on conflict do nothing`; the row count tells the caller whether this visitor is new today. Two statements, one transaction, no locks held.

### 9.2 Error contract

Every failure, everywhere, returns the same shape:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "fields": { "title": "Required" } } }
```

Clients branch on `code`, never on `message`. Messages are for humans and will be rewritten.

### 9.3 Rate limiting

Per-route buckets keyed by user ID when signed in, hashed IP when not. Comments 10/hour, likes 60/hour, views 60/hour, login 5 per 15 minutes, contact 3/hour. Backed by Redis in production; in-memory is fine at launch scale but does not survive horizontal scaling — worth knowing before the second instance is added.

### 9.4 Sanitisation

`body_json` is what the editor saves. `body_html` is generated **server-side** on save, through a strict allowlist, and stored. The public page renders stored HTML and never runs the editor. Sanitising on render instead of on write is a common and expensive mistake — it moves cost to every page view and leaves poison in the database.

---

## 10. Environments

| | Supabase project | Web | Admin | API |
|---|---|---|---|---|
| Local | `supabase start` (Docker) or plain Postgres | :3000 | :5173 | :4000 |
| Staging | `siders-staging` (paid) | `staging.siders.id` | `admin-staging.siders.id` | `api-staging.siders.id` |
| Production | `siders-prod` | `siders.id` | `admin.siders.id` | `api.siders.id` |

All three production hostnames sit under one registrable domain so session cookies work with `SameSite=Lax`. Vercel for the two frontends, Fly.io or Railway for the API.

`supabase start` still earns its place locally: it runs Postgres in Docker with Studio attached, so no developer needs cloud credentials. Only the database container is used.

### Environment variables

```
# apps/web + apps/admin  (public — will be in the browser)
NEXT_PUBLIC_API_URL=https://api.siders.id
NEXT_PUBLIC_CDN_URL=https://cdn.siders.id

# apps/api  (server only)
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://...supabase.com:5432/postgres

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.siders.id/auth/google/callback

JWT_PRIVATE_KEY=            # EdDSA, PEM
JWT_PUBLIC_KEY=
COOKIE_DOMAIN=.siders.id

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

RESEND_API_KEY=
REVALIDATE_SECRET=
SENTRY_DSN=
```

Note what is absent: no Supabase URL, no anon key, no service key. The frontends hold two public URLs and nothing else. Everything secret lives in one process.

---

## 11. Security checklist

- [ ] App tables in `app` schema; `app` **not** in Supabase's exposed schemas
- [ ] RLS enabled on every table regardless, default deny
- [ ] `state` and PKCE verified on every OAuth callback
- [ ] Google ID token verified against Google's JWKS — `iss`, `aud`, `exp`, `nonce`
- [ ] `email_verified` checked before creating a reader
- [ ] Readers keyed on `google_sub`, never on email
- [ ] Session cookies `httpOnly` + `Secure` + `SameSite=Lax`, scoped to the shared domain
- [ ] Refresh tokens rotated on every use, stored only as hashes, with family revocation on reuse
- [ ] CSRF double-submit token on all state-changing requests
- [ ] Argon2id for staff passwords at OWASP parameters
- [ ] Invite and reset tokens single-use, hashed, 24-hour expiry
- [ ] Auth responses identical whether or not the account exists
- [ ] Admin routes gated on token `type === 'staff'`, not on role presence
- [ ] Article HTML sanitised on write with an allowlist
- [ ] Uploaded file types verified by magic bytes, not the declared header
- [ ] Zod validation on every request body and query string
- [ ] Rate limits on login, comment, like, view, contact
- [ ] CORS allowlist naming exact origins, `credentials: true`, no wildcard
- [ ] Helmet, CSP, HSTS
- [ ] `audit_log` written on every admin mutation
- [ ] Point-in-time recovery enabled on the production Supabase project
- [ ] Dependabot on, secrets scanned in CI

---

## 12. Known pitfalls

Collected because each one costs a day when met unprepared.

1. **`prepare: false`** missing → works locally, fails in production under the pooler.
2. **Migrations run against port 6543** → cryptic transaction errors. Use 5432.
3. **`redirect_uri` mismatch** with the Google console entry, down to the trailing slash → callback fails only in the environment you didn't test.
4. **API on a different registrable domain** from the frontends → cookies require `SameSite=None`, which browsers are actively restricting. Fix the domains before writing auth code, not after.
5. **Tokens in `localStorage`** because it was easier during development → one XSS becomes full account takeover. Cookies from day one.
6. **Missing `state` check** → the OAuth flow works perfectly and is CSRF-vulnerable. Nothing will fail visibly.
7. **Matching readers on email** → account collisions the first time someone changes their Google address.
8. **Free-tier Supabase project pausing** after a week idle → staging appears broken to the client on a Monday.
9. **Next.js caching a fetch you meant to be dynamic** → editors publish and see nothing change. Be explicit about cache behaviour on every API call.
10. **Forgetting `credentials: 'include'`** on client fetches → intermittent 401s that look like token bugs and are cookie bugs.

---

## 13. Where this scales next

The architecture holds well past launch traffic. The first three things to change when it doesn't:

- **Redis** for rate limits and hot-article caching, once the API runs more than one instance.
- **Read replica** for the analytics dashboard, once daily aggregation queries start competing with reads.
- **Materialised view** on `article_views_daily` rolled up by category, once the dashboard's date ranges exceed a year of data.

None of these require schema changes. That is the point of aggregating views daily rather than logging every event.
