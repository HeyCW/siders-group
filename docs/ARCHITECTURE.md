# Siders — Technical Architecture

**Stack:** React (Vite) · Node.js (Express) · MySQL 8.0
**Companion to:** Siders Website Project Spec v1.0
**Version:** 1.0
**Date:** 3 August 2026

---

## 1. The decision that shapes everything

**MySQL is the database, and nothing else.** No managed-platform auth product, no REST-over-the-database surface, no client SDK anywhere in the codebase. Google sign-in is implemented directly against Google's OAuth 2.0 endpoints by the Node API, which also issues and owns every session.

This project originally ran on Supabase-managed Postgres; `openspec/changes/migrate-postgres-to-mysql` moved the database engine to MySQL 8.0 while changing nothing about where authority lives. That move is not a one-command swap — see that change's `design.md` for what had to be redesigned (identifier generation, table-level locking, constraint-violation translation) rather than merely re-syntaxed, and `db/README.md` for the least-privilege grants that replace Postgres Row Level Security.

This is a coherent position, and it has real advantages:

- **No vendor lock-in on identity.** The user table is yours. Moving the database again later is a data export and a connection string change, not an auth migration.
- **One security model instead of two.** Every request is authorised in one place, by code you can read in a pull request, rather than split between Express middleware and a database-level policy layer.
- **No publishable key in the browser at all.** No managed-platform REST surface is ever used, so it is never an attack surface.

The costs, stated plainly so nobody is surprised in week 11:

- Google OAuth, session issuance, refresh rotation, staff account creation and password reset are now **your code to write and maintain** — roughly 1.5 to 2 weeks that a managed auth product would have absorbed.
- Staff have no unauthenticated password recovery. Onboarding and reset both run through an admin (§5.4), so a staff member who forgets their password needs one, and losing every Owner account at once needs a manual database edit.
- Token rotation, reuse detection and cookie configuration are easy to get subtly wrong. §5 specifies them tightly for that reason.

**In one line:** MySQL stores rows; Node owns identity, authorisation and every write.

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
    │  Vite SPA · client-rend.│     │  Node + Express         │
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
                          mysql2 :3306      ▼          ▼
                            ┌───────────────────┐  ┌────────────────┐
                            │  MySQL 8.0        │  │ Object storage │
                            │  database `siders`│  │ + image CDN    │
                            │  DML-only API user│  └────────────────┘
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
│  ├─ web/                  Vite + React — public site
│  ├─ admin/                Vite + React — admin CMS
│  └─ api/                  Express — the only writer
├─ packages/
│  ├─ db/                   Drizzle schema, migrations, client
│  ├─ contracts/            Zod schemas + inferred types, shared by all three
│  └─ config/              tsconfig, eslint, tailwind presets
├─ docker-compose.yml       local MySQL service
├─ db/
│  ├─ migrations/           SQL applied by CI, incl. the permission/role/sub-brand catalog
│  └─ seed.sql              local-dev only — the first Owner user
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

No `auth.users` to reference any more. Identity lives alongside everything else, one flat MySQL database rather than a non-default Postgres schema — that separation existed only to hide tables from Supabase's REST surface (§6.3, previous revision), which no longer exists to hide anything from.

