# Working without the `openspec` CLI

Every skill in this family is written against the `openspec` binary. That binary is not
always present — CI images, fresh containers, and Claude Code's remote execution
environment frequently have no global npm packages at all. This document is the fallback
those skills fall back *to*, so a missing binary degrades the workflow instead of ending it.

`openspec/` is plain files. Everything the CLI reports can be derived by reading them.

## The probe, and the distinction that matters

Run this once, before the first CLI call in the workflow:

```bash
command -v openspec >/dev/null 2>&1 && echo cli-present || echo cli-absent
```

Then hold this distinction for the rest of the run, because the two cases warrant
opposite behaviour:

- **CLI absent** — use the fallbacks below. Say so once, plainly ("`openspec` CLI not
  installed; deriving state from `openspec/` directly"), then carry on. Do **not** treat
  this as an error and do **not** stop.
- **CLI present but a command failed** — that is a real error. Honour whatever stop rule
  the calling skill states for that command. A binary that exists and then fails is
  reporting something; do not paper over it with a fallback.

Never `npx openspec` as a substitute. The `openspec` name on the public npm registry is an
unrelated stub package at version 0.0.0 — running it fetches the wrong thing and produces
either an error or, worse, silence.

## Layout the fallbacks read

```
openspec/
├─ config.yaml                       schema name + optional project context/rules
├─ specs/<capability>/spec.md         main specs — the durable record
└─ changes/
   ├─ <change-name>/
   │  ├─ .openspec.yaml               schema + created date for this change
   │  ├─ proposal.md  design.md  tasks.md
   │  └─ specs/<capability>/spec.md   delta specs
   └─ archive/YYYY-MM-DD-<change-name>/
```

## Command-by-command fallbacks

### `openspec list --json`

Active changes are the directories in `openspec/changes/` other than `archive/`:

```bash
find openspec/changes -maxdepth 1 -mindepth 1 -type d ! -name archive -printf '%f\n'
```

Each change's schema comes from its own `.openspec.yaml`, falling back to `openspec/config.yaml`.

### `openspec status --change <name> --json`

Derive each field the calling skill consumes:

| JSON field | Derivation |
|---|---|
| `schemaName` | `schema:` in `openspec/changes/<name>/.openspec.yaml`, else `openspec/config.yaml` |
| `planningHome.root` | the directory containing `openspec/` |
| `planningHome.changesDir` | `openspec/changes` |
| `changeRoot` | `openspec/changes/<name>` |
| `artifactPaths.specs.existingOutputPaths` | `find openspec/changes/<name>/specs -name spec.md` |
| `artifacts[].status` | `done` when the artifact file exists and has substantive content; treat a missing `specs/` directory as `skipped` only when the change declares skip_specs, otherwise as incomplete |

Artifact completeness is a judgement call the CLI would have made for you. Read each file
and decide honestly — a `tasks.md` that is a bare heading is not `done`.

### `openspec instructions <artifact> --change <name> --json`

No filesystem equivalent exists. Treat it as **a valid response with every optional field
omitted**: no `context`, no `rules`, no `operationGuidance`. Each calling skill already
specifies that omitted fields are the no-rules case, so this is a defined state rather
than a degraded one.

Project-level context and per-artifact rules that *would* have been returned are readable
directly from `openspec/config.yaml` (`context:`, `rules:`, `operations:`). Read them and
apply them; they are the same inputs by another route.

This matters most in `openspec-archive-change` step 4, which says to stop if the `specs`
instruction lookup fails. **That stop rule applies to the CLI-present case only.** With no
CLI there is nothing to fail — proceed with no rules, and say in the summary that no
artifact rules were available.

### `openspec validate --strict`

No equivalent. Validate structurally by hand and report it as a hand check, never as a
passing `--strict` run:

- delta specs use `## ADDED|MODIFIED|REMOVED|RENAMED Requirements` section headers
- every `### Requirement:` has at least one `#### Scenario:` beneath it
- scenario bodies use the `- **WHEN** …` / `- **THEN** …` form
- `MODIFIED` and `REMOVED` name requirements that exist in the corresponding main spec
- `RENAMED` names a requirement absent under its new name and present under its old one

### `openspec show <name>` / `openspec diff`

Read the files. For a diff against a main spec, compare
`openspec/changes/<name>/specs/<capability>/spec.md` with
`openspec/specs/<capability>/spec.md` directly.

### `openspec archive <name>`

```bash
mkdir -p openspec/changes/archive
# target name: the change name as-is when it already starts with YYYY-MM-DD-,
# otherwise today's date prepended. Never stack a second date.
test -e "openspec/changes/archive/<target>" && echo CONFLICT
mv "openspec/changes/<name>" "openspec/changes/archive/<target>"
```

Stage with `git add -A openspec/` so the move is recorded as a rename rather than a
delete plus an add.

## Verifying a hand-run sync

The CLI's sync verification is replaceable by a mechanical diff, and should be run —
a hand merge is exactly where a dropped requirement hides:

```bash
diff <(grep '^### Requirement:' "$DELTA") <(grep '^### Requirement:' "$MAIN")
diff <(grep '^#### Scenario:'  "$DELTA") <(grep '^#### Scenario:'  "$MAIN")
```

For a new capability with no existing main spec, the delta is copied verbatim and only
the header changes — `## ADDED Requirements` becomes `## Requirements`, under a
`# <capability> Specification` title. Body text should then diff clean against the delta.

For a merge into an existing main spec, confirm each operation landed: ADDED present,
MODIFIED carrying the new scenarios with its untouched ones intact, REMOVED gone, RENAMED
present under the new name and absent under the old.

## Reporting

Say which path was taken. A summary that claims a clean `openspec validate --strict` when
no CLI was installed is a false report — write "structure hand-checked (CLI unavailable)"
instead, and note anything the CLI would have caught that a hand check cannot.
