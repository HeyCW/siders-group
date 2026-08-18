## 1. Data layer

- [x] 1.1 Add `contact_messages` table to `packages/db/src/schema/` (id, name, organisation nullable, email, subject nullable, message, status enum `'NEW' | 'READ'` defaulting to `NEW`, created_at) under the `app` schema
- [x] 1.2 Generate the Drizzle migration (`db:generate`) and review the resulting SQL under `supabase/migrations/`
- [x] 1.3 Add `contact.manage` to the permission enum in `packages/contracts/src/permission.ts`
- [x] 1.4 Seed a `role_permissions` row granting `contact.manage` to the Owner role (matching how other permissions are seeded)

## 2. Contracts

- [x] 2.1 Add `contactMessageSubmitRequestSchema` (name, email, message required; organisation, subject optional) to `packages/contracts/src/contact.ts`
- [x] 2.2 Add response/list schemas: submitted-message shape for the public endpoint, and the admin list-item shape (includes `status`) plus a status-filter query schema (`NEW` | `READ` | unfiltered)

## 3. API: public submission endpoint

- [x] 3.1 Create `apps/api/src/modules/contact/` following the routes/controller/service/repository/mapper layering used by `modules/partners`
- [x] 3.2 Add `contactRateLimiter()` to `apps/api/src/middleware/rateLimit.ts` — new entry in `ENGAGEMENT_RATE_LIMITS` (`name: 'engagement-contact'`, 3/hour, keyed by `clientIp`)
- [x] 3.3 Wire `POST /contact-messages` with `requirePublic()` + `contactRateLimiter()`, validating the body with the schema from 2.1 and inserting via the repository
- [x] 3.4 Wire the module into `apps/api/src/server.ts`

## 4. API: admin inbox endpoints

- [x] 4.1 Wire `GET /admin/contact-messages` with `requirePermission('contact.manage')`, supporting the status filter from 2.2, newest-first
- [x] 4.2 Wire `GET /admin/contact-messages/unread-count` with `requirePermission('contact.manage')`, returning the count of `NEW` messages
- [x] 4.3 Wire `PATCH /admin/contact-messages/:id` with `requirePermission('contact.manage')` to set `status` to `NEW` or `READ`; reject an unknown id with 404
- [x] 4.4 Add tests for permission gating (missing permission, no session), the rate limit on submission, validation rejection, and the toggle behavior (including the unknown-id case)

## 5. Admin UI

- [x] 5.1 Add `apps/admin/src/lib/contactApi.ts` following the shape of `moderationApi.ts` (list, unread count, mark read/unread)
- [x] 5.2 Add a `Messages` inbox page rendering the list newest-first, filterable by status, message body rendered as literal text (no markup interpretation), with a mark read/unread control per message
- [x] 5.3 Add a `Messages` entry (with `permission: 'contact.manage'`) to the `Site` nav group in `apps/admin/src/components/Sidebar.tsx`, and register the route in `apps/admin/src/App.tsx`
- [x] 5.4 Add a 30-second `setInterval` poll for the unread count in `Sidebar.tsx` (alongside the existing clock tick), rendering a badge on the `Messages` nav item and on the wordmark when the wordmark is rendered (expanded sidebar, non-focus-mode)

## 6. Public contact form

- [x] 6.1 Add a `submitContactMessage` call to `apps/web/lib/api.ts` (or a small `contactApi.ts` alongside it) posting to `POST /contact-messages`
- [x] 6.2 Update `ContactForm.tsx`'s `handleSubmit` to call the endpoint after client-side validation passes, and replace the "sending isn't wired up yet" success state with a genuine success message
- [x] 6.3 Add a failure state to `ContactForm.tsx` for a rejected/failed request (network error, server error, or 429 rate limit) that reports failure and preserves the visitor's input
- [x] 6.4 Update `ContactForm.test.tsx` to cover the real submit call: success, failure, and that client-side validation still blocks invalid input before any request is made

## 7. Verification

- [ ] 7.1 Run `pnpm --filter @siders/api test`, `pnpm --filter @siders/admin test`, `pnpm --filter @siders/web test`
- [ ] 7.2 Run `pnpm --filter @siders/web typecheck` and `pnpm --filter @siders/admin typecheck`
- [x] 7.3 Ran the app locally against a real Postgres: verified via HTTP end-to-end — public submission lands in the DB, admin list/unread-count/toggle all behave correctly (including 403 for no-permission, 403 for no session, 404 for unknown id, 429 past the 3/hour rate limit). Browser-level visual check (badge rendering, collapsed sidebar) not done — no browser automation available in this environment; recommend a manual look before merging
