llel for large changes — then merges into a single verdict (Approved / Approve with changes / Rejected with changes) and writes a local report. Local-only — never touches GitHub or commits. Trigger - /review-pr



---
name: review-pr
description: Review the current local code change end-to-end against this repo's own conventions and decision records. Fetches the working-tree/branch diff with git, runs a 5-aspect review (correctness, conventions, security, performance, hygiene) — in parallel for large changes — then merges into a single verdict (Approved / Approve with changes / Rejected with changes) and writes a local report. Local-only — never touches GitHub or commits. Trigger - /review-pr
trigger: /review-pr
---
 
# /review-pr
 
Review a **local** code change and produce a single merged report. You are the orchestrator AND
the final merger: 5 sub-agents gather findings in parallel; you de-duplicate, re-rank, compute the
verdict, and write one report.
 
This skill is **local-only**: it reads the git diff and writes a Markdown report. It never talks
to GitHub, pushes, comments, or commits. It is **self-contained** — do not invoke other review
skills. (For publishing a review to a GitHub PR, the user should use a PR-review skill if the repo
has one.)
 
**Rubrics precedence.** If the repo ships a review guide (see Step 1.5), that file is the single
source of truth for rubrics, severity scale, verdict rules, and report format — read it and use it
instead of the defaults in this skill. Otherwise use the Appendix at the bottom of this file.
 
## Inputs
 
Invoked as: `/review-pr [ref-or-range]`
 
- **No argument** → review the uncommitted change: staged + unstaged (`git diff HEAD`).
- **A branch name or range** (e.g. `main...`, `feat/x`) → review that range's diff.
- Clean tree and no range → fall back to `git diff <default-branch>...HEAD`; if that is empty too,
  tell the user there is nothing to review.
Resolve `<default-branch>` rather than assuming: `git symbolic-ref --quiet --short
refs/remotes/origin/HEAD` (strip the `origin/` prefix), falling back to the first of `main`,
`master`, `develop` that exists, then to the current upstream.
 
## Prerequisites
 
Run from inside the repo. `git` only — no `gh`, no network.
 
## Scratchpad
 
Temp artifacts go in the session scratchpad dir (named in the environment's "Scratchpad
Directory" reminder; if none is given, use `$TMPDIR`): `<SCRATCH>/change.diff`,
`<SCRATCH>/changed-files.txt`, `<SCRATCH>/review-out/`. Write `review-report.md` to the **current
working directory**. Never leave temp files in the repo.
 
## Step 1 — Resolve the change and gather context
 
1. Pick the diff source per the input rules. Record the range you settled on (e.g. `HEAD`
   (working tree), `main...HEAD`) for the report's "Reviewed at" table.
2. Diff → `<SCRATCH>/change.diff`: `git diff <range>` (or `git diff HEAD`).
3. Changed files → `<SCRATCH>/changed-files.txt`: `git diff --name-only <same range>`.
4. Size stats: `git diff --shortstat <same range>` → files changed, insertions, deletions.
5. **Discover the repo's own standards** — read whichever of these exist, skip the rest silently:
   - a review guide: `docs/reviewing.md`, `docs/code-review.md`, `CONTRIBUTING.md`
   - agent/convention docs: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `docs/conventions.md`
   - decision records: `docs/adr/`, `docs/decisions/`, `docs/wiki/`, indexed by
     `docs/manifest.json` or `docs/adr/README.md` / `INDEX.md` if present
   - config that encodes rules: linter/formatter/type-checker configs, `.editorconfig`
6. If a decision-record index exists, open **only** the records whose tags or titles match the
   touched areas (e.g. a change to money handling opens the precision/rounding record; a change
   crossing module boundaries opens the layering record). If there is no index, skim record titles.
7. Infer the stack from the changed files and the repo's manifest (`package.json`, `go.mod`,
   `*.csproj`, `Package.swift`, `pyproject.toml`, `composer.json`, …). Sub-agents are told the
   stack so their findings are idiomatic for it.
If Step 1.5 turns up nothing at all, say so in the report's Summary — the review then rests on
general engineering standards plus patterns inferred from surrounding code, and "conventions"
findings should cite `file:line` precedent instead of a rule name.
 
## Step 2 — Gather findings (inline for small changes, 5 parallel agents otherwise)
 
Size heuristic (from Step 1.4): **Small** = `files changed <= 5` AND `insertions + deletions <=
150` (a guideline — one 400-line file is not small; ten one-line doc tweaks is).
 
- **Small → review inline yourself** (no sub-agents). Cover all five aspects, writing results to
  `<SCRATCH>/review-out/<ASPECT>.json` (shape below) so Step 3 is unchanged.
