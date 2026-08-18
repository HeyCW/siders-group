## Context

`apps/api` modules follow `routes → controller → service → repository → mapper`, wired in `server.ts` per module (see `partner.*` for the reference shape). Every route must declare an authorization guard (`requirePublic`, `requireReader`, `requireStaff`, or `requirePermission`) or the app fails to boot (`auditAuthorizationDeclarations`). The staff permission catalog is a closed enum in `packages/contracts/src/permission.ts`, backed by `roles`/`permissions`/`role_permissions` tables (Drizzle, `packages/db/src/schema/rbac.ts`); permissions resolve fresh from the DB per request, never from the session token.

No real-time infrastructure exists anywhere in the app — no websockets, SSE, or query-polling library. The house convention for "staff should notice new X soon-ish" is a plain 30-second `setInterval` (`CommentModerationPage.tsx`, and the sidebar's own Jakarta-clock tick in `Sidebar.tsx`).

The public web app's fetch wrapper (`apps/web/lib/api.ts`) is deliberately minimal — no credentials, no CSRF header. The global CSRF middleware (`apps/api/src/lib/csrf.ts`) already passes through any request carrying no session cookie, so this needs no change to support a public write.

`docs/ARCHITECTURE.md` §9.3 already budgets "contact 3/hour" alongside the existing engagement rate limits, which live in `apps/api/src/middleware/rateLimit.ts` as one entry per feature in `ENGAGEMENT_RATE_LIMITS`, each in its own namespace so exhausting one budget never exhausts another.

## Goals / Non-Goals

**Goals:**
- A public submission endpoint with no session requirement, validated and rate-limited server-side independent of the client.
- A permission-gated (`contact.manage`) admin inbox: list (filterable, newest-first), mark read/unread, unread count.
- A near-real-time badge on the admin nav/logo via the existing 30s-poll convention.

**Non-Goals:**
- No in-app reply/send capability — replying is a manual, out-of-band action using the sender's email address.
- No archive/delete state for messages — `new`/`read` is the entire lifecycle.
- No general-purpose notification system. The unread count is specific to contact messages; a future capability (e.g. moderation) that wants a similar badge builds its own count and its own nav entry, not a shared bus.
- No real-time push (websocket/SSE). Polling is sufficient and consistent with the rest of the app.

## Decisions

**New `contact.manage` permission, not reuse of `settings.manage`.** Reading a stranger's submitted name, email, and message is a materially different privilege than editing site settings (e.g. partner ordering, which currently sits behind `settings.manage`). A dedicated permission keeps that separation explicit and lets it be granted independently of settings access. Cost: one migration adding the enum value and a `role_permissions` seed row for the Owner role.

**Read state lives on the message row (`status: 'new' | 'read'`), global rather than per-admin.** Mirrors how `community-moderation` models comment status directly on the comment rather than per-staff-member state. For a small staff, "someone already looked at this" is the useful signal; a per-admin read-state table would add real complexity (a join table, per-viewer queries) for a distinction this team doesn't need. If that changes later, it's an additive migration, not a rewrite.

**Read state is a toggle (`new ⇄ read`), not one-way.** A one-way "mark read" makes an accidental click on a nav badge/preview unrecoverable — the message silently disappears from the unread count with no way to flag it again. The toggle costs one extra endpoint and is worth it.

**Unread count is its own endpoint, not derived by the client from the full list.** The moderation queue's poll (`CommentModerationPage.tsx`) reloads its paginated list every 30s and, by its own documented trade-off, resets pagination to page one when it does. A dedicated `GET .../unread-count` avoids inheriting that problem: the badge polls a cheap, pagination-free count, independent of whatever the inbox list itself does. The inbox list has no pagination requirement in this change's spec (unlike the comment queue) and is unpaginated as shipped — see `packages/contracts/src/contact.ts`'s note on `contactMessageListResponseSchema`.

**Rate limit keyed by caller address (`clientIp`), 3/hour, own namespace.** Follows `reportRateLimiter`'s pattern exactly — a new entry in `ENGAGEMENT_RATE_LIMITS` named `contact`, so it can never share or steal budget from another endpoint's limiter. Unlike the reader-engagement limiters, this one cannot key by reader/staff id (the caller is anonymous by definition), so it uses `clientIp` the same way `publicReadRateLimiter` and `viewRateLimiter` do.

**Badge lives on a `Messages` nav item (new, under the `Site` sidebar group), and the wordmark mirrors it only when the wordmark is actually rendered.** The wordmark disappears when the sidebar is collapsed (`Sidebar.tsx` renders it only `{!collapsed && ...}`) and the whole shell is bypassed in the article editor's focus mode (`AppShell.tsx`'s `hideChrome`). A badge that lives solely on the wordmark would silently vanish in exactly the state (collapsed sidebar) where a compact badge is most useful. Making the nav item the source of truth means the count is visible whenever the sidebar itself is, with the wordmark badge as a bonus in the expanded state, and both are correctly absent in focus mode by construction (no chrome is rendered there at all).

**Poll interval: 30 seconds**, matching the two existing intervals in the codebase rather than introducing a new cadence.

## Risks / Trade-offs

- **[Risk] An anonymous write endpoint is a new abuse surface (spam, scripted flooding) that the codebase hasn't had before.** → Mitigation: server-side validation independent of the client, 3/hour per-address rate limit, and plain-text-only rendering in the inbox (no markup interpretation, so a malicious body can't become a markup/script injection vector in the admin UI).
- **[Risk] Storing an unauthenticated submitter's name, email, and message is new PII intake with no stated retention policy.** → Mitigation: out of scope for this change to define a retention/deletion policy; messages are kept indefinitely (per proposal). Flagged here so it's a visible, deliberate gap rather than a silent one.
- **[Trade-off] 30-second polling means the badge is "near" real-time, not instant.** → Acceptable: matches the existing moderation-queue convention, and adding websockets/SSE for this alone would be new infrastructure for a small win.
