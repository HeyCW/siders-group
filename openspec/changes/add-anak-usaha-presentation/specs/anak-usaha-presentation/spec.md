## Purpose

Defines the admin-managed public presentation profile for anak usaha entries — logo, description,
kind, social links, ordering, and visibility — and the rules for how that profile is exposed on
the public site, independently of the underlying anak usaha taxonomy entry it presents.

## ADDED Requirements

### Requirement: Permission-gated profile endpoints
Every admin endpoint that creates, updates, deletes, or reorders an anak usaha profile SHALL
declare the `anak-usaha.manage` permission. Authorization SHALL be evaluated against the caller's
permissions and SHALL NOT branch on the name of any role. No new permission catalog entry SHALL be
introduced by this capability.

#### Scenario: Staff member without anak-usaha.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `anak-usaha.manage` attempts
  to create, update, delete, or reorder an anak usaha profile
- **THEN** the system rejects the request as forbidden and no profile is changed

#### Scenario: Staff member with anak-usaha.manage is allowed
- **WHEN** an authenticated staff member whose role includes `anak-usaha.manage` creates, updates,
  deletes, or reorders an anak usaha profile
- **THEN** the request is allowed

### Requirement: A profile presents exactly one anak usaha entry
Each anak usaha profile SHALL belong to exactly one anak usaha taxonomy entry, and each anak usaha
entry SHALL have at most one profile. A profile SHALL NOT be created for an anak usaha identifier
that does not exist.

#### Scenario: Creating a profile for an existing anak usaha entry
- **WHEN** a staff member holding `anak-usaha.manage` creates a profile for an anak usaha entry
  that has none yet
- **THEN** the system persists the profile and associates it with that entry

#### Scenario: An entry cannot have two profiles
- **WHEN** a staff member attempts to create a second profile for an anak usaha entry that already
  has one
- **THEN** the system rejects the request and the existing profile is unchanged

#### Scenario: Profile creation rejects an unknown anak usaha entry
- **WHEN** a staff member submits a profile referencing an anak usaha identifier that does not
  match any taxonomy entry
- **THEN** the system rejects the request and creates no profile

### Requirement: Profile fields
A profile SHALL have an optional logo, an optional description, a required kind chosen from a
fixed set of values (`Media Platform`, `News & Community`), zero or more links, an order position,
and an active flag defaulting to active.

#### Scenario: Profile without a logo is valid
- **WHEN** a staff member creates or updates a profile without a logo
- **THEN** the system accepts it and the entry has no logo until one is set

#### Scenario: Logo reference must be an existing media record
- **WHEN** a staff member submits a profile referencing a logo identifier that does not match any
  media record
- **THEN** the system rejects the request and does not create or update the profile

#### Scenario: Kind must be one of the fixed values
- **WHEN** a staff member submits a profile with a kind value other than `Media Platform` or
  `News & Community`
- **THEN** the system rejects the request and does not create or update the profile

#### Scenario: Description is optional
- **WHEN** a staff member creates or updates a profile without a description
- **THEN** the system accepts it and no description is shown for that entry on the public site

### Requirement: A profile link must be http or https
Each link on a profile carries a label and a URL. The URL SHALL use the `http` or `https` scheme;
any other scheme — including `javascript`, `data`, `vbscript`, `file`, and `mailto` — SHALL be
rejected. The rule SHALL be enforced by the shared request contract so the admin surface and the
API cannot diverge on it.

#### Scenario: A script-bearing link scheme is rejected
- **WHEN** a staff member submits a profile with a link whose URL uses the `javascript` or `data`
  scheme
- **THEN** the system rejects the request, saves no such link, and no such value is ever served to
  the public site

#### Scenario: An ordinary link is accepted
- **WHEN** a staff member submits a profile with a link whose URL uses `http` or `https`
- **THEN** the request is accepted

#### Scenario: A profile may have no links
- **WHEN** a staff member creates or updates a profile with an empty links list
- **THEN** the system accepts it and the entry shows no links on the public site

### Requirement: Deactivating a profile hides it from public output without deleting it
Only an active profile SHALL appear in public output. Setting a profile inactive SHALL take effect
on public output without any change to its stored order or its underlying anak usaha entry.

#### Scenario: Inactive profile is not public
- **WHEN** a profile's active flag is set to false
- **THEN** its entry stops appearing in every public rendering of the anak usaha section

#### Scenario: Reactivating restores position
- **WHEN** an inactive profile is set active again, and other active profiles precede and follow
  it in the stored order
- **THEN** it appears between exactly those profiles, in the order originally saved

### Requirement: Profile order is replaced as a whole list
The reorder endpoint SHALL accept a complete ordered collection of every existing profile
identifier and SHALL replace the entire order with it. Positions SHALL be derived from the
submitted order rather than supplied by the client. The replacement SHALL be atomic: either the
whole new order is stored or the previous order remains entirely intact.

#### Scenario: Replacement overwrites the previous order
- **WHEN** a staff member submits a new ordered collection of every existing profile identifier
- **THEN** the stored order afterwards matches exactly that submitted order

#### Scenario: Missing or unknown identifiers are rejected
- **WHEN** a staff member submits a reorder collection that omits an existing profile or names an
  identifier that does not match any profile
- **THEN** the system rejects the request and the stored order is unchanged

### Requirement: Deleting a profile removes only the public presentation
Deleting an anak usaha profile SHALL remove it from public output and from the stored order. It
SHALL NOT delete, rename, or otherwise alter the underlying anak usaha taxonomy entry, and SHALL
NOT change any article's association with that entry.

#### Scenario: Delete a profile in use
- **WHEN** a staff member deletes the profile for an anak usaha entry that is currently assigned
  to one or more published articles and shown on the public site
- **THEN** the profile and its public presentation are removed, the anak usaha taxonomy entry
  still exists with its name and slug, and every article referencing it remains associated with it

#### Scenario: The remaining order is preserved after a profile deletion
- **WHEN** one profile is deleted and others remain
- **THEN** the remaining profiles keep their relative order, with no entry referencing a
  non-existent profile

### Requirement: Deleting an anak usaha entry cascades to its profile
Deleting an anak usaha taxonomy entry SHALL also delete its profile, if it has one, since a
profile cannot outlive the entry it presents.

#### Scenario: Deleting a tagged, presented anak usaha entry
- **WHEN** a staff member deletes an anak usaha entry that has both a profile and one or more
  articles associated with it
- **THEN** the entry and its profile are both removed, its public presentation disappears, and
  every previously associated article remains published with that association cleared

### Requirement: Public anak usaha listing includes only presented, active entries
The system SHALL expose the anak usaha section's public data as part of the existing public
`GET /anak-usaha` listing: each anak usaha entry with an active profile appears with its name,
logo URL (if set), description (if set), kind, links, and stored order; an entry with no profile,
or with an inactive one, SHALL be omitted from this public rendering. The endpoint SHALL require
no authentication.

#### Scenario: Entry without a profile is omitted from public output
- **WHEN** an anak usaha entry has no profile
- **THEN** it does not appear in the public anak usaha section on the home page, footer, or
  Contact page

#### Scenario: Entry with an inactive profile is omitted from public output
- **WHEN** an anak usaha entry has a profile whose active flag is false
- **THEN** it does not appear in the public anak usaha section

#### Scenario: Public listing reflects stored order
- **WHEN** a client requests the public anak usaha listing
- **THEN** entries with an active profile are returned in their stored order, each with its name,
  logo URL (if set), description (if set), kind, and links
