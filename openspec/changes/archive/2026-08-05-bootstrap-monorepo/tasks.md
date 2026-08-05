## 1. Workspace root

- [x] 1.1 Create `pnpm-workspace.yaml` listing `apps/*` and `packages/*`
- [x] 1.2 Update root `package.json`: add `private: true`, `"type": "module"`, scripts (`dev`, `build`, `test`, `lint`, `typecheck`), and the shared devDeps (typescript, vitest, @types/node, eslint, prettier)
- [x] 1.3 Add root `tsconfig.base.json` with strict mode, ESM, `moduleResolution: bundler`, and the shared compiler options
- [x] 1.4 Add root `eslint.config.js` (flat config) with TypeScript + React presets
- [x] 1.5 Add root `.prettierrc` and `.prettierignore`
- [x] 1.6 Add root `vitest.config.ts` with the `workspace` projects for each app/package
- [x] 1.7 Add `.editorconfig` and update `.gitignore` for the new directories

## 2. packages/config

- [x] 2.1 Create `packages/config/` with its own `package.json` (`"name": "@siders/config"`) and `tsconfig/` directory
- [x] 2.2 Add `tsconfig/base.json` (strict, ESM, common lib), `tsconfig/node.json` (extends base, target Node 20), `tsconfig/react.json` (extends base, jsx: react-jsx, dom lib)
- [x] 2.3 Add `eslint/base.cjs`, `eslint/node.cjs`, `eslint/react.cjs`
- [x] 2.4 Add a Vitest smoke test asserting the config files exist and parse

## 3. packages/contracts

- [x] 3.1 Create `packages/contracts/` with its `package.json` (`"name": "@siders/contracts"`), extending the node tsconfig
- [x] 3.2 Add `src/index.ts` re-exporting the modules
- [x] 3.3 Add `src/article-status.ts` exporting the `ArticleStatus` enum (`draft | scheduled | published`) and the `ARTICLE_STATUSES` tuple — used by `add-news-management-system` task 2.2
- [x] 3.4 Add `src/health.ts` exporting a `PingResponse` Zod schema (used by the API health route)
- [x] 3.5 Add a Vitest smoke test for `article-status` and `health`

## 4. packages/db

- [x] 4.1 Create `packages/db/` with its `package.json` (`"name": "@siders/db"`) and tsconfig extending node
- [x] 4.2 Add `src/schema/index.ts` re-exporting the (currently empty) schema modules
- [x] 4.3 Add `src/client.ts` exporting `getDb(env)` returning a Drizzle client over `pg` (no tables yet)
- [x] 4.4 Add `drizzle.config.ts` pointing at `supabase/migrations` and the schema entry
- [x] 4.5 Add a Vitest smoke test for the client import

## 5. apps/api

- [x] 5.1 Create `apps/api/` with its `package.json` (`"name": "@siders/api"`), `tsconfig.json` extending `@siders/config/tsconfig/node.json`
- [x] 5.2 Add `src/server.ts` (Express app factory, `listen` on `env.PORT`)
- [x] 5.3 Add `src/config/env.ts` (Zod-validated env: `DATABASE_URL`, `PORT`, `NODE_ENV`, `LOG_LEVEL`, `REVALIDATE_SECRET`, `R2_*`, `GOOGLE_*`, `SESSION_SECRET`, `RESEND_API_KEY`, `APP_ORIGIN`, `ADMIN_ORIGIN`)
- [x] 5.4 Add `src/lib/logger.ts` (pino, structured JSON, log level from env)
- [x] 5.5 Add `src/lib/sanitizeHtml.ts` skeleton (no allowlist — that's `add-news-management-system` 3.1)
- [x] 5.6 Add `src/lib/storage.ts` skeleton (R2 presigned URL helpers — fleshed out in `add-news-management-system` 7.6)
- [x] 5.7 Add `src/lib/mailer.ts`, `src/lib/tokens.ts`, `src/lib/password.ts` skeletons
- [x] 5.8 Add `src/middleware/requestId.ts`, `src/middleware/errorHandler.ts`, `src/middleware/rateLimit.ts`, `src/middleware/authenticate.ts`, `src/middleware/authorize.ts` (stubs only — `requireStaff` returns 401 until real auth lands)
- [x] 5.9 Add `src/modules/users/` skeleton (routes, controller, service, repository, mapper) wired to `authenticate` + `requireStaff`
- [x] 5.10 Add `src/modules/health/` with a `GET /health` route returning the `PingResponse` from `@siders/contracts`
- [x] 5.11 Add `src/lib/scheduler.ts` exporting `startScheduler()` that boots `node-cron`; no jobs registered yet
- [x] 5.12 Add a Vitest smoke test for the env validator and the health module

## 6. apps/admin

- [x] 6.1 Create `apps/admin/` with Vite + React + TypeScript (`"name": "@siders/admin"`), tsconfig extending the React base
- [x] 6.2 Add `index.html`, `src/main.tsx`, `src/App.tsx` with a router skeleton (`/`, `/articles`, `/articles/:id`, `/login`)
- [x] 6.3 Add Tailwind CSS config + the shared preset path (placeholder; the real preset lands in a follow-up)
- [x] 6.4 Add `src/lib/api.ts` (typed fetch wrapper that targets `env.VITE_API_URL` and attaches the session cookie)
- [x] 6.5 Add a Vitest smoke test for the api client

## 7. apps/web

- [x] 7.1 Create `apps/web/` with Next.js 14 + App Router + TypeScript (`"name": "@siders/web"`), tsconfig extending the React base
- [x] 7.2 Add `app/layout.tsx`, `app/page.tsx`, `app/news/page.tsx` and `app/news/[slug]/page.tsx` (placeholder; the real consume-the-public-API logic is `add-web-news-pages` follow-up)
- [x] 7.3 Add `app/api/revalidate/route.ts` gated by `REVALIDATE_SECRET`
- [x] 7.4 Add `next.config.mjs` with the `revalidate` config placeholder
- [x] 7.5 Add a Vitest smoke test for the revalidate route handler

## 8. supabase

- [x] 8.1 Create `supabase/config.toml` with the project's local stack config
- [x] 8.2 Create `supabase/migrations/` (empty; feature changes add `.sql` files)
- [x] 8.3 Create `supabase/seed.sql` with the comment "feature changes append here"
- [x] 8.4 Create `supabase/README.md` documenting the RLS posture (default-deny on every new table; API role has `BYPASSRLS`)

## 9. CI

- [x] 9.1 Create `.github/workflows/ci.yml` running `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` on every push and PR
- [x] 9.2 Cache `~/.local/share/pnpm/store` for the workflow

## 10. Verification

- [x] 10.1 `pnpm install` resolves cleanly
- [x] 10.2 `pnpm typecheck` passes across the workspace
- [x] 10.3 `pnpm test` runs and every smoke test passes
- [x] 10.4 `pnpm dev` starts `apps/api` on `PORT` and `apps/admin` on the Vite default port
- [x] 10.5 `GET /health` returns 200 with the `PingResponse` shape
