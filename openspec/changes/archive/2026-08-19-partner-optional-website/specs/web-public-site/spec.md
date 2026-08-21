## ADDED Requirements

### Requirement: A partner with no website URL renders without a link
A partner tile in the partner section SHALL render as a link to that partner's website only when
the partner has a website URL. A partner with no website URL SHALL render its logo as a plain,
non-interactive element — not a link, not a link with an empty or placeholder `href`, and not a
click handler that navigates anywhere.

#### Scenario: A partner without a website URL is not a link
- **WHEN** the partner section renders a partner that has no website URL
- **THEN** that partner's tile contains no anchor element and clicking it causes no navigation

#### Scenario: A partner with a website URL is unaffected
- **WHEN** the partner section renders a partner that has a website URL
- **THEN** that partner's tile is a link to that URL, opening in a new tab, exactly as before this capability existed

## MODIFIED Requirements

### Requirement: Each partner is reachable exactly once by keyboard and screen reader
Regardless of how the ticker's continuous loop is visually achieved, assistive technology and
keyboard navigation SHALL encounter each active partner that has a website URL exactly once. A
partner with no website URL SHALL be announced or visible as content but SHALL NOT be a tab stop,
since it carries no link to land on.

#### Scenario: Tabbing through the ticker visits each linked partner once
- **WHEN** a reader tabs through the partner ticker
- **THEN** each active partner that has a website URL receives focus exactly once, regardless of how many times it appears visually, and a partner with no website URL receives no focus

#### Scenario: Screen reader announces each partner once
- **WHEN** a screen reader user navigates the partner section
- **THEN** each active partner is announced exactly once, as a link if it has a website URL and as non-interactive content if it does not
