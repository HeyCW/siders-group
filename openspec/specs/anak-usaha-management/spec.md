# anak-usaha-management Specification

## Purpose

Defines the anak usaha (sub-brand) catalog: a lightweight, admin-managed taxonomy seeded with the
system's four existing sub-brands, its permission-gated CRUD, its public listing, and the
one-to-many reference that lets an article carry at most one anak usaha.

## Requirements

### Requirement: Permission-gated anak usaha endpoints
Every admin endpoint that creates, updates, or deletes an anak usaha entry SHALL declare the
`anak-usaha.manage` permission. Authorization SHALL be evaluated against the caller's permissions
and SHALL NOT branch on the name of any role.

#### Scenario: Staff member without anak-usaha.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `anak-usaha.manage` attempts
  to create, update, or delete an anak usaha entry
- **THEN** the system rejects the request as forbidden and the anak usaha catalog is unchanged

#### Scenario: Staff member with anak-usaha.manage is allowed
- **WHEN** an authenticated staff member whose role includes `anak-usaha.manage` creates, updates,
  or deletes an anak usaha entry
- **THEN** the request is allowed

#### Scenario: news.manage alone does not grant anak usaha catalog access
- **WHEN** a staff member holding `news.manage` but not `anak-usaha.manage` attempts to create a
  new anak usaha entry
- **THEN** the system rejects the request as forbidden

### Requirement: Anak usaha CRUD
The system SHALL expose admin endpoints to create, list, update, and delete anak usaha entries.
Each entry SHALL have a name and a URL-safe slug that is unique across all entries. The catalog
SHALL be seeded with the system's existing four sub-brands.

#### Scenario: Catalog is seeded with the existing sub-brands
- **WHEN** the anak usaha catalog is read after this capability is deployed
- **THEN** it contains the system's four existing sub-brands, each with a name and a unique slug

#### Scenario: Create an anak usaha entry
- **WHEN** a staff member holding `anak-usaha.manage` submits a valid name
- **THEN** the system persists the entry with a URL-safe slug and returns its representation
  including its id

#### Scenario: Duplicate anak usaha slug rejected
- **WHEN** a staff member saves an anak usaha slug that already belongs to another entry
- **THEN** the system rejects the save with a conflict error and does not create two entries
  sharing one slug

#### Scenario: Rename an anak usaha entry
- **WHEN** a staff member updates an anak usaha entry's name
- **THEN** the new name is persisted and appears wherever that entry is returned, including on
  articles already associated with it

### Requirement: Public anak usaha listing
The system SHALL expose the anak usaha list without requiring authentication, matching categories
and tags, so any authenticated staff member — regardless of whether they hold
`anak-usaha.manage` — can populate the article editor's selection control, and so it is available
as reference data wherever else it is needed.

#### Scenario: Listing requires no permission
- **WHEN** an authenticated staff member who does not hold `anak-usaha.manage` requests the anak
  usaha list
- **THEN** the system returns the full catalog

### Requirement: Articles relate to anak usaha one-to-many
The system SHALL associate an article with at most one anak usaha via a direct reference on the
article, and one anak usaha SHALL be associable with many articles. No join table SHALL back this
relationship. The reference SHALL be optional — an article MAY have no anak usaha.

#### Scenario: One anak usaha spans many articles
- **WHEN** several articles are each assigned the same anak usaha
- **THEN** every one of those articles is associated with that anak usaha

#### Scenario: An article has at most one anak usaha
- **WHEN** a staff member saves an article with an anak usaha selected, then later selects a
  different anak usaha for the same article
- **THEN** the article is associated with only the most recently selected anak usaha, never both

#### Scenario: An article may have none
- **WHEN** a staff member saves an article without selecting an anak usaha
- **THEN** the article is persisted with no anak usaha association and no error occurs

#### Scenario: Clearing a previously set anak usaha
- **WHEN** a staff member clears the anak usaha selection on an article that previously had one
- **THEN** the article's anak usaha association is removed

### Requirement: Deleting an anak usaha detaches it without deleting articles
Deleting an anak usaha entry SHALL clear that association on every article that referenced it and
SHALL NOT delete, unpublish, or otherwise alter those articles.

#### Scenario: Delete an anak usaha in use
- **WHEN** a staff member deletes an anak usaha entry that is currently assigned to one or more
  published articles
- **THEN** the entry is removed, those articles remain published and retrievable, and they no
  longer reference the deleted entry

### Requirement: Article editor exposes a single-select anak usaha field
The admin article edit page's metadata sidebar SHALL offer a single-select control listing every
anak usaha catalog entry plus a "none" option, reflecting the article's current association and
persisting a change through the same save path as other metadata fields (categories, tags,
excerpt).

#### Scenario: Selecting an anak usaha
- **WHEN** a staff member opens an article and selects an anak usaha from the sidebar control
- **THEN** the selection is saved with the article and is reflected the next time the article is
  loaded

#### Scenario: Only one selection is possible
- **WHEN** a staff member interacts with the anak usaha control
- **THEN** the control allows choosing at most one entry at a time, unlike the multi-select
  Categories and Tags controls