```sql
create table roles (                   -- named bundles of permissions
  id          char(36) primary key,               -- app-generated UUIDv7, not a server default
  name        varchar(191) not null unique,
  slug        varchar(191) not null unique,
  is_system   boolean not null default false,  -- true only for the seeded Owner row
  created_at  datetime(3) not null,
  updated_at  datetime(3) not null
);

create table permissions (             -- fixed catalog, seeded by migration only
  id           char(36) primary key,
  `key`        varchar(191) not null unique,   -- news.manage, role.manage, settings.manage, …
  description  text not null
);

create table role_permissions (
  role_id        char(36) not null references roles(id) on delete cascade,
  permission_id  char(36) not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table users (                   -- staff only
  id                    char(36) primary key,
  email                 varchar(320) not null unique,  -- case-insensitive via utf8mb4_0900_ai_ci, no citext needed
  password_hash         varchar(255) not null,  -- always set; creation issues a temporary password
  must_change_password  boolean not null default true,
  name                  varchar(255) not null,
  role_id               char(36) not null references roles(id),   -- exactly one role
  status                enum('active','disabled') not null default 'active',
  last_login_at         datetime(3),
  created_at            datetime(3) not null,
  updated_at            datetime(3) not null
);

create table readers (                 -- Google-authenticated readers
  id                char(36) primary key,
  google_sub        varchar(128) not null unique,   -- Google's stable subject ID
  email             varchar(320) not null,
  email_verified    boolean not null default false,
  name              varchar(255) not null,
  avatar_url        text,
  status            enum('active','banned') not null default 'active',
  muted_until       datetime(3),
  last_login_at     datetime(3),
  created_at        datetime(3) not null
);

create table sessions (                -- both audiences, one table
  id                  char(36) primary key,        -- the `sid` claim
  subject_id          char(36) not null,            -- polymorphic: no FK possible
  subject_type        enum('staff','reader') not null,
  refresh_token_hash  varchar(128) not null unique,
  family_id           char(36) not null,            -- rotation lineage
  user_agent          text,
  ip_hash             varchar(128),                 -- HMAC-SHA256 keyed on SESSION_SECRET,
                                                   -- never the address itself: an IPv4 is
                                                   -- only 2^32 candidates, so an unkeyed
                                                   -- digest is pseudonymous in name only
  expires_at          datetime(3) not null,        -- sliding
  absolute_expires_at datetime(3) not null,        -- hard cap, never extended
  revoked_at          datetime(3),
  created_at          datetime(3) not null
);
```

`subject_id` is polymorphic across `users` and `readers`, so it cannot carry a
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
   │                   │ upsert readers               │
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

The CSRF token is signed with `SESSION_SECRET` **and bound to the session id it was issued for**. Binding is what retires the previous token on rotation: refresh mints a new `sessions` row, so the caller's next request carries a new `sid` and a token signed against the old one no longer matches. The check stays stateless — it compares against the `sid` claim `authenticate` already verified, never a database read. On `POST /auth/refresh` the access credential has usually expired, leaving no `sid` to bind against; there the signature alone carries the request, and the response immediately issues a token bound to the new session.

**Put the API on a subdomain of the same registrable domain** — `api.siders.id` alongside `siders.id`. Different registrable domains force `SameSite=None`, which requires third-party cookies that browsers are actively killing. Getting this wrong is discovered late and is painful to unwind.

**Refresh rotation with reuse detection.** Every refresh issues a new token and revokes the old one. If a *already-revoked* token is presented, the entire `family_id` is revoked and the user is signed out everywhere — that pattern means a token was stolen and replayed.

The access token carries a **session id (`sid`) and deliberately no role or permission data.** Anything embedded in a 15-minute credential is stale for up to 15 minutes, which is unacceptable for a demotion or an account disable. Role and permission state is therefore resolved per request instead — see §5.5.

Access tokens are signed with EdDSA using a key pair held by the API, and verification is local. Anonymous and public traffic touches the database not at all. Gated routes pay one indexed lookup, and refresh touches `sessions`.

**Rotating the signing key does not end sessions.** It invalidates access tokens only; refresh tokens are opaque `sessions` rows unaffected by the key, so every client silently refreshes and carries on. Key rotation is not the incident response for a stolen session — bulk revocation is, which is why revoking every session for a subject, and every session system-wide, is a first-class operation rather than an afterthought. Per-subject revocation runs automatically on account disable and on any password set; the system-wide sweep is `POST /auth/sessions/revoke-all`, gated on `settings.manage`, and it ends the caller's own session along with everyone else's.

### 5.4 Staff — admin-created, temporary password

No public route creates a staff account, and no email is sent at any point in the staff lifecycle.

