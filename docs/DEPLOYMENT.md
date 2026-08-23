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

  Prefer 20 over a newer major, too. `argon2` (staff password hashing) is a
  native addon: on a Node major it has no prebuilt binary for, install either
  falls back to compiling from source or the module fails to load at boot with
  an ABI/`NODE_MODULE_VERSION` mismatch. 20 is the version this repo is built
  and tested on.
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

**On a shared box, add the thread and heap caps here too**, as ordinary environment variables
on each app:

```
UV_THREADPOOL_SIZE=2
NODE_OPTIONS=--max-old-space-size=512 --v8-pool-size=2
```

Neither is read by application code — they size Node's own pools. Without them, V8 and libuv
size themselves from the *host's* core count and total RAM, which on shared hosting is wildly
larger than the account's real quota. This is the same failure as §9, and it applies to the
long-running Passenger processes exactly as it does to a build.

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

# On memory- or process-limited shared hosting, run these one at a time
# rather than in parallel — see §9.

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

## 9. Troubleshooting

### `require is not defined in ES module scope` in the startup file

Read the file before assuming it is the one in this repo:

```bash
head -3 apps/api/passenger.js
```

If it opens with `var http = require('http');` it is the panel's own placeholder. When the
startup file named on the form does not exist at that path, the panel **creates a stub** there —
a CommonJS hello-world — and Passenger dutifully runs it. Under `apps/api`'s `"type": "module"`
that stub cannot even parse, so the app 503s.

The stub is the symptom; the cause is that the checkout on the server does not contain
`apps/api/passenger.js` — it is older than, or diverged from, the branch being deployed. Get the
right code onto the server (§7) instead of editing the stub. Once a real file exists at that
path, the panel leaves it alone.

### `node: command not found` over SSH

Panels built on CloudLinux's Node.js Selector install Node **per application**, in a virtualenv
named after the application root's path relative to the home directory — not system-wide. An SSH
session starts outside it, so `node`, `npm`, and `pnpm` are all missing until it is activated:

```bash
ls -d ~/nodevenv/*/*/ 2>/dev/null                       # available app environments
source ~/nodevenv/siders-group/20/bin/activate          # the one matching this app root
node -v
```

The panel's application page usually shows this exact command. The interpreters themselves also
sit at `/opt/alt/alt-nodejs<major>/root/usr/bin/node` if the virtualenv is missing.

Two consequences worth knowing:

- Changing the Node version in the panel creates a **different** virtualenv path, so an
  activation command that worked before will point at the old version afterwards.
- Inside the virtualenv, `npm install -g` installs into that environment rather than the system,
  which is how to get pnpm: `npm install -g pnpm@9.5.0`.

The panel's own "run script" button activates the environment for you — which is why a command
can work there and fail in a plain SSH session.

### `ERR_WORKER_INIT_FAILED EAGAIN` during `pnpm install`

The same thread ceiling as above, hit by pnpm itself rather than by the app. pnpm extracts
packages on a pool of worker threads sized from the visible core count, and each worker carries
its own V8 threads — on an 80-core host that is far more than a constrained account allows.

Turn every concurrency knob down together; capping only one is usually not enough:

```bash
export UV_THREADPOOL_SIZE=1
export NODE_OPTIONS="--max-old-space-size=512 --v8-pool-size=1"
pnpm install --frozen-lockfile --workspace-concurrency=1 --child-concurrency=1
```

If even that fails, stop installing on the server. Install on a machine with the same Node
major and a flat layout, then copy the result up:

```bash
pnpm install --frozen-lockfile --node-linker=hoisted
tar czf node_modules.tgz node_modules apps/*/node_modules packages/*/node_modules
```

`--node-linker=hoisted` matters: pnpm's default layout is a tree of symlinks into a
content-addressed store that does not survive being copied to another machine. Hoisted output is
flat and self-contained, like npm's.

A host this constrained is worth questioning rather than working around indefinitely — the
architecture assumes a platform sized for the app (ARCHITECTURE.md §10), and every step here has
cost a workaround.

### 503 from the deployed URL

Passenger reached the app and the app failed to start. The status says nothing about *why*;
the actual error went to the app's stderr. Get it directly rather than guessing — run the
startup file by hand, which bypasses Passenger entirely:

```bash
cd /home/<user>/siders-group
node -v                      # must be 20.x
node --env-file=apps/api/.env apps/api/passenger.js
```

