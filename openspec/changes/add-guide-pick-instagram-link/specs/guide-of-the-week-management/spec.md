## ADDED Requirements

### Requirement: A guide pick may carry an optional Instagram link

A guide pick MAY reference an Instagram URL. The field is optional on create, may be set, changed,
or cleared on update, and is validated the same way a partner's website URL is: it SHALL be an
absolute URL whose scheme is `http` or `https`, rejecting `javascript:`, `data:`, and any other
scheme.

#### Scenario: A guide pick may be created with an Instagram URL

- **WHEN** a staff member holding `news.manage` creates a guide pick with a valid `http`/`https`
  Instagram URL
- **THEN** the system persists the guide pick with that URL

#### Scenario: A guide pick may be created or left without an Instagram URL

- **WHEN** a staff member creates or updates a guide pick without submitting an Instagram URL
- **THEN** the system persists the guide pick with no Instagram URL, and no existing behavior of
  the guide pick changes

#### Scenario: An Instagram URL can be cleared

- **WHEN** a staff member updates a guide pick that has an Instagram URL, explicitly clearing it
- **THEN** the system persists the guide pick with no Instagram URL

#### Scenario: A non-http(s) Instagram URL is rejected

- **WHEN** a staff member submits an Instagram URL whose scheme is not `http` or `https`
- **THEN** the system rejects the request and the guide pick's stored Instagram URL, if any, is
  unchanged

### Requirement: A guide pick's Instagram link takes over its public card

When a guide pick has an Instagram URL, its public-facing card SHALL be a link to that URL, opening
in a new tab, wrapping the whole card. The card's video SHALL continue to autoplay as a muted,
looping preview exactly as it does on any other card, but SHALL carry no native playback controls,
so that activating the card can only navigate to the Instagram URL — never toggle playback or open
the browser's own video UI. A guide pick with no Instagram URL SHALL render exactly as it does
without this capability: an inline video with native controls, not a link.

#### Scenario: A guide pick with an Instagram URL links out instead of offering playback controls

- **WHEN** a reader activates a guide-pick card whose guide pick has an Instagram URL
- **THEN** the reader is taken to that Instagram URL in a new tab; the card's video keeps autoplaying
  as a muted preview but exposes no controls of its own for that click to have landed on

#### Scenario: A guide pick without an Instagram URL is unaffected

- **WHEN** a reader activates a guide-pick card whose guide pick has no Instagram URL
- **THEN** the card's video plays inline with native controls exactly as it did before this
  capability existed

## MODIFIED Requirements

### Requirement: Public read serves only active guide picks in order

The system SHALL expose a public endpoint that returns active guide picks in their stored order,
each with its city, place, description, photo URL (when the pick has one), video URL, and
Instagram URL (when the pick has one). The endpoint SHALL require no authentication and SHALL NOT
include inactive guide picks or any admin-only field.

The endpoint SHALL return a single flat ordered collection. It SHALL NOT group entries by city:
the city travels with each entry, and grouping is a presentation concern of the consuming page, so
that the stored order remains the single source of truth for ordering.

#### Scenario: Public listing excludes inactive picks

- **WHEN** a client requests the public guide-pick listing
- **THEN** the response contains only active guide picks, in their stored order

#### Scenario: Public shape omits admin-only fields

- **WHEN** a client reads the public guide-pick listing
- **THEN** each entry contains city, place, description, video URL, a photo URL only when the pick
  has one, and an Instagram URL only when the pick has one — no active flag, no sort-order value,
  no internal id

#### Scenario: Entries are flat, not grouped

- **WHEN** a client reads the public guide-pick listing and the active picks span several cities
- **THEN** the response is one ordered collection carrying each entry's city, rather than a
  structure keyed or nested by city
