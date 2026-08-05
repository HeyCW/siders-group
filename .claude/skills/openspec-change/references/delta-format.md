# Spec Delta Format Reference

Read this before writing your first delta, and again whenever `openspec validate --strict` rejects a change.

## Contents

- [Where deltas live](#where-deltas-live)
- [The four operations](#the-four-operations)
- [Anatomy of a requirement](#anatomy-of-a-requirement)
- [Writing scenarios](#writing-scenarios)
- [Normative keywords](#normative-keywords)
- [Choosing a capability](#choosing-a-capability)
- [Validation errors and their causes](#validation-errors-and-their-causes)
- [Worked example](#worked-example)

## Where deltas live

```
openspec/
├── specs/
│   └── auth/
│       └── spec.md          # current truth — what IS built
└── changes/
    └── add-two-factor-auth/
        └── specs/
            └── auth/
                └── spec.md  # the delta — what SHOULD change
```

The delta path mirrors the spec path. A delta for the `auth` capability goes at `changes/{change-id}/specs/auth/spec.md`, and it contains **only the changing requirements** — never a copy of the whole spec.

When the change is archived, OpenSpec applies the delta to the real spec. This is why MODIFIED needs complete replacement text: the archive step swaps the old requirement for the new one wholesale, so a partial delta silently deletes whatever you left out.

## The four operations

Each is an h2 group header. A single delta file may contain several.

### `## ADDED Requirements`

New requirements that don't exist in the current spec.

```markdown
## ADDED Requirements

### Requirement: Rate Limiting

The system SHALL limit authentication attempts to 5 per minute per IP address.

#### Scenario: Under the limit

- **WHEN** a client makes a 5th attempt within one minute
- **THEN** the system processes the attempt normally

#### Scenario: Over the limit

- **WHEN** a client makes a 6th attempt within one minute
- **THEN** the system rejects it with HTTP 429 and does not evaluate credentials
```

### `## MODIFIED Requirements`

Changes to an existing requirement. **Include the entire requirement as it should read after the change** — the header, the full requirement text, and every scenario, including ones that aren't changing.

```markdown
## MODIFIED Requirements

### Requirement: Session Expiry

The system SHALL expire idle sessions after 30 minutes.
Sessions with 2FA-verified tokens SHALL expire after 12 hours.

#### Scenario: Idle password-only session

- **WHEN** a password-only session sees no activity for 30 minutes
- **THEN** the system invalidates the session token

#### Scenario: Idle 2FA session

- **WHEN** a 2FA-verified session sees no activity for 30 minutes
- **THEN** the system keeps the session valid until 12 hours have elapsed
```

The `### Requirement:` name must match the existing spec exactly, or the operation won't resolve to anything. Read the current spec (`openspec show auth`) and copy the header verbatim.

### `## REMOVED Requirements`

Requirements being deleted. Header plus a reason; scenarios aren't needed since nothing is being specified.

```markdown
## REMOVED Requirements

### Requirement: SOAP Authentication Endpoint

**Reason**: No remaining callers as of the 2024-Q4 client migration. Superseded by the REST endpoint in the `auth` spec.
```

Always give a reason. A future reader finding a removed requirement in the archive needs to know whether it was obsolete or a mistake.

### `## RENAMED Requirements`

Name changes without behavior changes.

```markdown
## RENAMED Requirements

### Requirement: Multi-Factor Authentication

**Previously**: Two-Factor Authentication
```

If behavior changes too, use MODIFIED instead — a rename that quietly alters behavior is invisible in review.

## Anatomy of a requirement

Header levels are parsed structurally. Getting a `#` count wrong means the parser doesn't see the block at all, and validation reports missing requirements even though the text is right there.

```
## ADDED Requirements          ← h2, operation group
### Requirement: Name          ← h3, must start with "Requirement: "
Requirement prose here.        ← normative statement(s)
#### Scenario: Name            ← h4, must start with "Scenario: "
- **WHEN** ...                 ← scenario body
- **THEN** ...
```

Rules:

- The operation group header appears once per operation per file, with all its requirements nested beneath.
- `### Requirement: ` and `#### Scenario: ` prefixes are literal. `### Req: Name` or `### Requirement — Name` won't parse.
- Every requirement needs **at least one** scenario (except under REMOVED and RENAMED).
- Requirement prose comes before the first scenario.

## Writing scenarios

A scenario is a testable behavioral claim. The useful discipline: if you can't write a scenario for a requirement, you haven't specified it precisely enough to implement or test it — the vagueness is in the requirement, not the format.

Standard shape:

```markdown
#### Scenario: Descriptive name

- **WHEN** [the triggering condition]
- **THEN** [the observable outcome]
```

With setup or multiple outcomes:

```markdown
#### Scenario: Enrollment with existing secret

- **GIVEN** an account that already has `totp_enabled` set
- **WHEN** the account requests enrollment again
- **THEN** the system rejects the request with a 409
- **AND** the existing secret remains unchanged
```

What separates a good scenario from a useless one:

| Weak | Strong |
|---|---|
| **THEN** it works correctly | **THEN** the system issues a session token valid for 12 hours |
| **WHEN** the input is bad | **WHEN** the submitted code is not 6 numeric digits |
| **THEN** an error occurs | **THEN** the system returns HTTP 422 and does not create a session |

Cover the failure paths, not just the happy one. Expired input, missing input, malformed input, concurrent access, and the boundary values are where implementations diverge from intent. A requirement with one happy-path scenario is barely specified.

## Normative keywords

| Keyword | Meaning | Use for |
|---|---|---|
| `SHALL` | Mandatory | Almost all requirements |
| `SHALL NOT` | Prohibited | Explicit prohibitions |
| `SHOULD` | Recommended, deviation allowed with reason | Genuine recommendations |
| `MAY` | Optional | Truly optional behavior |

Default to `SHALL`. `SHOULD` in a requirement raises the question of when deviation is acceptable — if you can't answer that, you meant `SHALL`. Avoid "will", "must" (ambiguous between mandatory and incidental), and bare present tense in normative statements.

## Choosing a capability

Capabilities are behavioral domains, not code modules. `auth`, `billing`, `notifications`, `order-fulfillment` — not `utils`, `helpers`, or `components`.

- **Existing capability fits** → put the delta there. Check `openspec list --specs`.
- **Genuinely new domain** → create it with `## ADDED Requirements` at `changes/{id}/specs/{new-capability}/spec.md`.
- **Change spans several capabilities** → one delta file per capability under the same change. This is normal for anything non-trivial.

Resist creating a new capability per change. Ten capabilities each holding one requirement is worse than three well-populated ones, because nobody can find anything.

## Validation errors and their causes

| Error | Cause | Fix |
|---|---|---|
| No requirements / deltas found | Missing `## ADDED Requirements` group header, or wrong `#` level on it | Group header must be exactly h2 |
| Requirement has no scenarios | Missing `#### Scenario:`, or written at h3/h5 | Add a scenario at exactly h4 |
| Requirement not recognized | `### Requirement: ` prefix missing or misspelled | Use the literal prefix |
| MODIFIED target not found | Requirement name doesn't match the current spec | Copy the header verbatim from `openspec show <spec>` |
| Delta file not picked up | Wrong path or capability directory name | Path is `changes/{id}/specs/{capability}/spec.md` |
| Passes plain validate, fails `--strict` | Strict adds the completeness checks | Fix rather than dropping `--strict` |

If a message doesn't map to anything here, run `openspec show {change-id}` — seeing what the parser actually extracted usually makes the structural problem obvious.

## Worked example

Change: add TOTP 2FA, extend session lifetime for verified sessions, drop the SMS fallback.

`openspec/changes/add-totp-2fa/specs/auth/spec.md`

```markdown
## ADDED Requirements

### Requirement: TOTP Enrollment

The system SHALL allow an authenticated user to enroll a TOTP authenticator.
The system SHALL store the shared secret encrypted at rest.

#### Scenario: First enrollment

- **GIVEN** an authenticated account with `totp_enabled` unset
- **WHEN** the account requests enrollment
- **THEN** the system generates a secret, stores it encrypted, and returns a provisioning URI
- **AND** `totp_enabled` remains unset until the first code is confirmed

#### Scenario: Confirming enrollment

- **GIVEN** an account with a stored but unconfirmed secret
- **WHEN** the account submits a valid code for that secret
- **THEN** the system sets `totp_enabled`

#### Scenario: Duplicate enrollment

- **GIVEN** an account with `totp_enabled` set
- **WHEN** the account requests enrollment
- **THEN** the system returns HTTP 409 and leaves the existing secret unchanged

### Requirement: TOTP Verification

The system SHALL require a valid TOTP code before issuing a session token
for accounts with `totp_enabled` set.

#### Scenario: Valid code

- **WHEN** a valid code within its time window is submitted
- **THEN** the system issues a session token

#### Scenario: Expired code

- **WHEN** a code outside its time window is submitted
- **THEN** the system rejects the attempt and issues no token

#### Scenario: Replayed code

- **WHEN** a code that already succeeded is submitted again
- **THEN** the system rejects the attempt and issues no token

## MODIFIED Requirements

### Requirement: Session Expiry

The system SHALL expire idle password-only sessions after 30 minutes.
The system SHALL expire idle 2FA-verified sessions after 12 hours.

#### Scenario: Idle password-only session

- **WHEN** a password-only session is idle for 30 minutes
- **THEN** the system invalidates the token

#### Scenario: Idle 2FA-verified session

- **WHEN** a 2FA-verified session is idle for 30 minutes
- **THEN** the system keeps the token valid until 12 hours have elapsed

## REMOVED Requirements

### Requirement: SMS Fallback Authentication

**Reason**: SIM-swap exposure, and TOTP now covers the second-factor case.
No callers remain after the 2024-Q4 client migration.
```

Note what this example does: replay and expiry get their own scenarios rather than being folded into "invalid code", the MODIFIED requirement carries both scenarios even though only one changed, and the removal states why. Those three habits prevent most downstream ambiguity.