1. A caller holding `user.manage` creates the user, supplying an email, a name, and a role — but **not** a password. Granting the **Owner** role additionally requires the caller to already hold it, otherwise `user.manage` alone would be a complete path to Owner.
2. The API generates a temporary password (≥128 bits of entropy, from `node:crypto`), hashes it with **Argon2id** — memory cost 19 MiB, 2 iterations, parallelism 1 (OWASP baseline) — writes `users` with `status = 'active'` and `must_change_password = true`, and returns the plaintext **exactly once**, in the creation response. The operator relays it to the staff member out of band. No later read discloses it again.
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

`requirePermission(key)` resolves the caller's **current** role from `users.role_id` and that role's permissions from `role_permissions` on every request, never from the credential. That is what makes revocation honest: sign-out, account disable, reader ban, role reassignment, and permission edits all bite on the caller's very next gated request rather than lingering until a 15-minute credential expires. The cost is one indexed lookup on admin and reader-authored traffic; public reads stay DB-free. No in-process cache — with more than one API instance, in-process invalidation is silently wrong, and correctness here outranks a saved query.

**The Owner role satisfies every permission check**, so role administration can never lock out every staff member. Recognition is by the **seeded row's immutable id**, resolved once at boot — never by a name or slug. That distinction is load-bearing: if a caller-editable string granted the bypass, any holder of `role.manage` could create a role called "Owner" and inherit the entire catalog. For the same reason `is_system` and role identity are set only by migration and rejected from every request payload, assigning the Owner role requires already holding it, and no staff member may change their own role or disable their own account.

Public endpoints must not make access decisions from `req.auth`. A public route sees identity without a revocation check for up to the credential's lifetime — anything access-controlled carries a declaration and goes through the stateful path.

---

## 6. Data layer

### 6.1 Drizzle, not Prisma

Drizzle stays the ORM through the MySQL move (`openspec/changes/migrate-postgres-to-mysql`): migrations are plain readable SQL either way, and there is no engine binary to manage. Prisma is a defensible alternative if the team already knows it.

### 6.2 Connection string

One `mysql://` connection string, `DATABASE_URL`, for both runtime queries and migrations. MySQL has no pooled/direct-connection split the way Supabase's Postgres did (§6.2 previously documented a `DATABASE_URL`/`DIRECT_URL` pair for exactly that split), so there is nothing analogous to get wrong here.

```ts
// packages/db/src/client.ts
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import * as schema from './schema/index.js';

const pool = createPool({
  uri: env.DATABASE_URL,
  timezone: 'Z',          // REQUIRED — every datetime column is stored and read as UTC
  supportBigNumbers: true,
});

export const db = drizzle(pool, { schema, mode: 'default' });
```

`timezone: 'Z'` is not optional. Every `datetime` column in the schema is written and read assuming the connection's session time zone is UTC; a connection in any other zone would silently shift every timestamp it touches.

### 6.3 Least-privilege grants — the security decision that matters most

**The API's database credential can read and write rows, and nothing else.** It holds `SELECT, INSERT, UPDATE, DELETE` on the application database — no `CREATE`, `ALTER`, `DROP`, or grant-management privilege. Migrations run under a separate credential that holds full DDL (`db/README.md`).

This replaces Postgres Row Level Security, which has no MySQL equivalent. RLS's own job in the Postgres design was defending against a hypothetical *second* direct-connection client (a BI tool, a support script) — the API itself was always exempt from it — so the least-privilege grant defends against the same scenario the same way: a connection using the wrong credential, or one that leaked, still can't alter the schema or grant itself more, even though (unlike RLS's default-deny) it can read and write every row. There is only one intended writer either way (§2's trust boundary), so this is not a narrowing of what the *application* can do — only of what a connection with the wrong credential could do.

```ts
// packages/db/src/schema/articles.ts (abridged)
export const articles = mysqlTable('articles', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),   // app-generated UUIDv7
  title: text('title').notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  bodyJson: json('body_json').notNull(),
  bodyHtml: text('body_html').notNull(),
  status: mysqlEnum('status', ARTICLE_STATUS_VALUES).notNull().default('draft'),
  authorId: char('author_id', { length: 36 }).notNull().references(() => users.id),
  publishedAt: datetime('published_at', { fsp: 3 }),
  createdAt: datetime('created_at', { fsp: 3 }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  statusPublishedAtIdx: index('articles_status_published_at_idx').on(table.status, table.publishedAt),
}));
```

