## ADDED Requirements

### Requirement: Enumerating staff accounts
A caller holding either the user-management or the role-management permission SHALL be able to read the list of staff accounts. Each entry SHALL carry the account's identity, its assigned role, its status, and whether a password change is pending. Disabled accounts SHALL be included, since an administrator needs to see that an account exists and is disabled rather than not see it at all.

No credential material SHALL appear in any entry. The stored password hash is part of the internal row shape these entries are derived from, and it SHALL be excluded from what is returned.

Either permission suffices for the same reason it does for the role list: a role-management holder cannot assign a role without knowing which staff exist.

#### Scenario: A user-management holder reads the staff list
- **WHEN** a caller holding the user-management permission reads the list of staff accounts
- **THEN** every staff account is returned with its identity, assigned role, status, and pending-password-change state

#### Scenario: A role-management holder reads the staff list
- **WHEN** a caller holding the role-management permission but not the user-management permission reads the list of staff accounts
- **THEN** the request succeeds and every staff account is returned

#### Scenario: A caller holding neither permission is rejected
- **WHEN** a staff member holding neither the user-management nor the role-management permission reads the list of staff accounts
- **THEN** the request is rejected

#### Scenario: Disabled accounts are listed
- **WHEN** the staff list is read and some account has been disabled
- **THEN** that account appears in the list, marked as disabled

#### Scenario: No password hash is disclosed
- **WHEN** the staff list is read
- **THEN** no entry carries a password hash or any other credential material

### Requirement: Staff administration console
The admin application SHALL provide a page, reachable by a caller holding either the user-management or the role-management permission, that lists staff accounts ordered by name with disabled accounts shown in a visually de-emphasized state.

Each account's controls SHALL be offered according to the permission that governs the underlying operation rather than according to page access: creating, disabling, and resetting an account are offered to a user-management holder, and changing an account's assigned role is offered to a role-management holder. A caller holding one permission but not the other SHALL therefore see some controls and not others on the same row. Rendering remains cosmetic — a rejection from the server stays authoritative.

Controls the server would certainly reject SHALL NOT be offered: the caller's own row SHALL offer neither a role change nor a disable control, and an account holding the Owner role SHALL offer no role change, disable, or reset control to a caller who is not an Owner.

#### Scenario: Accounts are listed by name with disabled ones de-emphasized
- **WHEN** a permitted caller opens the staff page
- **THEN** every staff account is listed ordered by name, and disabled accounts appear de-emphasized rather than hidden

#### Scenario: Controls follow the governing permission
- **WHEN** a caller holding the role-management permission but not the user-management permission views the staff page
- **THEN** a role-change control is offered and the create, disable, and reset controls are not

#### Scenario: The caller's own row offers no self-administration
- **WHEN** the staff page renders the row for the caller's own account
- **THEN** neither a role-change control nor a disable control is offered for it

#### Scenario: A non-Owner is offered no controls over an Owner account
- **WHEN** a caller who does not hold the Owner role views a staff account that holds the Owner role
- **THEN** no role-change, disable, or reset control is offered for that account

### Requirement: One-time disclosure of a generated temporary password
When an account is created or its credentials are reset, the admin application SHALL display the temporary password the system generated, together with a means of copying it and an explicit statement that it will not be shown again. The value SHALL be presented only in the response to the operation that generated it and SHALL NOT be re-readable afterward.

Without this, a generated credential is returned by the API and discarded unseen, leaving no way to give a new staff member their first password.

#### Scenario: Creating an account discloses the temporary password once
- **WHEN** a permitted caller creates a staff account
- **THEN** the generated temporary password is displayed with a means of copying it and a statement that it will not be shown again

#### Scenario: Resetting credentials discloses the new temporary password once
- **WHEN** a permitted caller resets a staff account's credentials
- **THEN** the newly generated temporary password is displayed with a means of copying it and a statement that it will not be shown again

#### Scenario: The temporary password is not retrievable later
- **WHEN** the disclosure is dismissed or the page is reloaded
- **THEN** the temporary password is no longer obtainable through the admin application, and reading the staff list does not reveal it
