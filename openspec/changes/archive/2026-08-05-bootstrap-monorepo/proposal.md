## Why

`docs/ARCHITECTURE.md` describes a pnpm monorepo with `apps/{api,admin,web}`, `packages/{db,contracts,config}`, and `supabase/` migrations, but none of those directories exist yet. Every other change (`add-news-management-system` is the first one) needs a workspace to live in: a `packages/db` Drizzle schema, a `packages/contracts` Zod module, an Express app, a Vite+React admin, and a Next.js public site. Without this scaffold, no follow-up change can be implemented or tested.

## What Changes

- Add a pnpm workspace at the repo root (`pnpm-workspace.yaml`, `tsconfig.base.json`, root `package.json` scripts).
- Add `apps/api` (Node + Express + TypeScript) with module-per-feature layout, Zod-validated env config, request-id middleware, error-handler middleware, structured logger (pino), and the `authenticate` / `requireStaff` middleware stubs needed by future changes.
- Add `apps/admin` (Vite + React + TypeScript) with Tailwind CSS, a router skeleton, and a placeholder layout.
- Add `apps/web` (Next.js + TypeScript) with the App Router skeleton and ISR revalidate route handler.
- Add `packages/db` (Drizzle schema, drizzle-kit config, generated client, migration directory) with the connection-layer shape that future migrations will slot into.
- Add `packages/contracts` (Zod schemas, shared types) with the `ArticleStatus` enum module that `add-news-management-system` will reuse.
- Add `packages/config` (shared `tsconfig`s, eslint config, tailwind preset).
- Add `supabase/config.toml`, `supabase/migrations/` (empty until a feature change supplies SQL), and `supabase/seed.sql`.
- Add CI workflow file (`.github/workflows/ci.yml`) that runs `pnpm install`, lint, type-check, and test across the workspace.
- Add `apps/api/src/lib/sanitizeHtml.ts` skeleton (no allowlist yet — that's `add-news-management-system` task 3.1) and `apps/api/src/lib/storage.ts` skeleton (R2 presigned URL helpers will land in `add-news-management-system` task 7.6).
- Add `apps/api/src/lib/mailer.ts` and `apps/api/src/lib/tokens.ts` and `apps/api/src/lib/password.ts` skeletons.
- Add `apps/api/src/modules/users/` skeleton (the staff module the auth layer needs).
- Add Vitest configured at the workspace root with one smoke test per app/package proving the test runner reaches every package.
- **BREAKING**: none. No existing contracts to break.

## Capabilities

### New Capabilities
_None. This change is a pure scaffold — it creates files and configuration but does not introduce any user-visible behavior. The architecture doc describes the layout; this change makes the layout exist so feature changes can land inside it._

### Modified Capabilities
_None._

This change sets `skip_specs: true` in `.openspec.yaml`. Specs describe behavior, and this change has no behavior of its own.

## Impact

- **Affected code**: net-new files only. No existing code is modified.
- **New top-level dirs**: `apps/`, `packages/`, `supabase/`, `.github/workflows/`.
- **Dependencies**: pnpm workspace, TypeScript, Express, Next.js, Vite, React, Tailwind, Drizzle (`drizzle-orm`, `drizzle-kit`), Zod, Vitest, pino, `node-cron`. All added at the root `package.json`; nothing installed yet because we'll let the user run `pnpm install` to lockfile the actual versions.
- **Migration**: None. No database tables yet.
- **Out of scope**: any feature behavior (auth flows, article CRUD, media upload, etc.). Each of those is a separate change against this scaffold.
- **Prerequisite for**: `add-news-management-system` (and every future feature change).