Two things that don't carry over from the Postgres version verbatim: primary keys have no `uuid` column type or server-side default in MySQL, so every table generates its id in application code (`newId()`, UUIDv7 — time-ordered, so sequential inserts append to the clustered index rather than fragmenting it); and there is no partial index, so the one place the schema used to filter an index (`WHERE resolved_at IS NULL` on `comment_reports`) uses a stored generated column instead (`packages/db/src/schema/moderation.ts`).

### 6.4 Migrations

Drizzle schema in TypeScript is the source of truth. `drizzle-kit generate` emits SQL into `db/migrations/`, applied with `drizzle-kit migrate` — one migration history, readable in review. Run migrations against a development database first, so production only ever sees one that has already succeeded once. Schema changes and data backfills go in separate migrations and never mix.

The fixed permission catalog, the Owner system role, and the sub-brand catalog are seeded by a migration (`db/migrations/0001_seed_permission_catalog.sql`), not by `db/seed.sql` — production needs that data too. `db/seed.sql` is local-dev only: it seeds the first Owner *user*.

---

## 7. Storage

**Current state (`add-news-management-system`): article media is stored on the API's own local filesystem, not R2.** `media` records a storage-root-relative path (`MEDIA_STORAGE_PATH`, date-sharded as `YYYY/MM/<uuid>.<ext>`); the public URL is derived at map time as `MEDIA_PUBLIC_BASE_URL + '/' + storage_path`, never stored. Uploads are validated server-side against an image-type allowlist and a size cap, with the real type determined by sniffing the file's leading bytes rather than trusting the client's declared `Content-Type` — the same discipline the R2 design below describes, just applied to a local write instead of a presigned PUT. This is a deliberate, scoped decision (see `openspec/changes/add-news-management-system/design.md` - "Media storage"), not a partial implementation of the section below: local storage is not replica-safe, so a deployment running this must either mount `MEDIA_STORAGE_PATH` on shared durable storage or run a single API instance. Because the URL is always derived rather than stored, migrating to R2 later touches the media mapper and configuration, not the `media` rows or any article that references them.

The R2 design below remains the intended eventual target and is unchanged as a plan; it is simply not what this repository currently runs.

---

With the database scoped to rows, media goes to an S3-compatible store. **Cloudflare R2** is the recommendation — S3 API compatible, zero egress fees, and an image resizing service in front of it. Backblaze B2 or plain S3 work identically; the SDK code does not change.

| Bucket / prefix | Access | Contents |
|---|---|---|
| `media/` | Public read via CDN | Article covers, inline images, logos, partner marks |
| `avatars/` | Public read via CDN | Reader avatars cached from Google at first sign-in |
| `private/` | Presigned GET only | Draft assets, analytics exports |

Upload keeps large files off the Node process entirely: the client asks the API for permission, the API validates declared MIME type and size and returns a **presigned PUT URL**, the browser uploads directly to R2, then calls back so the API records the row in `media`. Node never proxies bytes.

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

### 8.1 `apps/web` — Vite SPA, client-rendered

`apps/web` is a Vite + React Router SPA (`making-csr`), the same shape as `apps/admin` below — no more Next.js, no build-time data fetching, no server render of any kind. Production is shared/cPanel hosting with a hard cap on Node processes; a static export (the previous design, `making-static-for-web-and-admin`) still needed a rebuild-and-redeploy pipeline to keep published content current. A pure client-rendered SPA needs neither a Node process nor a rebuild: every route fetches its own data at request time, in the visitor's browser, straight from the API — so **publishing an article is visible immediately**, no rebuild step at all.

| Route | Data |
|---|---|
| `/` | `HomePage` fetches the home feed, guide picks, partners, and anak usaha on mount |
| `/news` | `NewsExplorer` reads filters from the URL (`useSearchParams`) and fetches articles itself, same as before |
| `/news/:slug` | `ArticlePage` fetches by slug via `useParams`; a 404 renders `NotFoundPage` inline rather than a route-level catch |
| `/contact` | Static copy, plus a live anak usaha fetch for the brand chips |
| `/team` | Fully static, no fetch |

