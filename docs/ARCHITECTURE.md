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

- Google OAuth, session issuance, refresh rotation, staff account creation and password reset are now **your code to write and maintain** — roughly 1.5 to 2 weeks that Supabase Auth would have absorbed.
- Staff have no unauthenticated password recovery. Onboarding and reset both run through an admin (§5.4), so a staff member who forgets their password needs one, and losing every Owner account at once needs a manual database edit.
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
```

No transactional email provider appears here, and that is deliberate: staff onboarding and password reset hand a generated temporary password back through the API response rather than mailing a link (§5.4), so the system has no outbound email dependency at all.

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
│  ├─ auth/  staff/  roles/
│  ├─ comments/  moderation/  analytics/  home/  media/  readers/  users/
├─ middleware/
│  ├─ authenticate.ts    access credential → req.auth; stateless, never rejects
│  ├─ authorize.ts       declaration guards: public / reader / staff / permission
│  ├─ rateLimit.ts       per-route buckets
│  ├─ requestId.ts
│  └─ errorHandler.ts    the only place that formats errors
├─ lib/
│  ├─ google.ts         OAuth client, ID token verification
│  ├─ csrf.ts           double-submit token issue + compare
│  ├─ tokens.ts         sign/verify access JWT, rotate refresh
│  ├─ password.ts       Argon2id hash + verify, temporary-password generator
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
create table app.roles (               -- named bundles of permissions
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  is_system   boolean not null default false,  -- true only for the seeded Owner row
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table app.permissions (         -- fixed catalog, seeded by migration only
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,   -- news.manage, role.manage, settings.manage, …
  description  text not null
);

create table app.role_permissions (
  role_id        uuid not null references app.roles(id) on delete cascade,
  permission_id  uuid not null references app.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table app.users (               -- staff only
  id                    uuid primary key default gen_random_uuid(),
  email                 citext not null unique,
  password_hash         text not null,        -- always set; creation issues a temporary password
  must_change_password  boolean not null default true,
  name                  text not null,
  role_id               uuid not null references app.roles(id),   -- exactly one role
  status                app.user_status not null default 'active',   -- active | disabled
  last_login_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
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
  id                  uuid primary key default gen_random_uuid(),  -- the `sid` claim
  subject_id          uuid not null,               -- polymorphic: no FK possible
  subject_type        app.subject_type not null,   -- staff | reader
  refresh_token_hash  text not null unique,
  family_id           uuid not null,               -- rotation lineage
  user_agent          text,
  ip_hash             text,                        -- HMAC-SHA256 keyed on SESSION_SECRET,
                                                   -- never the address itself: an IPv4 is
                                                   -- only 2^32 candidates, so an unkeyed
                                                   -- digest is pseudonymous in name only
  expires_at          timestamptz not null,        -- sliding
  absolute_expires_at timestamptz not null,        -- hard cap, never extended
  revoked_at          timestamptz,
  created_at          timestamptz not null default now()
);
```

`subject_id` is polymorphic across `app.users` and `app.readers`, so it cannot carry a
foreign key. Every lookup therefore filters on `subject_type` and joins the correct
subject table, re-validating that the row still exists and is active. A session whose
subject has vanished fails closed.

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
| Access | 15 minutes | httpOnly cookie | Signed JWT: `sub`, `type`, `sid`, `exp` |
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

The CSRF token is signed with `SESSION_SECRET` **and bound to the session id it was issued for**. Binding is what retires the previous token on rotation: refresh mints a new `app.sessions` row, so the caller's next request carries a new `sid` and a token signed against the old one no longer matches. The check stays stateless — it compares against the `sid` claim `authenticate` already verified, never a database read. On `POST /auth/refresh` the access credential has usually expired, leaving no `sid` to bind against; there the signature alone carries the request, and the response immediately issues a token bound to the new session.

**Put the API on a subdomain of the same registrable domain** — `api.siders.id` alongside `siders.id`. Different registrable domains force `SameSite=None`, which requires third-party cookies that browsers are actively killing. Getting this wrong is discovered late and is painful to unwind.

