# CLAUDE.md

# Technology Stack

Frontend — React, TypeScript, Vite, Tailwind CSS, shadcn/ui
Backend — PHP, Laravel, MySQL (apps/api-laravel). apps/api (Node.js/Express) is a legacy parallel
implementation of the same API — do not add new features there; port them to apps/api-laravel
instead.

# Coding Standards

- PHP: `declare(strict_types=1)` everywhere; typed properties, params and returns
- TypeScript (frontend): strict mode; never `any` unless unavoidable
- Composition over inheritance; small focused functions; no duplicated logic
- Self-documenting code

# API

- REST conventions; consistent JSON envelope
- Controller → Service → Model; controllers parse/delegate/respond, services hold the logic
- Validation lives in Form Requests, never inline in controllers
- Handle errors gracefully via typed `DomainException` subclasses (`getStatus()`/`getErrorCode()`),
  rendered once in `bootstrap/app.php`'s `withExceptions`
- Every route declares its own authorization — `public`, `auth:staff`, `auth:reader`, or
  `permission:*`. Silence is a denial, not a grant; `RouteAuthorizationAuditTest` fails the build
  on an undeclared route.

# Database

- UUID PKs (`HasUuidPrimaryKey`), migrations, transactions where appropriate
- Eloquent models; scopes for shared read predicates (e.g. `scopePubliclyVisible`) — never
  re-derive one inline

# Frontend

- Reusable components; hooks over classes; lazy-load large features

# Rich Text Editor

- Tiptap (per docs/ARCHITECTURE.md); distraction-free; semantic HTML;
future-extensible

# Testing

- Backend (apps/api-laravel): `php -l`, `./vendor/bin/pint --test`, `php artisan test`
- Frontend/apps/api (Node): build, lint, tests, no TS errors
Before completion, run whichever of the above apply to the files touched.

# Pull Requests

Reference the approved OpenSpec change, e.g.:
  Implements: openspec/

The "OpenSpec Workflow" section is gone from CLAUDE.md — openspec/AGENTS.md is already loaded by th will still see it.