`apps/api/src/lib/revalidate.ts` and its `DEPLOY_TRIGGER_URL`/`DEPLOY_TRIGGER_TOKEN` env vars still exist (they were added for the static-export design) and are still called on every article/curation/partner write, but are now genuinely inert: nothing needs revalidating when nothing is baked ahead of time. Left as a documented no-op rather than ripped out in the same change that made it pointless — a follow-up can remove it cleanly.

There is no `<head>`/OG-tag generation left (`generateMetadata` was a Next-only mechanism) — `useDocumentTitle` (`apps/web/src/lib/useDocumentTitle.ts`) sets `document.title` post-mount for each page, but a link shared to WhatsApp/social only ever sees `index.html`'s static title, since those crawlers don't execute JS. That gap is the accepted cost of a CSR SPA, not an oversight.

Reader session state is client-only (`apps/web/src/lib/readerSession.tsx`), same as it always was. Client data fetching for comments and likes is a plain `useState`/`useEffect` hook per island (`apps/web/src/components/article/useArticleEngagement.ts`), with `credentials: 'include'` on every request so session cookies travel. A single fetch wrapper handles the 401 → refresh → retry cycle in one place; never scatter that logic across call sites — `apps/web/src/lib/authApi.ts` is this for reader session calls today.

### 8.2 `apps/admin` — Vite SPA

No SEO requirement, so no SSR complexity — deployed as `vite build`'s static output, served directly by Apache/LiteSpeed with zero Node process cost. React Router (`BrowserRouter`) handles client-side routing; `apps/admin/public/.htaccess` rewrites unmatched requests to `index.html` so deep links and refreshes still resolve. `apps/web`'s own `public/.htaccess` does the same now that it's a client-rendered SPA too. Server state is fetched per page with `useState`/`useEffect` behind the shared `useAsyncAction` hook, and forms are controlled components validated against the shared Zod contracts directly.

> TanStack Query and react-hook-form were both named here originally and neither was ever added as a dependency to `apps/web` or `apps/admin`. This paragraph described libraries the project does not use for several changes before anyone checked. If either is adopted later, this line changes together with the `package.json`, not after it.

Unlike the reader-facing 401 → refresh → retry cycle above, the admin fetch wrapper's cycle is 403-keyed: `requireStaff`/`requirePermission` answer 403, not 401, for "no session" (see §5.5), so recovery branches on the response's error `code` — `forbidden` triggers refresh-then-retry, `csrf_failed` triggers CSRF-cookie recovery, `password_change_required` routes to the forced password-change screen — rather than on status code alone (`openspec/specs/admin-session`).

The editor is the centrepiece: Tiptap with a slash-command extension, bubble menu, drag handles, markdown input rules, and an upload extension wired to the presigned-URL flow. Autosave is a debounced mutation with optimistic status display.

The moderation queue polls every 30 seconds. Without a managed realtime/streaming layer, a websocket layer would be the only alternative, and it is not worth building for a queue two people look at. (Planned, not built — `openspec/changes/add-community-moderation`.)

---

## 9. Cross-cutting patterns

### 9.1 View counting

The one endpoint that must be cheap, since it fires on every article read.

```sql
-- single statement, no read-then-write race
insert into article_views_daily (article_id, date, views, unique_views)
values (?, curdate(), 1, ?)
on duplicate key update
  views        = views + 1,
  unique_views = unique_views + values(unique_views);
```

Uniqueness is decided first by an insert into `view_seen` with `insert ignore`; the affected-row count tells the caller whether this visitor is new today. Two statements, one transaction, no locks held.

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

| | Database | Web | Admin | API |
|---|---|---|---|---|
| Local | `pnpm db:up` (Docker Compose, MySQL 8.0) | :3000 | :5173 | :4000 |
| Staging | managed MySQL | `staging.siders.id` | `admin-staging.siders.id` | `api-staging.siders.id` |
| Production | managed MySQL | `siders.id` | `admin.siders.id` | `api.siders.id` |

