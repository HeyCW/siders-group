## Purpose

Defines the partner directory: the admin-managed catalog of partner organizations — each with a
required logo, name, and website — that the public home page's partner ticker is drawn from, its
permission-gated admin surface, its explicit ordering, and the public read that serves only active
partners.

## ADDED Requirements

### Requirement: Permission-gated partner endpoints
Every admin endpoint that creates, updates, deletes, or reorders a partner SHALL declare the
`settings.manage` permission. Authorization SHALL be evaluated against the caller's permissions and
SHALL NOT branch on the name of any role. No new permission catalog entry SHALL be introduced by
this capability.

#### Scenario: Staff member without settings.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `settings.manage` attempts to create, update, delete, or reorder a partner
- **THEN** the system rejects the request as forbidden and the partner directory is unchanged

#### Scenario: Staff member with settings.manage is allowed
- **WHEN** an authenticated staff member whose role includes `settings.manage` creates, updates, deletes, or reorders a partner
- **THEN** the request is allowed

#### Scenario: Anonymous caller cannot reach the admin surface
- **WHEN** a client with no session requests any admin partner endpoint
- **THEN** the system rejects the request as unauthenticated

#### Scenario: No new permission is required to manage partners
- **WHEN** the permission catalog is inspected after this capability is deployed
- **THEN** it contains no partner-specific entry, and the ability to manage partners is carried entirely by `settings.manage`

### Requirement: Partner CRUD
The system SHALL expose admin endpoints to create, list, update, and delete partners. Each partner
SHALL have a name, a logo, a website URL, and an active flag defaulting to active.

#### Scenario: Create a partner
- **WHEN** a staff member holding `settings.manage` submits a valid name, logo, and website URL
- **THEN** the system persists the partner and returns its representation including its id

#### Scenario: Website URL must be a valid absolute URL
- **WHEN** a staff member submits a partner with a website URL that is not a valid absolute URL
- **THEN** the system rejects the request and does not create or update the partner

#### Scenario: Admin list includes inactive partners
- **WHEN** a staff member holding `settings.manage` lists partners
- **THEN** the response includes both active and inactive partners

### Requirement: A partner requires a logo
A partner SHALL reference a logo image stored by this system as a media record. A partner SHALL
NOT be created or left without one. The logo SHALL be an ordinary image subject to the existing
media rules.

#### Scenario: Logo is required at creation
- **WHEN** a staff member attempts to create a partner without a logo
- **THEN** the system rejects the request and creates no partner

#### Scenario: Logo reference must be an existing media record
- **WHEN** a staff member submits a partner referencing a logo identifier that does not match any media record
- **THEN** the system rejects the request and creates no partner

#### Scenario: Logo is a normal media record
- **WHEN** a logo image is uploaded for a partner
- **THEN** it is accepted, validated, stored, and its URL derived by the existing media rules, with no partner-specific storage path

### Requirement: Deactivating a partner hides it from public output without deleting it
A partner SHALL carry an active flag. Only an active partner SHALL appear in public output. Setting
a partner inactive SHALL take effect on public output without any change to its stored order.

#### Scenario: Inactive partner is not public
- **WHEN** a partner's active flag is set to false
- **THEN** it stops appearing in public output

#### Scenario: Reactivating restores position
- **WHEN** an inactive partner is set active again, and other active partners precede and follow it in the stored order
- **THEN** it appears between exactly those partners, in the order originally saved

### Requirement: A single ordered partner list
The system SHALL maintain exactly one ordering, applying to the public home page partner ticker
only. The order SHALL be preserved across reads.

#### Scenario: Order is preserved
- **WHEN** partners are reordered and later read back
- **THEN** they are returned in exactly the saved order

#### Scenario: Order survives unrelated partner edits
- **WHEN** a partner's name, logo, website URL, or active flag is edited
- **THEN** its position in the order is unchanged

### Requirement: Partner order is replaced as a whole list
The reorder endpoint SHALL accept a complete ordered collection of every existing partner
identifier and SHALL replace the entire order with it. Positions SHALL be derived from the
submitted order rather than supplied by the client. The replacement SHALL be atomic: either the
whole new order is stored or the previous order remains entirely intact.

#### Scenario: Replacement overwrites the previous order
- **WHEN** a staff member submits a new ordered collection of every existing partner identifier
- **THEN** the stored order afterwards matches exactly that submitted order

#### Scenario: Missing or unknown identifiers are rejected
- **WHEN** a staff member submits a reorder collection that omits an existing partner or names an identifier that does not match any partner
- **THEN** the system rejects the request and the stored order is unchanged

#### Scenario: A rejected reorder leaves the order untouched
- **WHEN** a submitted reorder collection fails validation
- **THEN** the previously stored order remains exactly as it was

### Requirement: The partner lifecycle self-heals the order
Deleting a partner SHALL remove its entry from the stored order automatically, with no separate
reorder write required, and the remaining partners SHALL keep their relative order.

#### Scenario: Deleting a partner removes its order entry
- **WHEN** a partner is deleted
- **THEN** its entry is removed from the stored order automatically, and no entry referencing a non-existent partner remains

#### Scenario: Remaining order is preserved after a deletion
- **WHEN** one partner is deleted and others remain
- **THEN** the remaining partners keep their relative order

### Requirement: Public partner listing serves only active partners in order
The system SHALL expose a public endpoint that returns every active partner in stored order,
including each partner's name, logo URL, and website URL. The endpoint SHALL require no
authentication and SHALL NOT include inactive partners.

#### Scenario: Public listing returns active partners in order
- **WHEN** a client requests the public partner listing
- **THEN** the response contains every active partner, in the stored order, each with its name, logo URL, and website URL

#### Scenario: Inactive partners are absent from public output
- **WHEN** one or more partners are inactive
- **THEN** the public partner listing does not include them

#### Scenario: Empty directory yields an empty listing
- **WHEN** no partners are active
- **THEN** the public partner listing returns an empty collection rather than an error

### Requirement: Partner writes revalidate the home page
The system SHALL trigger revalidation of the home page path whenever a partner is created, updated,
deleted, or reordered, or whenever a partner's active flag changes. A failed revalidation SHALL be
logged and SHALL NOT fail the write, which is already committed.

#### Scenario: Saving a partner change revalidates the home page
- **WHEN** a staff member creates, updates, deletes, or reorders a partner
- **THEN** the system requests revalidation of the home page path

#### Scenario: Revalidation failure does not fail the write
- **WHEN** the revalidation request fails after a partner write has been committed
- **THEN** the failure is logged, the write remains committed, and the caller receives a success response
