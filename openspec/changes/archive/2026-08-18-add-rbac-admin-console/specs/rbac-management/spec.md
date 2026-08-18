## ADDED Requirements

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