All three production hostnames sit under one registrable domain so session cookies work with `SameSite=Lax`. Production targets shared/cPanel hosting rather than Vercel/Fly.io/Railway (`making-static-for-web-and-admin`, `making-csr`): `web` and `admin` are both Vite SPAs, each `vite build`'s `dist/` uploaded to the host as plain static files, `api` runs as its one Node App Selector entry, and nothing here needs Docker at that host — `docker-compose.yml` is local-dev-only, for the MySQL container.

`pnpm db:up` earns its place locally: it runs `docker-compose.yml`'s MySQL service, so no developer needs cloud credentials. Only the database container is used.

### Environment variables

```
# apps/web + apps/admin  (public — baked into the static build at build time, not read at
# runtime: there is no server left to read process.env from once `vite build` has run, so these
# must be set wherever the build itself runs, e.g. CI)
VITE_API_URL=https://api.siders.id
VITE_CDN_URL=https://cdn.siders.id

# apps/api  (server only)
DATABASE_URL=mysql://siders_api:...@db.siders.id:3306/siders

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

DEPLOY_TRIGGER_URL=         # leftover from the static-export design (§8.1) — inert now that web is CSR; unset = no-op
DEPLOY_TRIGGER_TOKEN=
SENTRY_DSN=
```

Note what is absent: no Supabase URL, no anon key, no service key. The frontends hold two public URLs and nothing else. Everything secret lives in one process.

---

## 11. Security checklist

- [ ] API database credential holds DML privileges only — no `CREATE`/`ALTER`/`DROP`, no grant management (`db/README.md`)
- [ ] Migration credential kept separate from the API's runtime credential
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
- [ ] Automated backups and point-in-time recovery enabled on the production MySQL instance
- [ ] Dependabot on, secrets scanned in CI

---

## 12. Known pitfalls

Collected because each one costs a day when met unprepared.

1. **`timezone: 'Z'`** missing from the connection pool → every `datetime` column silently shifts by the server's local offset.
2. **A generated column reading a cascading FK's base column** → MySQL refuses to create the constraint at all (`ERROR 1215`), not a runtime surprise but an easy one to hit when adding a column derived from a foreign key.
3. **`redirect_uri` mismatch** with the Google console entry, down to the trailing slash → callback fails only in the environment you didn't test.
4. **API on a different registrable domain** from the frontends → cookies require `SameSite=None`, which browsers are actively restricting. Fix the domains before writing auth code, not after.
5. **Tokens in `localStorage`** because it was easier during development → one XSS becomes full account takeover. Cookies from day one.
6. **Missing `state` check** → the OAuth flow works perfectly and is CSRF-vulnerable. Nothing will fail visibly.
7. **Matching readers on email** → account collisions the first time someone changes their Google address.
8. **`GET_LOCK`'s connection-scoping** (the advisory-lock reorder helper, `apps/api/src/lib/tableWriteLock.ts`) → it is released by the connection closing, not by transaction rollback; acquire and release must run on the one connection Drizzle pins to a `db.transaction()` callback, or a lock taken on one pooled connection is invisible everywhere else.
9. **A `useEffect` fetch with no stale-response guard** (`making-csr` — every page fetches its own data client-side now) → a fast filter change or param change can let an earlier, slower response resolve after a newer one and overwrite it. Every fetch-on-mount/fetch-on-param-change effect in `apps/web/src` uses a `cancelled` flag set in the cleanup function for exactly this reason; copy that pattern, don't skip it.
10. **Forgetting `credentials: 'include'`** on client fetches → intermittent 401s that look like token bugs and are cookie bugs.

---

## 13. Where this scales next

The architecture holds well past launch traffic. The first three things to change when it doesn't:

- **Redis** for rate limits and hot-article caching, once the API runs more than one instance.
- **Read replica** for the analytics dashboard, once daily aggregation queries start competing with reads.
- **Materialised view** on `article_views_daily` rolled up by category, once the dashboard's date ranges exceed a year of data.

None of these require schema changes. That is the point of aggregating views daily rather than logging every event.
