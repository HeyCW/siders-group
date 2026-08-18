## Why

The Contact page's message form currently validates input but cannot submit it anywhere — no backend endpoint accepts a contact submission, so every visitor is told to email the team directly instead. That's a dead end for a page whose whole purpose is to let visitors reach the team. Staff should be able to receive and read these messages from the admin panel, with a badge that surfaces when a new one arrives.

## What Changes

- Add a public, unauthenticated endpoint that accepts contact form submissions (name, organisation, email, subject, message) and stores them.
- Add a permission-gated admin inbox that lists submitted messages, newest first, filterable by read status.
- Add an unread-message count endpoint that the admin sidebar polls (30s, matching the existing moderation-queue and clock polls) to badge the nav item and the wordmark.
- Add a "mark as read" action; a message may also be marked unread again (no accidental-click dead end). There is no archive/delete state — a message stays in the inbox as `READ` or `NEW` indefinitely.
- Add a `contact.manage` permission, required by every admin contact-message endpoint.
- Add a per-IP rate limit on the public submission endpoint (3/hour), per the budget already named in `docs/ARCHITECTURE.md` §9.3.
- The public Contact page form now performs a real submission and shows genuine success/error feedback instead of the "sending isn't wired up yet" message.
- No reply capability from the admin panel — staff read a message and reply manually from their own email client, using the sender's email address.
- **BREAKING**: none (this only replaces an interim client-only behavior with a real one; no existing API contract changes shape).

## Capabilities

### New Capabilities
- `contact-messages`: Public contact-form submission intake, and the permission-gated admin inbox (list, read/unread state, unread count) that staff use to triage those submissions.

### Modified Capabilities
- `web-public-site`: The "Contact form validates client-side and does not fabricate submission success" requirement changes — the form now performs a real submission and reports genuine success or failure, since a backend endpoint now accepts contact submissions.

## Impact

- **apps/web**: `ContactForm.tsx` submit handler now calls the new endpoint via `apps/web/lib/api.ts`; removes the "not yet available" messaging.
- **apps/api**: new `modules/contact/` (routes, controller, service, repository, mapper) following the existing module layering; wires into `server.ts`.
- **apps/admin**: new inbox page and nav entry under the `Site` sidebar group; `Sidebar.tsx` gains a 30s poll for the unread count and a badge on the nav item / wordmark.
- **packages/db**: new `app.contact_messages` table + Drizzle schema; new Supabase migration.
- **packages/contracts**: `contact.manage` added to the permission enum; new request/response schemas for submission and admin listing.
- **Database**: one new migration, one new seeded `role_permissions` row wiring `contact.manage` (at minimum to the Owner role).
