# Deployment

How to get `apps/api`, `apps/web`, and `apps/admin` running on a real server.
Written against a Plesk-style Node.js hosting panel (the "Create Application"
form), but the requirements below hold for any host.

Architecture background — domains, cookies, connection strings — is in
[ARCHITECTURE.md](./ARCHITECTURE.md) §5.3, §6.2, §10.

---

## 1. What actually gets deployed

The repo is one pnpm workspace with three deployable targets. A hosting panel's
"Create Application" form creates **one** Node.js app, so this is three
deployments (two Node apps + one static site), not one.

| Target | Kind | Runs as | Suggested host |
|---|---|---|---|
| `apps/api` | Express, run from TypeScript source via `tsx` | Node process, listens on `PORT` | `api.<domain>` |
| `apps/web` | Next.js 14 (ISR + a route handler) | Node process, listens on `PORT` | `<domain>` |
| `apps/admin` | Vite SPA | **Static files** — no Node process | `admin.<domain>` |

`apps/admin` needs no Node application at all: `pnpm --filter @siders/admin build`
produces `apps/admin/dist`, which is served as plain static files with an
SPA fallback (every unmatched path rewrites to `/index.html` — that is what
`apps/admin/vercel.json` expresses on Vercel).

All three hostnames **must** sit under one registrable domain. Session and CSRF
cookies are issued with `SameSite=Lax` scoped to `COOKIE_DOMAIN`; split the API
onto a different registrable domain and auth stops working in the browser
(ARCHITECTURE.md §12, pitfall #4).

---

## 2. Hard requirements

- **Node.js 20 LTS.** Not negotiable and not a preference:
  - `next@14` requires `>=18.17`
  - `pnpm@9.5.0` requires `>=18.12`
  - the API source uses top-level `await`, `node:` import specifiers, and an
    ES2022 target (`packages/config/tsconfig/node.json`)

  CI (`.github/workflows/ci.yml`) and `apps/api/Dockerfile` both pin Node 20.
  A panel offering only Node 10 or 14 cannot run this project — check the
  version dropdown before anything else.
- **pnpm 9.5.0**, via corepack: `corepack enable && corepack prepare pnpm@9.5.0 --activate`.
  `npm install` does **not** work here: `package.json` files use the
  `workspace:*` protocol and the lockfile is `pnpm-lock.yaml`. A panel's
  "NPM install" button will fail on this repo — install over SSH instead.
- **The whole repository on disk.** `@siders/db` and `@siders/contracts` are
  consumed as raw TypeScript source (`"main": "./src/client.ts"`), resolved
  through the workspace symlink. Uploading `apps/api/` on its own leaves those
  imports unresolvable.
- **PostgreSQL** reachable from the server, with the app's tables in the `app`
  schema (see §6).

---

## 3. Why the API's startup file is not `dist/server.js`

`apps/api`'s production start command is:

```
"start": "tsx src/server.ts"
```

That is deliberate, not a leftover. `tsc -p apps/api` type-checks and emits, but
the emitted JS still imports `@siders/db` / `@siders/contracts`, whose entry
points are `.ts` files — plain `node dist/server.js` cannot load them. `tsx` is
a runtime dependency (not a devDependency) for exactly this reason.

**If your panel runs the app itself** (`pnpm start`, a Procfile, a Docker
`CMD`), point it at `pnpm --filter @siders/api start` and skip the rest of this
section.

**If your panel uses Phusion Passenger** (Plesk's Node.js support does), it
starts the app by running `node <startup file>`, so it needs a real `.js` entry
point. Two extra things bite here:

1. `node app.js` does not load `tsx`, so the loader must be registered in-process.
2. `src/server.ts` only calls `app.listen()` when it is the process entry point
   (`isMainModule`). Imported from a shim, it defines the server and never
   listens — the app boots and serves nothing.

So the shim has to reproduce the boot sequence. Both shims are committed:

- **`apps/api/passenger.js`** — registers tsx's ESM loader, then repeats the boot steps from
  the `isMainModule` block at the bottom of `apps/api/src/server.ts` (media dir, RLS
  assertion, scheduler, `listen`). If a boot step is ever added there, add it here too.
- **`apps/web/server.js`** — `next start` is a command, not a file, so this is the equivalent
  custom server over the prebuilt `.next` output.

Neither is used by local development or by `apps/api/Dockerfile`; they exist only for hosts
that start an app by running a file.

### Run exactly one API process

The scheduled-publish worker is in-process `node-cron`, registered at boot
(`apps/api/src/lib/scheduler.ts`), and it is not guarded by any lock. Passenger
spawns a *pool* of application processes by default, so every replica would run
the same every-minute job — duplicate publishes and duplicate revalidate calls.

Pin the API to a single instance (`passenger_max_pool_size 1`, or the panel's
equivalent). If the API ever genuinely needs to scale out, guard registered jobs
with a Postgres advisory lock first — that is the documented next step in
`scheduler.ts`.

`apps/web` has no such constraint and can run a normal pool.

---

## 4. Filling in the "Create Application" form

One pass per Node app (API, then web). `apps/admin` never goes through this form — it is
static output, so its hostname just needs a document root pointing at `apps/admin/dist` plus
the SPA fallback in §7.

**Create the subdomains first.** The Application URL control offers a dropdown of hostnames the
panel already knows about plus a URI path; `api.<domain>` and `admin.<domain>` only appear there
once they exist as subdomains. Deploying under a path (`<domain>/api`) instead works, but then
`APP_ORIGIN` and `ADMIN_ORIGIN` collapse to the same origin and every absolute URL in §5 changes
— prefer subdomains, which is also what ARCHITECTURE.md §10 assumes.

Both Node apps share one application root: upload the repository once and point each app at it,
differing only in startup file. (If the panel refuses to reuse a root across two apps, use two
separate checkouts of the same repo.)

| Field | Value |
|---|---|
| **Node.js version** | 20.x. If the highest available is below 18.17, stop — see §2. |
| **Application mode** | `Production`. This is what sets `NODE_ENV=production`; `Development` leaves pino pretty-printing and Next's dev behaviour in play. |
| **Application root** | The **absolute** path of the **repository root** on the server, and it must sit inside the hosting user's home directory — `/home/<user>/siders-group`, not `/siders-group` (read as a filesystem root) and not `apps/api` (see §2). Keep it *outside* the domain's document root, or `.git/` and any `.env` become downloadable over HTTP. |
| **Application URL** | The hostname this app answers on: `api.<domain>` for the API, the bare domain for web. |
| **Application startup file** | A path to a real file relative to the application root: `apps/api/passenger.js` or `apps/web/server.js` (§3). A bare project name like `siders-group` is not a startup file and the app will not boot. |
| **Environment variables** | See §5. |

Do not set `PORT` yourself when running under Passenger — it injects one and
expects the app to listen on it. `PORT` is read through
`z.coerce.number().default(4000)`, so an injected value is picked up
automatically.

---

## 5. Environment variables

### 5.1 `apps/api` (server-only, all secret)

Validated by Zod at boot in `apps/api/src/config/env.ts`; a missing or malformed
value fails startup with an explicit list, it does not degrade silently.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | default `development` | Set by the panel's Application mode. |
| `PORT` | default `4000` | Injected by Passenger; leave unset there. |
| `LOG_LEVEL` | default `info` | |
| `DATABASE_URL` | **yes** | Runtime connection. Supabase: the **pooler** URL, port `6543`. |
| `DIRECT_URL` | no | Migrations only, port `5432`. Never point migrations at the pooler (ARCHITECTURE.md §12 pitfall #2). |
| `SESSION_SECRET` | **yes** | ≥32 chars. Signs CSRF double-submit tokens. |
| `REVALIDATE_SECRET` | **yes** | ≥16 chars. Must be **identical** to `apps/web`'s value. |
| `ACCESS_TOKEN_PRIVATE_KEY` | **yes** | Ed25519 PKCS#8 PEM. Newlines as literal `\n` (§5.4). |
| `ACCESS_TOKEN_PUBLIC_KEY` | **yes** | Matching SPKI PEM, same `\n` encoding. |
| `GOOGLE_CLIENT_ID` | **yes** | |
| `GOOGLE_CLIENT_SECRET` | **yes** | |
| `GOOGLE_REDIRECT_URI` | **yes** | `https://api.<domain>/auth/google/callback`, byte-identical to the Google Console entry, trailing slash included (ARCHITECTURE.md §12 pitfall #3). |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | **yes** | Currently **unused** — media is stored on the local filesystem — but still `.min(1)` in the schema, so boot fails if they are absent. Set placeholders until R2 is wired up. |
| `MEDIA_STORAGE_PATH` | **yes** | **Absolute** path, writable by the app user. Put it *outside* the deployed tree (e.g. `/home/<user>/media`, sibling to the checkout) so a redeploy cannot wipe uploads. |
| `MEDIA_PUBLIC_BASE_URL` | **yes** | Public URL the stored files are served from: `https://api.<domain>/media-files`. |
| `MEDIA_MAX_IMAGE_BYTES` | default 10 MB | Raise the reverse proxy's own body limit to match, or large uploads are rejected before reaching Express. |
| `MEDIA_MAX_VIDEO_BYTES` | default 200 MB | Same. |
| `APP_ORIGIN` | **yes** | `https://<domain>` — CORS allowlist + post-sign-in redirect allowlist. No trailing slash. |
| `ADMIN_ORIGIN` | **yes** | `https://admin.<domain>`. |
| `TRUST_PROXY_HOPS` | default `0` | Set to the real number of proxies in front (usually `1` behind nginx/Passenger). Left at `0`, every IP-keyed rate limit collapses into one shared bucket. |
| `COOKIE_DOMAIN` | no, but yes in prod | `.<domain>` (leading dot) so web, admin, and api all receive the session cookie. |

### 5.2 `apps/web` (build **and** runtime)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.<domain>`. Inlined at build time — changing it later requires a rebuild, not a restart. |
| `REVALIDATE_SECRET` | Runtime only. Must match the API's value, or the scheduled-publish worker's on-demand revalidate calls return 401 and published articles never appear. |

### 5.3 `apps/admin` (build only)

| Variable | Notes |
|---|---|
| `VITE_API_URL` | `https://api.<domain>`. Baked into the bundle by `vite build`; defaults to `http://localhost:4000` if unset, which silently ships a broken production build. |

### 5.4 Generating the secrets

```bash
openssl rand -hex 32                              # SESSION_SECRET
openssl rand -hex 16                              # REVALIDATE_SECRET

openssl genpkey -algorithm ed25519 -out access.key
openssl pkey -in access.key -pubout -out access.pub

# PEM -> single line with literal \n, which is what the env schema expects
awk '{printf "%s\\n", $0}' access.key             # ACCESS_TOKEN_PRIVATE_KEY
awk '{printf "%s\\n", $0}' access.pub             # ACCESS_TOKEN_PUBLIC_KEY
```

Delete `access.key` from the server once it is in the panel. It is never
committed and never needed on disk.

---

## 6. Database

1. **Create the database** and a role for the API.
2. **Run migrations against the direct connection**, never the pooler:

   ```bash
   DIRECT_URL='postgresql://…:5432/postgres' pnpm --filter @siders/db db:migrate
   ```

3. **The API's role must be exempt from RLS.** Every table added by the
   news/curation/engagement/moderation changes has RLS enabled with zero
   policies — default deny. A connection subject to RLS reads *zero rows* and
   returns ordinary empty `200`s, which looks like "no articles yet" rather than
   an error. `assertDatabaseRoleCanReadNewsTables` checks this at boot; heed it.
   Owning the tables, `BYPASSRLS`, or superuser all satisfy it.
4. **Seed the first Owner.** No API route can create the first staff account
   (creation needs `user.manage`, and granting Owner needs Owner). `supabase/seed.sql`
   seeds one — but with a **fixed local-dev password**. For production, change
   the email and replace the hash with a fresh Argon2id hash at the parameters
   in `apps/api/src/lib/password.ts`. `must_change_password` starts `true`, so the
   first sign-in forces a change.

---

## 7. Build and release order

```bash
corepack enable && corepack prepare pnpm@9.5.0 --activate
pnpm install --frozen-lockfile

# 1. API — no build step; it runs from source via tsx.
#    Start it now: the web build needs it reachable (see below).

# 2. Admin — static bundle
VITE_API_URL=https://api.<domain> pnpm --filter @siders/admin build
#    -> deploy apps/admin/dist to admin.<domain> with an SPA fallback

# 3. Web — Next.js
NEXT_PUBLIC_API_URL=https://api.<domain> pnpm --filter @siders/web build
```

**The API must be running and reachable before `next build`.** `apps/web/app/page.tsx`
uses ISR (`revalidate = 60`) with no `dynamic` override, so `/` is statically
rendered at build time and really does fetch `/home`, `/articles`, and
`/categories`. With the API down, the build fails. (CI works around this with
`apps/web/scripts/ci-mock-api.mjs`; production should build against the real API.)

Static-file rewrite for `admin.<domain>`, Apache flavour:

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

nginx flavour:

```nginx
location / { try_files $uri $uri/ /index.html; }
```

---

## 8. Verify

```bash
curl https://api.<domain>/health          # {"status":"ok","timestamp":"…"}
curl -I https://<domain>                  # 200 from Next
curl -I https://admin.<domain>/login      # 200 (SPA fallback working, not 404)
```

Then, in a browser: sign in to admin, upload an image, publish an article, and
confirm it appears on the public site within ~60s. That single path exercises
cookies across subdomains, CORS, media storage, and ISR revalidation together.

---

## 9. Checklist

- [ ] Node 20 available on the host
- [ ] Application mode set to Production
- [ ] Application root is an absolute path under the hosting user's home, pointing at the repo root (not `apps/api`, not inside the document root)
- [ ] Startup file is a real file path (§3), not a project name
- [ ] `pnpm install --frozen-lockfile` run over SSH, not the panel's npm button
- [ ] All three hostnames under one registrable domain, HTTPS on each
- [ ] `COOKIE_DOMAIN` set with a leading dot
- [ ] `TRUST_PROXY_HOPS` matches the real proxy count
- [ ] `GOOGLE_REDIRECT_URI` matches the Google Console entry exactly
- [ ] `REVALIDATE_SECRET` identical in api and web
- [ ] `MEDIA_STORAGE_PATH` absolute, writable, outside the deployed tree
- [ ] Migrations run against port 5432, not 6543
- [ ] API's DB role exempt from RLS
- [ ] Production Owner seeded with a fresh Argon2id hash, dev password removed
- [ ] API pinned to one process (in-process cron, §3)
- [ ] `/health` returns ok
