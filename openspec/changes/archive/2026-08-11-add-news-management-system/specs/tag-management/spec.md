## Purpose

Defines the tag catalog: its admin CRUD surface gated on `tag.manage`, and the many-to-many relationship between articles and tags.

## ADDED Requirements

### Requirement: Permission-gated tag endpoints
Every admin endpoint that creates, updates, or deletes a tag SHALL declare the `tag.manage` permission. Authorization SHALL be evaluated against the caller's permissions and SHALL NOT branch on the name of any role.

#### Scenario: Staff member without tag.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `tag.manage` attempts to create, update, or delete a tag
- **THEN** the system rejects the request as forbidden and the tag catalog is unchanged

#### Scenario: Staff member with tag.manage is allowed
- **WHEN** an authenticated staff member whose role includes `tag.manage` creates, updates, or deletes a tag
- **THEN** the request is allowed

#### Scenario: news.manage alone does not grant tag catalog access
- **WHEN** a staff member holding `news.manage` but not `tag.manage` attempts to create a new tag
- **THEN** the system rejects the request as forbidden

### Requirement: Tag CRUD
The system SHALL expose admin endpoints to create, list, update, and delete tags. Each tag SHALL have a name and a URL-safe slug that is unique across all tags.

#### Scenario: Create a tag
- **WHEN** a staff member holding `tag.manage` submits a valid tag name
- **THEN** the system persists the tag with a URL-safe slug and returns its representation including its id

#### Scenario: Duplicate tag slug rejected
- **WHEN** a staff member saves a tag slug that already belongs to another tag
- **THEN** the system rejects the save with a conflict error and does not create two tags sharing one slug

### Requirement: Articles relate to tags many-to-many
The system SHALL associate articles and tags through a join relationship in which one article may have many tags and one tag may have many articles.

#### Scenario: One article carries several tags
- **WHEN** an article is assigned two or more tags
- **THEN** all of those associations are persisted and returned with the article

#### Scenario: Replace an article's tags
- **WHEN** a staff member saves an article with a tag set that omits a previously assigned tag
- **THEN** the omitted association is removed and only the submitted tags remain associated

### Requirement: Deleting a tag detaches it without deleting articles
Deleting a tag SHALL remove its associations with any articles and SHALL NOT delete, unpublish, or otherwise alter those articles.

#### Scenario: Delete a tag in use
- **WHEN** a staff member deletes a tag that is currently assigned to one or more published articles
- **THEN** the tag is removed, those articles remain published and retrievable, and they are no longer associated with the deleted tag

#### Scenario: Deleted tag disappears from public filtering
- **WHEN** a tag has been deleted
- **THEN** it is no longer offered or accepted as a public article-list filter value
