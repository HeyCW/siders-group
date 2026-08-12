---
name: fix-issue
description: Fix a bug with a minimal, convention-following change on a fix branch. Consumes a GitHub issue filed with the repo's form (reproduction + acceptance criteria) or a free-text description. Shows the diff for approval before committing. Use when the user reports a bug or asks to fix an issue. Trigger - /fix-issue
trigger: /fix-issue
---

# /fix-issue

Fix a bug (or small change) end-to-end on a `fix/<slug>` branch, driven by an issue's reproduction
and acceptance criteria.

## Inputs

Invoked as: `/fix-issue [issue-number | description]`

- **Issue number/URL** → `gh issue view <n> --json title,body,labels` (requires a remote). Parse
  the form fields: Type/scope (from the title), Steps to reproduce, Expected/Actual, Acceptance
  criteria, Related ADRs/specs. These drive the whole flow.
- **Free-text description** → treat it as the issue; derive the same fields as best you can.

## Steps

1. Restate the issue in one or two sentences to confirm understanding. Note the acceptance criteria
   you will fix against.
2. Create a branch `fix/<slug>` from `main`.
3. **Reproduce first** using the issue's Steps to reproduce (or your own repro for free-text).
   Confirm you see the reported Actual behavior before changing anything.
4. Apply the **minimal** fix, following `AGENTS.md` conventions (Five Lines, no comments, no floats
   for money / ADR 0004, layer boundaries / ADR 0003) and respecting the issue's Related ADRs.
5. **Verify against the acceptance criteria** — the fix must satisfy each one and break nothing else.
6. **Draft gate:** show the diff (`git diff`) and a one-line summary, and wait for the user's
   approval before committing. Apply requested edits first.
7. On approval, commit with an imperative subject (e.g. `fix(<scope>): <desc>`). Never add AI
   co-author or "Generated with Claude Code" trailers.
8. If a git remote exists, suggest `/open-pr` — and note the PR should carry `Closes #<n>` when
   fixing a numbered issue.
