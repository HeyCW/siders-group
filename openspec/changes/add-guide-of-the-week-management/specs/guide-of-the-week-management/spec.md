## Purpose

Defines the guide-pick list: the admin-managed collection of city guide picks — each with a
required city, place name, description, and photo — that the public home page's "Siders Guide of
the Week" section is drawn from, its permission-gated admin surface, its explicit ordering, and
the public read that serves only active picks.

## ADDED Requirements

### Requirement: Permission-gated guide-pick endpoints
Every admin endpoint that creates, updates, deletes, or reorders a guide pick SHALL declare the
`news.manage` permission. Authorization SHALL be evaluated against the caller's permissions and
SHALL NOT branch on the name of any role. No new permission catalog entry SHALL be introduced by
this capability.

#### Scenario: Staff member without news.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `news.manage` attempts to
  create, update, delete, or reorder a guide pick
- **THEN** the system rejects the request as forbidden and the guide-pick list is unchanged

#### Scenario: Staff member with news.manage is allowed
- **WHEN** an authenticated staff member whose role includes `news.manage` creates, updates,
  deletes, or reorders a guide pick
- **THEN** the request is allowed

#### Scenario: Anonymous caller cannot reach the admin surface
- **WHEN** a client with no session requests any admin guide-pick endpoint
- **THEN** the system rejects the request as unauthenticated

#### Scenario: No new permission is required to manage guide picks
- **WHEN** the permission catalog is inspected after this capability is deployed
- **THEN** it contains no guide-pick-specific entry, and the ability to manage guide picks is
  carried entirely by `news.manage`

### Requirement: Guide-pick CRUD
The system SHALL expose admin endpoints to create, list, update, and delete guide picks. Each
guide pick SHALL have a city, a place name, a description, a photo, and an active flag defaulting
to active.

#### Scenario: Create a guide pick
- **WHEN** a staff member holding `news.manage` submits a valid city, place, description, and
  photo
- **THEN** the system persists the guide pick and returns its representation including its id

#### Scenario: Admin list includes inactive guide picks
- **WHEN** a staff member holding `news.manage` lists guide picks
- **THEN** the response includes both active and inactive guide picks

### Requirement: A guide pick requires a photo
A guide pick SHALL reference a photo image stored by this system as a media record. A guide pick
SHALL NOT be created or left without one. The photo SHALL be an ordinary image subject to the
existing media rules.

#### Scenario: Photo is required at creation
- **WHEN** a staff member attempts to create a guide pick without a photo
- **THEN** the system rejects the request and creates no guide pick

#### Scenario: Photo reference must be an existing media record
- **WHEN** a staff member submits a guide pick referencing a photo identifier that does not match
  any media record
- **THEN** the system rejects the request and creates no guide pick

#### Scenario: Photo is a normal media record
- **WHEN** a photo image is uploaded for a guide pick
- **THEN** it is accepted, validated, stored, and its URL derived by the existing media rules,
  with no guide-pick-specific storage path

### Requirement: Deactivating a guide pick hides it from public output without deleting it
A guide pick SHALL carry an active flag. Only an active guide pick SHALL appear in public output.
Setting a guide pick inactive SHALL take effect on public output without any change to its stored
order.

#### Scenario: Inactive guide pick is not public
- **WHEN** a guide pick's active flag is set to false
- **THEN** it stops appearing in public output

#### Scenario: Reactivating restores position
- **WHEN** an inactive guide pick is set active again, and other active guide picks precede and
  follow it in the stored order
- **THEN** it appears between exactly those guide picks, in the order originally saved

### Requirement: A single ordered guide-pick list with no maximum
The system SHALL maintain exactly one ordering, applying to the public home page's guide-of-the-
week section only. The order SHALL be preserved across reads. The system SHALL NOT impose a
maximum number of guide picks; the list is bounded only by how many rows exist.

#### Scenario: Order is preserved
- **WHEN** a staff member saves guide picks in a given order and later reads them back
- **THEN** the guide picks are returned in exactly that order

#### Scenario: No cap rejects a large collection
- **WHEN** a staff member creates or reorders a guide-pick list containing more entries than any
  other admin-managed list in this system permits
- **THEN** the system does not reject the request on the basis of count

### Requirement: Guide-pick order is replaced as a whole list
The reorder endpoint SHALL accept a complete ordered collection of every existing guide-pick
identifier and SHALL replace the stored order with it. Positions SHALL be derived from the
submitted order rather than supplied by the client. The replacement SHALL be atomic: either the
whole new order is stored or the previous order remains entirely intact. The system SHALL NOT
expose an endpoint that moves an individual guide pick.

#### Scenario: Reorder submits every existing id
- **WHEN** a staff member submits a reorder request
- **THEN** the system accepts it only if the submitted collection contains exactly every currently
  existing guide-pick id, with no omission, duplicate, or unknown id

#### Scenario: A rejected reorder leaves the order untouched
- **WHEN** a submitted reorder collection fails validation
- **THEN** the previously stored order remains exactly as it was

#### Scenario: Deleting a guide pick heals the stored order
- **WHEN** a guide pick is deleted
- **THEN** its entry is removed from the stored order automatically, with no gap that blocks a
  future reorder

### Requirement: Public read serves only active guide picks in order
The system SHALL expose a public endpoint that returns active guide picks in their stored order,
each with its city, place, description, and photo URL. The endpoint SHALL require no
authentication and SHALL NOT include inactive guide picks or any admin-only field.

#### Scenario: Public listing excludes inactive picks
- **WHEN** a client requests the public guide-pick listing
- **THEN** the response contains only active guide picks, in their stored order

#### Scenario: Public shape omits admin-only fields
- **WHEN** a client reads the public guide-pick listing
- **THEN** each entry contains city, place, description, and photo URL only — no active flag, no
  sort-order value, no internal id

### Requirement: Guide-pick writes revalidate the home page
The system SHALL trigger revalidation of the home page path whenever a guide pick is created,
updated, deleted, or reordered, or whenever a guide pick's active flag changes. A failed
revalidation SHALL be logged and SHALL NOT fail the write, which is already committed.

#### Scenario: Saving a guide-pick change revalidates the home page
- **WHEN** a staff member creates, updates, deletes, or reorders a guide pick
- **THEN** the system requests revalidation of the home page path
