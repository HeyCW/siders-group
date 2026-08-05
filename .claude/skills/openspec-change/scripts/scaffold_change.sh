#!/usr/bin/env bash
#
# Scaffold an OpenSpec change directory with stub files.
#
# Usage:
#   ./scaffold_change.sh <change-id> [capability ...]
#
# Examples:
#   ./scaffold_change.sh add-two-factor-auth auth
#   ./scaffold_change.sh update-invoice-rounding billing invoicing
#   ./scaffold_change.sh refactor-order-pipeline          # no delta dir yet
#
# Creates:
#   openspec/changes/<change-id>/proposal.md
#   openspec/changes/<change-id>/tasks.md
#   openspec/changes/<change-id>/specs/<capability>/spec.md   (per capability)
#
# Refuses to overwrite an existing change directory.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <change-id> [capability ...]" >&2
  exit 1
fi

CHANGE_ID="$1"
shift
CAPABILITIES=("$@")

# Locate the openspec root by walking up from the current directory.
find_openspec_root() {
  local dir
  dir="$(pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/openspec" ]]; then
      echo "$dir/openspec"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

if ! OPENSPEC_ROOT="$(find_openspec_root)"; then
  echo "Error: no openspec/ directory found in this directory or any parent." >&2
  echo "Run 'openspec init' first, or cd into the project root." >&2
  exit 1
fi

# Validate the change id: kebab-case, verb-led by convention.
if [[ ! "$CHANGE_ID" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Error: change id must be kebab-case (lowercase, hyphen-separated)." >&2
  echo "  got:      $CHANGE_ID" >&2
  echo "  expected: add-two-factor-auth" >&2
  exit 1
fi

case "$CHANGE_ID" in
  add-*|update-*|remove-*|refactor-*|fix-*|migrate-*) ;;
  *) echo "Note: change ids are conventionally verb-led (add-, update-, remove-, refactor-, fix-, migrate-)." >&2 ;;
esac

CHANGE_DIR="$OPENSPEC_ROOT/changes/$CHANGE_ID"

if [[ -e "$CHANGE_DIR" ]]; then
  echo "Error: $CHANGE_DIR already exists. Edit it, or pick a different change id." >&2
  exit 1
fi

mkdir -p "$CHANGE_DIR"

cat > "$CHANGE_DIR/proposal.md" <<'EOF'
## Why

<!-- 1-3 sentences: the problem or driver. Not the solution. -->

## What Changes

<!-- One bullet per user-visible change. Prefix breaking changes with **BREAKING**. -->
-

## Impact

- **Affected specs**:
- **Affected code**:
- **Migration**: none
EOF

cat > "$CHANGE_DIR/tasks.md" <<'EOF'
## 1. <Section>

- [ ] 1.1
- [ ] 1.2

## 2. Verification

- [ ] 2.1 Tests covering each scenario in the spec delta
- [ ] 2.2 Manual verification
EOF

for cap in "${CAPABILITIES[@]}"; do
  if [[ ! "$cap" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "Error: capability '$cap' must be kebab-case." >&2
    exit 1
  fi
  mkdir -p "$CHANGE_DIR/specs/$cap"
  cat > "$CHANGE_DIR/specs/$cap/spec.md" <<'EOF'
## ADDED Requirements

### Requirement: <Name>

The system SHALL <normative statement>.

#### Scenario: <Happy path>

- **WHEN** <triggering condition>
- **THEN** <observable outcome>

#### Scenario: <Failure path>

- **WHEN** <failure condition>
- **THEN** <observable outcome>
EOF
done

echo "Created $CHANGE_DIR"
echo
find "$CHANGE_DIR" -type f | sort | sed "s|^$OPENSPEC_ROOT/|  openspec/|"
echo
echo "Next:"
echo "  1. Fill in proposal.md (Why / What Changes / Impact)"
if [[ ${#CAPABILITIES[@]} -eq 0 ]]; then
  echo "  2. Add spec deltas at $CHANGE_DIR/specs/<capability>/spec.md"
else
  echo "  2. Replace the stub requirements in the spec delta(s)"
fi
echo "  3. Fill in tasks.md, ordered by dependency"
echo "  4. openspec validate $CHANGE_ID --strict"