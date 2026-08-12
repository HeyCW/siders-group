## Purpose

Defines the category catalog: its admin CRUD surface gated on `category.manage`, and the many-to-many relationship between articles and categories.

## ADDED Requirements

### Requirement: Permission-gated category endpoints
Every admin endpoint that creates, updates, or deletes a category SHALL declare the `category.manage` permission. Authorization SHALL be evaluated against the caller's permissions and SHALL NOT branch on the name of any role.

#### Scenario: Staff member without category.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `category.manage` attempts to create, update, or delete a category
- **THEN** the system rejects the request as forbidden and the category catalog is unchanged

#### Scenario: Staff member with category.manage is allowed
- **WHEN** an authenticated staff member whose role includes `category.manage` creates, updates, or deletes a category
- **THEN** the request is allowed

#### Scenario: news.manage alone does not grant category catalog access
- **WHEN** a staff member holding `news.manage` but not `category.manage` attempts to create a new category
- **THEN** the system rejects the request as forbidden

### Requirement: Category CRUD
The system SHALL expose admin endpoints to create, list, update, and delete categories. Each category SHALL have a name and a URL-safe slug that is unique across all categories.

#### Scenario: Create a category
- **WHEN** a staff member holding `category.manage` submits a valid category name
- **THEN** the system persists the category with a URL-safe slug and returns its representation including its id

#### Scenario: Duplicate category slug rejected
- **WHEN** a staff member saves a category slug that already belongs to another category
- **THEN** the system rejects the save with a conflict error and does not create two categories sharing one slug

#### Scenario: Rename a category
- **WHEN** a staff member updates a category's name
- **THEN** the new name is persisted and appears wherever that category is returned, including on articles already associated with it

### Requirement: Articles relate to categories many-to-many
The system SHALL associate articles and categories through a join relationship in which one article may have many categories and one category may have many articles. No single-category column SHALL exist on an article.

#### Scenario: One category spans many articles
- **WHEN** several articles are each assigned the same category
- **THEN** every one of those articles is associated with that category, and the category's article set includes all of them

#### Scenario: One article spans many categories
- **WHEN** an article is assigned two or more categories
- **THEN** all of those associations are persisted and returned with the article

### Requirement: Deleting a category detaches it without deleting articles
Deleting a category SHALL remove its associations with any articles and SHALL NOT delete, unpublish, or otherwise alter those articles.

#### Scenario: Delete a category in use
- **WHEN** a staff member deletes a category that is currently assigned to one or more published articles
- **THEN** the category is removed, those articles remain published and retrievable, and they are no longer associated with the deleted category

#### Scenario: Deleted category disappears from public filtering
- **WHEN** a category has been deleted
- **THEN** it is no longer offered or accepted as a public article-list filter value
