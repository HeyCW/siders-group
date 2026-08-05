# CLAUDE.md

# Technology Stack

Frontend — React, TypeScript, Vite, Tailwind CSS, shadcn/ui
Backend — Node.js, Express, PostgreSQL

# Coding Standards

- TypeScript strict mode; never `any` unless unavoidable
- Composition over inheritance; small focused functions; no duplicated logic
- Self-documenting code

# API

- REST conventions; valnt JSON envelope
- Handle errors gracefu

# Database

- UUID PKs, migrations,transactions whereappropriate

# Frontend

- Reusable components; oks over classes;lazy-load large features

# Rich Text Editor

- Tiptap (per docs/ARCHITECTURE.md); distraction-free; semantic HTML;
future-extensible

# Testing

Before completion: build, lint, tests, no TS errors.

# Pull Requests

Reference the approved OpenSpec change, e.g.:
  Implements: openspec/

The "OpenSpec Workflow" section is gone from CLAUDE.md — openspec/AGENTS.md is already loaded by th will still see it.