**Refresh rotation with reuse detection.** Every refresh issues a new token and revokes the old one. If a *already-revoked* token is presented, the entire `family_id` is revoked and the user is signed out everywhere — that pattern means a token was stolen and replayed.

The access token carries a **session id (`sid`) and deliberately no role or permission data.** Anything embedded in a 15-minute credential is stale for up to 15 minutes, which is unacceptable for a demotion or an account disable. Role and permission state is therefore resolved per request instead — see §5.5.

Access tokens are signed with EdDSA using a key pair held by the API, and verification is local. Anonymous and public traffic touches the database not at all. Gated routes pay one indexed lookup, and refresh touches `app.sessions`.

**Rotating the signing key does not end sessions.** It invalidates access tokens only; refresh tokens are opaque `app.sessions` rows unaffected by the key, so every client silently refreshes and carries on. Key rotation is not the incident response for a stolen session — bulk revocation is, which is why revoking every session for a subject, and every session system-wide, is a first-class operation rather than an afterthought. Per-subject revocation runs automatically on account disable and on any password set; the system-wide sweep is `POST /auth/sessions/revoke-all`, gated on `settings.manage`, and it ends the caller's own session along with everyone else's.

### 5.4 Staff — admin-created, temporary password

No public route creates a staff account, and no email is sent at any point in the staff lifecycle.

1. A caller holding `user.manage` creates the user, supplying an email, a name, and a role — but **not** a password. Granting the **Owner** role additionally requires the caller to already hold it, otherwise `user.manage` alone would be a complete path to Owner.
2. The API generates a temporary password (≥128 bits of entropy, from `node:crypto`), hashes it with **Argon2id** — memory cost 19 MiB, 2 iterations, parallelism 1 (OWASP baseline) — writes `app.users` with `status = 'active'` and `must_change_password = true`, and returns the plaintext **exactly once**, in the creation response. The operator relays it to the staff member out of band. No later read discloses it again.
3. The staff member signs in with it and receives a session, but every endpoint declaring staff identity or a named permission refuses them — with a distinct error code, not a generic denial — until they replace the password. Only `POST /staff/me/password` and `GET /users/me` are exempt, so the change can actually be made. **The Owner role does not bypass this**: it is not a permission check, and an Owner holding an admin-issued password is exactly the case it exists for.
4. Changing the password clears `must_change_password` and revokes every *other* session for the account, leaving the caller's own alive so the change does not sign them out of the request that made it.

The admin transiently knows the staff member's password, and that is the accepted cost of dropping the email dependency. `must_change_password` is what bounds it — the window closes at first sign-in, and the admin's knowledge is never a standing credential. The password is generated rather than admin-chosen precisely so it is not one the staff member would carry elsewhere.

Creating an account for an email that already belongs to any staff account, in any status, is **rejected**. Upserting here would let a `user.manage` holder submit the Owner's address and take the account over.

Password reset is the same mechanism, admin-triggered: `POST /staff/:id/reset` issues a fresh temporary password, sets `must_change_password`, and **revokes every existing session for that account** — a reset that leaves the attacker's session alive is not a remediation. There is no unauthenticated reset path, so there is nothing to enumerate staff emails through; a `user.manage` holder may legitimately learn which accounts exist, and a missing id is an honest `404`.

Login is rate limited to 5 **failed** attempts per 15 minutes per IP-and-email pair, with an additional per-source cap across all addresses so the per-account limit cannot be sidestepped by spraying. Only failures are counted — a staff member signing in from several devices inside one window must not lock themselves out. Limits also cover `POST /staff/me/password`, which verifies a current password and is therefore the one remaining guessable-secret endpoint. Failures always return the same generic message regardless of which half was wrong, and perform **equivalent verification work** for unknown, non-active, and existing accounts — short-circuiting before Argon2id reopens the enumeration channel through response timing. Throttled responses are indistinguishable from ordinary failures.

Every limit is keyed on `req.ip`, which means `TRUST_PROXY_HOPS` must match the number of reverse proxies actually in front of the API. Set too low, every caller lands in one shared bucket and the first attacker throttles all staff; set too high, a caller spoofs `X-Forwarded-For` and sidesteps the limits entirely. It defaults to `0` — trust nothing — so the failure is a wrong bucket rather than no protection.

