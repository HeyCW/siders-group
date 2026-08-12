## Purpose

Lets staff holding the role-management permission define roles as named bundles of permissions, drawn from a fixed permission catalog, and assign one such role to each staff member, so administrative access is controlled by permission rather than by hardcoded role names.

## ADDED Requirements

### Requirement: Fixed permission catalog
The system SHALL maintain a fixed catalog of permissions covering at minimum: news management, category management, tag management, media management, user management, role management, dashboard access, and system settings. Permissions SHALL be defined only by the system and SHALL NOT be creatable, renamable, or deletable through any API.

#### Scenario: Catalog permissions are available for assignment
- **WHEN** a caller holding the role-management permission reads the set of permissions available to assign
- **THEN** every permission in the fixed catalog is returned

#### Scenario: A permission outside the catalog cannot be assigned
- **WHEN** a role create or update request references a permission that is not in the catalog
- **THEN** the request is rejected and the role's permissions are unchanged

### Requirement: Each staff member holds exactly one role
A staff member SHALL hold exactly one role at a time. Their effective permissions SHALL be exactly the permissions assigned to that role.

#### Scenario: Effective permissions come from the single assigned role
- **WHEN** a staff member's effective permissions are evaluated
- **THEN** they are exactly the permissions assigned to that staff member's one assigned role, with no permissions from any other role

### Requirement: Creating a role
A caller holding the role-management permission SHALL be able to create a role with a name and an initial set of permissions drawn from the catalog. Role names SHALL be unique, and the system SHALL reject a name that collides with an existing role.

#### Scenario: Creating a role with permissions
- **WHEN** a permitted caller creates a role with a name and a set of catalog permissions
- **THEN** the role is created holding exactly those permissions

#### Scenario: Duplicate role name is rejected
- **WHEN** a permitted caller creates a role whose name collides with an existing role's
- **THEN** the request is rejected and no role is created

#### Scenario: Caller without the role-management permission cannot create a role
- **WHEN** a staff member lacking the role-management permission attempts to create a role
- **THEN** the request is rejected

### Requirement: Updating a role's permissions
A caller holding the role-management permission SHALL be able to change which permissions are assigned to an existing role. Staff members already holding that role SHALL be affected by the change without being reassigned.

#### Scenario: Adding a permission to a role affects its holders
- **WHEN** a permitted caller adds a permission to a role that one or more staff members already hold
- **THEN** those staff members gain access governed by that permission without any change to their own assignment

#### Scenario: Removing a permission from a role affects its holders
- **WHEN** a permitted caller removes a permission from a role that one or more staff members already hold
- **THEN** those staff members lose access governed by that permission

### Requirement: Deleting a role
A caller holding the role-management permission SHALL be able to delete a role that is not currently assigned to any staff member. The system SHALL reject deleting a role still assigned to at least one staff member.

#### Scenario: Deleting an unassigned role
- **WHEN** a permitted caller deletes a role that no staff member currently holds
- **THEN** the role is removed from the system

#### Scenario: Deleting a role still in use is rejected
- **WHEN** a permitted caller attempts to delete a role currently assigned to at least one staff member
- **THEN** the request is rejected and the role remains in place

### Requirement: Assigning a role to a staff member
A caller holding the role-management permission SHALL be able to assign a role to a staff member, replacing the role that staff member previously held. No staff member SHALL be able to change the role assigned to their own account.

#### Scenario: Assigning a role changes effective permissions on the next request
- **WHEN** a permitted caller assigns a different role to a staff member
- **THEN** that staff member's effective permissions become exactly the permissions of the newly assigned role, effective on their next request

#### Scenario: Self-reassignment is rejected
- **WHEN** a staff member attempts to change the role assigned to their own account
- **THEN** the request is rejected and their assignment is unchanged

### Requirement: Only an Owner may grant or remove the Owner role
Changing which role a staff member holds SHALL require that the caller already holds the Owner role whenever either side of the change is the Owner role — that is, both assigning the Owner role to an account and replacing the Owner role on an account that currently holds it. Holding the role-management permission SHALL NOT be sufficient for either.

Guarding only the granting direction is insufficient. If removing the Owner role required no more than the role-management permission, a non-Owner could reassign the last remaining Owner to an ordinary role, after which no staff member holds Owner and no staff member can grant it back, since granting requires already holding it. That is not privilege escalation but permanent loss of role administration, recoverable only outside the API.

#### Scenario: Non-Owner with role-management permission cannot grant the Owner role
- **WHEN** a staff member holding the role-management permission but not the Owner role assigns the Owner role to any account, including their own
- **THEN** the request is rejected and no assignment occurs

#### Scenario: Non-Owner with role-management permission cannot remove the Owner role
- **WHEN** a staff member holding the role-management permission but not the Owner role assigns a different role to an account that currently holds the Owner role
- **THEN** the request is rejected and the target's assignment is unchanged

#### Scenario: Owner may grant the Owner role
- **WHEN** a staff member holding the Owner role assigns the Owner role to another staff member
- **THEN** the assignment succeeds

#### Scenario: Owner may change another Owner's role
- **WHEN** a staff member holding the Owner role assigns a different role to another account that currently holds the Owner role
- **THEN** the assignment succeeds

### Requirement: The Owner role identity is reserved and immutable
The identity by which the system recognizes the Owner role SHALL be reserved to the single seeded Owner record. No role created or updated through any API SHALL be able to take that identity, and no role's identity SHALL be changeable to it. A system-role marker SHALL be settable only by seeding; a request payload carrying one SHALL be rejected outright rather than accepted with the marker silently dropped, so a caller who believes they are setting it is told otherwise instead of receiving a success response that did something different from what they asked.

#### Scenario: Creating a role that claims the Owner identity is rejected
- **WHEN** a caller creates a role whose name or slug would resolve to the reserved Owner identity
- **THEN** the request is rejected and no role is created

#### Scenario: Renaming a role onto the Owner identity is rejected
- **WHEN** an existing role is updated such that its identity would become the reserved Owner identity
- **THEN** the request is rejected and the role is unchanged

#### Scenario: System-role marker cannot be set through a request
- **WHEN** a role create or update request includes a system-role marker
- **THEN** the request is rejected rather than the marker being silently dropped, and no role other than the seeded Owner record becomes a system role

### Requirement: The Owner role cannot be deleted or stripped of role management
The system SHALL prevent the Owner role from being deleted and SHALL prevent the role-management permission from being removed from it, so role administration can never become inaccessible to every staff member.

#### Scenario: Attempting to delete the Owner role is rejected
- **WHEN** any caller attempts to delete the Owner role
- **THEN** the request is rejected

#### Scenario: Attempting to strip role management from the Owner role is rejected
- **WHEN** any caller attempts to remove the role-management permission from the Owner role
- **THEN** the request is rejected
