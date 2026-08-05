## Context

`docs/ARCHITECTURE.md` is the source of truth for the layout this change scaffolds. The interesting decisions here are the same decisions the architecture doc already made:

- pnpm monorepo with `apps/{api,admin,web}` and `packages/{db,contracts,config}` (§3).
- Module-per-feature backend (`apps/api/src/modules/<feature>/`) with strict layering — controllers don't know about business meaning, services don't import Drizzle, repositories don't import Express, mappers turn rows into DTOs (§4).
- TypeScript strict mode, ESM, single source of truth for env via Zod at boot (§4).
- Drizzle on top of Supabase Postgres in the `app` schema, RLS default-deny on every table (§6.3).
- Vitest as the workspace test runner (decision: matches Vite/TS ergonomics, runs in Node for the API, single config the whole workspace can share).

What this change adds on top: a `packages/config` package to host the shared `tsconfig`s and eslint config, a `node-cron` slot in the API for in-process scheduled jobs (decision per `add-news-management-system` Q3), and a single Vitest config at the workspace root that every package picks up.

## Goals / Non-Goals

**Goals:**
- Create the directories and config files described in §3 of the architecture so any feature change can land code into them.
- Establish the strict layering convention (controller / service / repository / mapper) by stubbing one feature module and one DTO.
- Stand up the env-validated boot path so a missing `DATABASE_URL` crashes at startup, not on first request (§4).
- Wire Vitest across the workspace with one passing smoke test per app/package.

**Non-Goals:**
- Auth flow, password reset, invite, refresh rotation — all `users` module work, deferred to a follow-up.
- Article CRUD, media upload, sanitizer allowlist, public read endpoints — `add-news-management-system`.
- Migrations with real SQL — only the migration directory and Drizzle config land here.
- Production deployment config (Docker, Fly, Vercel) — out of scope; this change ends at "runs locally with `pnpm dev`."

## Decisions

**Package manager: pnpm workspaces.** Architecture doc §3 specifies pnpm; using it gives a single lockfile, hoisted shared deps, and a built-in `pnpm --filter` for cross-package commands.

**TypeScript: strict mode, project references.** Each app/package has its own `tsconfig.json` that extends `packages/config/tsconfig/base.json`. Project references let `tsc --build` type-check the whole workspace incrementally. Per-app `tsconfig`s override `noEmit` and the JSX settings for the frontends.

**Test runner: Vitest with a single workspace config.** One `vitest.config.ts` at the repo root with `workspace` projects (one per app/package). Each project points at its own test glob and its own environment (`jsdom` for `apps/admin` and `apps/web`, `node` for `apps/api` and the two packages). This is the documented Vitest monorepo pattern and avoids per-package runner configs drifting apart.

**Cron: in-process `node-cron`.** Decision captured from the apply conversation. The API process boots the scheduler alongside Express; no separate worker process. This is the simplest deploy shape and is appropriate for the cron load (one job per minute). A separate worker is a one-file split later if needed.

**Logging: pino.** Architecture doc §4 specifies pino, structured JSON. One shared config in `apps/api/src/lib/logger.ts` exports a configured logger that every module imports.

**Env validation: Zod at boot.** `apps/api/src/config/env.ts` parses `process.env` through a Zod schema and throws on startup if anything is missing or malformed. This is the "crash on startup, not at 2am" rule from §4.

**Error handling: typed `AppError` subclasses + one `errorHandler` middleware.** Architecture doc §4. The base class carries an HTTP status and a stable error code; the middleware formats the response and logs the underlying cause. Skeleton only here.

**RLS posture.** Same as `add-news-management-system` design: every new table gets `enable row level security` with no policies; the API's DB role has `BYPASSRLS`. No SQL ships in this change, but the policy is documented in the seed/migration convention note in `supabase/README.md`.

**ESM throughout.** `package.json` `"type": "module"` everywhere. Drizzle, Zod, pino, and `node-cron` all support ESM cleanly; mixing CJS and ESM in a strict-TS monorepo is more friction than it's worth.

## Risks / Trade-offs

- **Single test runner across front and back** → Vitest handles both, but `apps/web` (Next.js) has its own quirks (server components, ISR routes) that may want Playwright for E2E. Mitigation: add Playwright only when a feature change actually needs it. Not in scope here.
- **In-process cron** → if the API has multiple replicas, the cron job runs once per replica. Mitigation: pin the API to 1 replica for now, or wrap the job in a Postgres advisory lock if/when it scales out. Document the constraint in the scheduler file.
- **`packages/config` as a fourth package** → the architecture doc lists three; I'm adding one. Mitigation: tiny package, only `tsconfig` and `eslint-config` files; one less place to repeat config. If you'd rather collapse it into the root `package.json` configs, say so and I'll fold it.
- **No real migrations yet** → the first feature change (`add-news-management-system`) supplies the SQL. The migration directory is created empty.
- **No CI image or deploy config** → this change ends at "runs locally." Production deploy is a follow-up.

## Migration Plan

No database state. The single reversible move is "delete the directories this change created" if the scaffold is rejected. No backfill, no contracts to keep alive.

## Open Questions

_None that block the change._