Environment variables entered in the panel are injected into the Passenger process only — an SSH
session does not have them. Hence the `--env-file` above: keep a local `apps/api/.env` (gitignored)
mirroring the panel's values purely for running the app by hand. Nothing in production reads that
file; `apps/api`'s `dev` script is the only thing that loads one, via `--env-file`.

The likely culprits all print a specific message here:

- **`Invalid environment configuration:`** followed by a list — `loadEnv` rejected the
  environment (§5). Nothing was set on the app yet, or `MEDIA_STORAGE_PATH` is not absolute, or
  a PEM key lost its `\n` encoding. This is by far the most common 503 on a first deploy.
- **A syntax error on `await` or `import`** — the panel is still on an old Node (§2).
- **A database error from `assertDatabaseRoleCanReadNewsTables`** — `DATABASE_URL` is wrong or
  Postgres is unreachable from this host.
- **`Cannot find module`** — dependencies were never installed with pnpm, or the checkout does
  not contain the startup file.

Passenger's own copy of that output lands in the domain's error log:

```bash
ls ~/logs 2>/dev/null
find /home/<user> -maxdepth 4 -name '*error*log*' 2>/dev/null | head
```

### 404 at the API's base URL

Not a fault. The API registers no route at `/` — the shallowest ones are `/health`, `/articles`,
`/categories` (`apps/api/src/server.ts`). Test with `/health`, not the bare base URL.

### `pthread_create: Resource temporarily unavailable`, then SIGABRT

```
node[2582412]: pthread_create: Resource temporarily unavailable
… exited with code SIGABRT
```

The kernel refused to create a thread (`EAGAIN`). Node needs several at startup — the libuv
threadpool, V8's platform and GC threads — so it aborts before running a single line of the
app. This is never an application bug; the code has not started yet.

On shared hosting it means one of the account's limits was hit:

- **process/thread cap** (`ulimit -u`, or CloudLinux LVE `NPROC`/`EP`, or a cgroup `pids.max`)
- **memory cap** (`ulimit -v`, LVE `PMEM`/`VMEM`, cgroup `memory.max`) — a failed thread-stack
  allocation surfaces as exactly the same error

**`ulimit` reporting `unlimited` does not mean there is no limit.** CloudLinux LVE and cgroups
enforce their caps outside the shell's rlimits, so `ulimit` stays `unlimited` while the kernel
still refuses the thread. Look at the enforcing layer instead:

```bash
cat /proc/lve/list 2>/dev/null          # CloudLinux, when readable
cat /sys/fs/cgroup/pids.max /sys/fs/cgroup/memory.max 2>/dev/null      # cgroup v2
cat /sys/fs/cgroup/pids/pids.max 2>/dev/null                           # cgroup v1
nproc; free -m
```

Counting threads *after* the crash proves nothing — measure while something is running:

```bash
node -e 'setTimeout(() => {}, 10000)' &
sleep 1; ps -u "$(whoami)" -L | wc -l
```

`nproc` matters more than it looks: V8 sizes its platform thread pool from the visible core
count, which on a shared box is the **host's** core count, not the account's share. One idle
Node can therefore hold dozens of threads, and three at once multiplies that. Cap both pools
explicitly:

```bash
export UV_THREADPOOL_SIZE=2
export NODE_OPTIONS="--max-old-space-size=512 --v8-pool-size=2"
```

The usual trigger is starting several Node processes at once. In particular, **do not run
`pnpm dev` on the server**: it starts three watchers (tsx, Vite, Next) that each compile in
memory, which is both far over the limit and the wrong thing to run in production anyway.

If a *build* dies this way, build one app at a time and cap the heap:

```bash
NODE_OPTIONS=--max-old-space-size=512 pnpm --filter @siders/admin build
NODE_OPTIONS=--max-old-space-size=512 pnpm --filter @siders/web build
```

`next build` also parallelises over the visible core count; `experimental.cpus` in
`apps/web/next.config.mjs` caps that if the heap flags alone are not enough.

If `next build` still cannot finish inside the account's limits, build off-server — locally or
in CI, with the same Node 20 and the same `NEXT_PUBLIC_API_URL` — and upload the resulting
`apps/web/.next` and `apps/admin/dist`. Runtime is much lighter than build time: only two Node
processes (api and web), both started by the panel.

---

## 10. Checklist

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