- **Not small → dispatch the 5 parallel Agents in one message.** `subagent_type:
  "general-purpose"` (explore-only agents can't write JSON). Create `<SCRATCH>/review-out/` first.
Model per aspect: mid-tier → **correctness**, **conventions**, **security**, **performance**;
fast/cheap → **hygiene**.
 
Shared sub-agent contract (substitute `<ASPECT>`, `<STACK>`, and the discovered doc paths):
 
> You review **only** the **<ASPECT>** aspect of a code change in a <STACK> project.
>
> Inputs: diff `<SCRATCH>/change.diff`; changed files `<SCRATCH>/changed-files.txt`; rubric +
> severity scale in `<REVIEW-GUIDE-OR-SKILL-APPENDIX>` (read the **<ASPECT>** entry); conventions
> in `<CONVENTION-DOCS>`; decision records in `<ADR-DIR>` (index: `<ADR-INDEX>`). Any of these
> paths may be absent — if so, judge against general standards for <STACK> and against the
> patterns already present in the surrounding code.
>
> 1. Read the diff in full; open changed files on disk for context. Paths are repo-root-relative.
>    Do not review files outside the diff.
> 2. Find **<ASPECT>** issues using the rubric and severity scale you were pointed at.
> 3. Cite `file:line`, explain why, give a concrete fix, name the rule (decision record /
>    `<CONVENTION-DOC> §`) when one applies. Invent nothing — never cite a rule you have not read;
>    an empty list is valid. Stay strictly in your aspect.
> 4. Report `line` as the **new-file (RIGHT-side) line number**; for a deleted-only line set
>    `"side":"LEFT"` with the old line number, else omit `side`.
> 5. **Write** `<SCRATCH>/review-out/<ASPECT>.json`:
>    ```json
>    {"aspect":"<ASPECT>","findings":[
>      {"severity":"Critical|Major|Minor|Nit","file":"path","line":123,"side":"RIGHT",
>       "title":"short title","detail":"why","suggestion":"concrete fix","rule":"ADR-0004 | CONVENTIONS §4 | null"}]}
>    ```
> 6. Return a one-line severity-count summary.
 
## Step 3 — Merge + verdict
 
1. Read all five `<SCRATCH>/review-out/*.json`. Note any missing/unparseable aspect; if more than
   half failed, stop and ask the user to re-run.
2. **De-duplicate** — same line/issue across aspects: keep the clearest write-up, tag with every
   relevant aspect (e.g. `[correctness, conventions]`).
3. **Re-rank** holistically against the severity scale.
4. **Compute the verdict** with the verdict rules.
## Step 4 — Write the report
 
Build `review-report.md` in the CWD and print the Verdict + Summary + Findings table in chat, both
per the report format (Verdict, Reviewed at, Summary, Findings, Details, Rule check).
 
Then stop. `review-report.md` **is** the draft for the user to check — this skill only reports and
never commits, stages, pushes, or posts. Suggest a fix or open-PR skill as next steps if the repo
has them, and note the PR-review path if they want the review posted to GitHub.
 
---
 
## Appendix — defaults (used only when the repo has no review guide)
 
### Aspect rubrics
 
- **correctness** — logic errors, off-by-one, wrong operator/branch, null/optional and error
  handling, unhandled edge cases, race conditions and concurrency, resource leaks, API contract
  breaks, tests that don't test what they claim, missing test for changed behavior.
- **conventions** — deviation from the repo's documented rules and decision records, layering and
  module-boundary violations, naming, file placement, public API shape, duplicated logic that
  belongs in an existing helper, inconsistency with adjacent code.
- **security** — injection (SQL/command/template), authn/authz gaps, unsafe deserialization, path
  traversal, secrets or credentials in code, weak crypto, missing input validation, sensitive data
  in logs or errors, dependency risk, unsafe defaults.
- **performance** — N+1 queries, unnecessary allocation or copying in hot paths, blocking work on
  a latency-sensitive path, missing pagination or indexes, unbounded growth, avoidable repeated
  computation. Do not flag micro-optimizations without evidence they matter.
- **hygiene** — dead code, leftover debug output, commented-out blocks, stray `TODO`/`FIXME`
  without an owner, typos in identifiers and user-facing strings, formatting the formatter would
  fix, stale comments and docs.
### Severity scale
 
- **Critical** — data loss/corruption, security hole, or a break in production behavior. Must fix
  before merge.
- **Major** — a real bug, or a rule violation with material consequences. Should fix before merge.
- **Minor** — a genuine improvement with limited blast radius. Fix now or file a follow-up.
- **Nit** — style and taste. Optional; never blocks.
### Verdict rules
 
- **Rejected with changes** — any Critical, or 3+ Major.
- **Approve with changes** — 1–2 Major, or any Minor.
- **Approved** — Nits only, or nothing.
### Report format
 
```markdown
# Review report
 
**Verdict:** <Approved | Approve with changes | Rejected with changes>
 
## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `main...HEAD` | 12 | +340 / -87 | 2026-08-12 |
 
## Summary
2–4 sentences: what the change does, overall quality, what drove the verdict. Note here if no
repo standards docs were found.
 
## Findings
| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
 
## Details
Per finding: why it matters, a concrete fix (code where useful), and the rule it cites.
 
## Rule check
Each decision record / convention section relevant to the touched areas, and whether the change
complies. Omit this section if no such docs exist.
```