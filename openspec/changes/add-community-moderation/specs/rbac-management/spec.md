## MODIFIED Requirements

### Requirement: Fixed permission catalog
The system SHALL maintain a fixed catalog of permissions covering at minimum: news management, category management, tag management, media management, user management, role management, dashboard access, system settings, and community moderation. Permissions SHALL be defined only by the system and SHALL NOT be creatable, renamable, or deletable through any API.

#### Scenario: Catalog permissions are available for assignment
- **WHEN** a caller holding the role-management permission reads the set of permissions available to assign
- **THEN** every permission in the fixed catalog is returned

#### Scenario: A permission outside the catalog cannot be assigned
- **WHEN** a role create or update request references a permission that is not in the catalog
- **THEN** the request is rejected and the role's permissions are unchanged