Disabling a staff account holding the Owner role requires the caller to *hold* Owner, the same rule that governs granting it. Combined with the bar on disabling your own account, at least one active Owner always survives, so `user.manage` alone can never leave role administration unreachable.

### 5.5 Authorisation

Two tiers, and the split is the whole design: **identification is stateless, authorisation is stateful.**

```
every request
     │
     ▼
authenticate ──────────── local EdDSA verify only, NO database read
     │                    claims: sub, type, sid
     │                    populates req.auth; NEVER rejects
     ▼
route declaration?
     ├── public ───────► handler          (DB-free, the high-volume path)
     └── reader / staff / permission
             │
             ▼
        one indexed query: session ⋈ subject ⋈ role ⋈ role_permissions
        rejects if: session revoked/expired · subject not active · permission absent
             │
             ▼
          handler
```

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
      subjectId: payload.sub,
      subjectType: payload.type,   // 'staff' | 'reader'
      sessionId: payload.sid,      // no role, no permissions — resolved per request
    };
  } catch {
    /* expired or invalid — treated as anonymous, client will refresh */
  }
  next();
}
```

`authenticate` identifies and nothing else. It never returns a 401 — rejecting is authorisation's job, and conflating the two is what makes anonymous browsing impossible to express.

**Every route carries an explicit declaration** — one of `requirePublic()`, `requireReader()`, `requireStaff()`, or `requirePermission(key)`. A route with no declaration is **denied**, and the API fails to boot if any registered route lacks one. Default-public would turn one forgotten guard into a silently world-readable admin endpoint; a failed deploy is strictly cheaper than that.

`requireStaff()` rejects anything where `subjectType !== 'staff'`, so a reader credential can never reach an admin handler — the check is on credential type, not on a role string that might be absent. It takes no role argument: role-name checks are exactly what `requirePermission` replaces.

`requirePermission(key)` resolves the caller's **current** role from `app.users.role_id` and that role's permissions from `app.role_permissions` on every request, never from the credential. That is what makes revocation honest: sign-out, account disable, reader ban, role reassignment, and permission edits all bite on the caller's very next gated request rather than lingering until a 15-minute credential expires. The cost is one indexed lookup on admin and reader-authored traffic; public reads stay DB-free. No in-process cache — with more than one API instance, in-process invalidation is silently wrong, and correctness here outranks a saved query.

**The Owner role satisfies every permission check**, so role administration can never lock out every staff member. Recognition is by the **seeded row's immutable id**, resolved once at boot — never by a name or slug. That distinction is load-bearing: if a caller-editable string granted the bypass, any holder of `role.manage` could create a role called "Owner" and inherit the entire catalog. For the same reason `is_system` and role identity are set only by migration and rejected from every request payload, assigning the Owner role requires already holding it, and no staff member may change their own role or disable their own account.

Public endpoints must not make access decisions from `req.auth`. A public route sees identity without a revocation check for up to the credential's lifetime — anything access-controlled carries a declaration and goes through the stateful path.

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

**Current state (`add-news-management-system`): article media is stored on the API's own local filesystem, not R2.** `app.media` records a storage-root-relative path (`MEDIA_STORAGE_PATH`, date-sharded as `YYYY/MM/<uuid>.<ext>`); the public URL is derived at map time as `MEDIA_PUBLIC_BASE_URL + '/' + storage_path`, never stored. Uploads are validated server-side against an image-type allowlist and a size cap, with the real type determined by sniffing the file's leading bytes rather than trusting the client's declared `Content-Type` — the same discipline the R2 design below describes, just applied to a local write instead of a presigned PUT. This is a deliberate, scoped decision (see `openspec/changes/add-news-management-system/design.md` - "Media storage"), not a partial implementation of the section below: local storage is not replica-safe, so a deployment running this must either mount `MEDIA_STORAGE_PATH` on shared durable storage or run a single API instance. Because the URL is always derived rather than stored, migrating to R2 later touches the media mapper and configuration, not the `app.media` rows or any article that references them.

The R2 design below remains the intended eventual target and is unchanged as a plan; it is simply not what this repository currently runs.

---

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

Server Components fetch from the API directly over the internal URL. Reader session state is deliberately **not** forwarded to them: `add-reader-web-sign-in` resolves it client-side instead, because reading the cookie header in a Server Component — even just in the root layout — would opt the whole route tree into dynamic rendering and kill ISR on `/` and SSG on `/news/[slug]`. Public content is identical for anonymous and signed-in readers; only the masthead's session-dependent control varies, and it resolves after the route's content is already rendered. This is revisited if an inherently-dynamic authenticated route (e.g. `/account`) is ever added to justify forwarding the cookie. Only genuinely interactive leaves — like button, comment composer, share sheet, reels player — are Client Components.

Client data fetching for comments and likes is a plain `useState`/`useEffect` hook per island (`apps/web/components/article/useArticleEngagement.ts`), with `credentials: 'include'` on every request so session cookies travel. A single fetch wrapper handles the 401 → refresh → retry cycle in one place; never scatter that logic across call sites — `apps/web/lib/authApi.ts` is this for reader session calls today.

### 8.2 `apps/admin` — Vite SPA

No SEO requirement, so no SSR complexity. React Router for routing. Server state is fetched per page with `useState`/`useEffect` behind the shared `useAsyncAction` hook, and forms are controlled components validated against the shared Zod contracts directly.

> TanStack Query and react-hook-form were both named here originally and neither was ever added as a dependency to `apps/web` or `apps/admin`. This paragraph described libraries the project does not use for several changes before anyone checked. If either is adopted later, this line changes together with the `package.json`, not after it.

Unlike the reader-facing 401 → refresh → retry cycle above, the admin fetch wrapper's cycle is 403-keyed: `requireStaff`/`requirePermission` answer 403, not 401, for "no session" (see §5.5), so recovery branches on the response's error `code` — `forbidden` triggers refresh-then-retry, `csrf_failed` triggers CSRF-cookie recovery, `password_change_required` routes to the forced password-change screen — rather than on status code alone (`openspec/specs/admin-session`).

The editor is the centrepiece: Tiptap with a slash-command extension, bubble menu, drag handles, markdown input rules, and an upload extension wired to the presigned-URL flow. Autosave is a debounced mutation with optimistic status display.

The moderation queue polls every 30 seconds. Without Supabase Realtime, a websocket layer would be the only alternative, and it is not worth building for a queue two people look at. (Planned, not built — `openspec/changes/add-community-moderation`.)

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
- [ ] Temporary passwords generated server-side, ≥128 bits of entropy, hashed at rest, disclosed in exactly one response and never re-read
- [ ] `must_change_password` enforced by both staff and permission guards, with no Owner bypass
- [ ] Auth responses identical whether or not the account exists, in body **and** timing
- [ ] Every registered route carries an explicit authorisation declaration; undeclared is denied and fails boot
- [ ] Admin routes gated on token `type === 'staff'` plus a named permission, never on a role name
- [ ] Owner-role bypass keyed on the seeded row's immutable id, never a caller-editable slug
- [ ] Granting the Owner role requires already holding it; no self-reassignment, no self-disable
- [ ] Session revocation effective on the next gated request, not at credential expiry
- [ ] Sessions carry an absolute lifetime cap independent of sliding refresh
- [ ] Post-sign-in redirect targets validated against an origin allowlist
- [ ] Article HTML sanitised on write with an allowlist
- [ ] Uploaded file types verified by magic bytes, not the declared header
- [ ] Zod validation on every request body and query string
- [ ] Rate limits on login, password change, refresh, OAuth callback, comment, like, view, contact — enforced, not merely mounted
- [ ] CORS allowlist naming exact origins, `credentials: true`, no wildcard
- [ ] Helmet, CSP, HSTS
- [ ] `audit_log` written on every admin mutation — **outstanding**, deferred to an `add-audit-logging` follow-up change (see `openspec/changes/add-auth-foundation/design.md` Non-Goals)
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
