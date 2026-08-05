# CLAUDE.md

# Technology Stack

Frontend — React, TypeScript, Vite, Tailwind CSS, shadcn/ui
Backend — Node.js, Express, PostgreSQL

# Coding Standards

- TypeScript strict mode; never `any` unless unavoidable
- Composition over inheritance; small focused functions; no duplicated logic
- Self-documenting code

# API

- REST conventions; consistent JSON envelope
- Handle errors gracefully via typed `AppError` subclasses, formatted once in `errorHandler`

# Database

- UUID PKs, migrations, transactions where appropriate

# Frontend

- Reusable components; hooks over classes; lazy-load large features

# Rich Text Editor

- Tiptap (per docs/ARCHITECTURE.md); distraction-free; semantic HTML;
future-extensible

# Testing

Before completion: build, lint, tests, no TS errors.

# Pull Requests

Reference the approved OpenSpec change, e.g.:
  Implements: openspec/

The "OpenSpec Workflow" section is gone from CLAUDE.md — openspec/AGENTS.md is already loaded by th will still see it.