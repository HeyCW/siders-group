# rbac-management Specification

## Purpose

Lets staff holding the role-management permission define roles as named bundles of permissions, drawn from a fixed permission catalog, and assign one such role to each staff member, so administrative access is controlled by permission rather than by hardcoded role names.

## Requirements

### Requirement: Fixed permission catalog
The system SHALL maintain a fixed catalog of permissions covering at minimum: news management, category management, tag management, anak usaha management, media management, user management, role management, dashboard access, system settings, community moderation, and contact-message management. Permissions SHALL be defined only by the system and SHALL NOT be creatable, renamable, or deletable through any API.

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

### Requirement: Enumerating roles
A caller holding either the user-management or the role-management permission SHALL be able to read the list of roles. Each entry SHALL carry the role's identity, whether it is the reserved system role, and the number of staff members currently holding it. The list SHALL include roles that no staff member holds.

Either permission suffices because role administration and staff administration are mutually dependent: assigning a role requires knowing which staff exist, and creating a staff account requires knowing which roles exist. Restricting the role list to the role-management permission alone would leave a user-management holder unable to create any account, since account creation identifies the role by id and no other endpoint discloses one.

#### Scenario: A role-management holder reads the role list
- **WHEN** a caller holding the role-management permission reads the list of roles
- **THEN** every role is returned with its identity, its system-role status, and its holder count

#### Scenario: A user-management holder reads the role list
- **WHEN** a caller holding the user-management permission but not the role-management permission reads the list of roles
- **THEN** the request succeeds and every role is returned

#### Scenario: A caller holding neither permission is rejected
- **WHEN** a staff member holding neither the user-management nor the role-management permission reads the list of roles
- **THEN** the request is rejected

#### Scenario: A role with no holders still appears
- **WHEN** the role list is read and some role is assigned to no staff member
- **THEN** that role is present in the list with a holder count of zero

### Requirement: Reading one role's permissions
A caller holding the role-management permission SHALL be able to read a single role together with the set of permissions assigned to it. The user-management permission alone SHALL NOT be sufficient, since a role's permission set is role-administration data rather than information needed to assign a role to an account.

#### Scenario: Reading a role returns its assigned permissions
- **WHEN** a caller holding the role-management permission reads a single role
- **THEN** the role is returned together with exactly the permissions currently assigned to it

#### Scenario: A user-management holder cannot read a role's permissions
- **WHEN** a caller holding the user-management permission but not the role-management permission reads a single role
- **THEN** the request is rejected

#### Scenario: Reading an unknown role
- **WHEN** a permitted caller reads a role that does not exist
- **THEN** the request is rejected as not found

### Requirement: Role administration console
The admin application SHALL provide a page, reachable only by a caller holding the role-management permission, that lists roles and offers creating a role, renaming a role, deleting a role, and changing which catalog permissions a role holds. Permission editing SHALL present the fixed catalog, with the role's current permissions marked, and SHALL submit the resulting set as a whole.

Affordances that the server would certainly reject SHALL NOT be offered: the reserved system role SHALL be presented as neither deletable nor able to give up the role-management permission, and deletion SHALL be unavailable for a role that currently has holders, with the holder count given as the reason. Rendering remains cosmetic — a rejection from the server stays authoritative regardless of what the page offers.

#### Scenario: The console lists roles with holder counts
- **WHEN** a caller holding the role-management permission opens the roles page
- **THEN** every role is listed with its name and the number of staff members holding it

#### Scenario: Deleting a role with holders is not offered
- **WHEN** the roles page renders a role that at least one staff member currently holds
- **THEN** the delete control is unavailable and the holder count is shown as the reason

#### Scenario: The system role is protected in the console
- **WHEN** the roles page renders the reserved system role
- **THEN** no delete control is offered for it and its role-management permission cannot be cleared

#### Scenario: Editing permissions submits the whole set
- **WHEN** a permitted caller changes which permissions a role holds and saves
- **THEN** the role's permissions become exactly the set shown in the editor, and the page renders the state the server returns

### Requirement: Warning before removing one's own role-management access
The admin application SHALL warn a caller who is about to remove the role-management permission from the role they themselves hold, naming the consequence, before the change is submitted. The change SHALL remain permitted once confirmed.

The system already prevents role administration from becoming inaccessible to everyone by protecting the reserved Owner role, so this case is a recoverable self-lockout rather than a permanent loss — an Owner can restore the permission. It is warned about rather than blocked because the caller would otherwise receive a success response and silently lose a capability they still expect to hold.

#### Scenario: Removing one's own role-management permission warns first
- **WHEN** a caller edits the role they currently hold so that it no longer includes the role-management permission
- **THEN** a warning naming the consequence is shown before the change is submitted

#### Scenario: The change proceeds once confirmed
- **WHEN** that caller confirms the warning
- **THEN** the change is submitted and the permission is removed

#### Scenario: Editing another role does not warn
- **WHEN** a caller removes the role-management permission from a role they do not hold
- **THEN** no such warning is shown
