## ADDED Requirements

### Requirement: The partner section renders real, admin-managed partners
The home page's partner section SHALL render the active partners returned by the partner-management
capability's public listing, in the order that listing returns, and SHALL NOT render any hardcoded
or placeholder partner content.

#### Scenario: Partners come from the backend
- **WHEN** the home page renders its partner section
- **THEN** every partner shown corresponds to an active partner record, and no placeholder name or tile appears

#### Scenario: No partners means no section
- **WHEN** the partner-management capability's public listing returns no active partners
- **THEN** the home page renders no partner heading, rule, or ticker for that section

### Requirement: The partner section is a single-row, auto-scrolling ticker
The partner section SHALL present partners in a single horizontal row that scrolls continuously
from right to left, so that partners not currently visible become visible as the row scrolls,
looping seamlessly regardless of how many partners exist.

#### Scenario: Partners exceeding one screen's width are all reachable
- **WHEN** more partners exist than fit in one row's visible width
- **THEN** every partner becomes visible at some point as the row scrolls, without requiring the reader to resize the window

#### Scenario: The loop has no visible gap or jump
- **WHEN** the ticker completes one full cycle
- **THEN** it continues scrolling with no visible gap, jump, or pause at the seam

#### Scenario: Few partners still scroll continuously
- **WHEN** the number of active partners is small enough that they would not otherwise fill one row's width
- **THEN** the row still scrolls continuously with no visible gap, rather than sitting static or showing a partial row

### Requirement: The ticker pauses while the reader is interacting with it
The partner ticker SHALL pause its scrolling while a pointer hovers over it and while keyboard
focus is within it, and SHALL resume when neither condition holds.

#### Scenario: Hovering pauses the scroll
- **WHEN** a pointer hovers over the partner ticker
- **THEN** the scrolling stops until the pointer leaves

#### Scenario: Keyboard focus pauses the scroll
- **WHEN** keyboard focus moves to a partner link inside the ticker
- **THEN** the scrolling stops until focus leaves the ticker

#### Scenario: A focused partner link does not scroll out of view
- **WHEN** a reader tabs to a partner link inside the ticker
- **THEN** that link remains in place rather than moving off-screen while it holds focus

### Requirement: Each partner is reachable exactly once by keyboard and screen reader
Regardless of how the ticker's continuous loop is visually achieved, assistive technology and
keyboard navigation SHALL encounter each active partner exactly once.

#### Scenario: Tabbing through the ticker visits each partner once
- **WHEN** a reader tabs through the partner ticker
- **THEN** each active partner's link receives focus exactly once, regardless of how many times it appears visually

#### Scenario: Screen reader announces each partner once
- **WHEN** a screen reader user navigates the partner section
- **THEN** each active partner is announced exactly once

### Requirement: Reduced motion shows all partners without scrolling
When the reader's system preference indicates reduced motion, the partner section SHALL render all
active partners in a static, non-scrolling layout rather than an auto-scrolling ticker, and every
partner SHALL be reachable without relying on motion.

#### Scenario: Reduced motion disables the scroll
- **WHEN** a reader's system preference requests reduced motion
- **THEN** the partner section does not auto-scroll, and all active partners are visible or reachable through ordinary scrolling of the page

#### Scenario: No partner becomes unreachable under reduced motion
- **WHEN** reduced motion is active and more partners exist than fit in one row
- **THEN** every active partner remains reachable, none hidden behind a paused animation

### Requirement: A partner logo renders undistorted in its own colors
Each partner's logo SHALL render at a consistent row height without stretching, cropping, or
distorting its aspect ratio, and SHALL retain its own colors rather than being recolored to the
site's monochrome palette.

#### Scenario: Logos of different aspect ratios sit evenly in the row
- **WHEN** partner logos of differing width-to-height ratios are rendered in the ticker
- **THEN** each renders at the same row height with its aspect ratio preserved and no cropping

#### Scenario: Logo colors are preserved
- **WHEN** a partner logo containing color is rendered
- **THEN** it displays in its original colors, with no grayscale or monochrome filter applied
