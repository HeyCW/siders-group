## Purpose

Governs the lifecycle of staff accounts — creation, disabling, credential reset, and self-service password change — gated by the user-management permission, with no self-service signup path, no email delivery anywhere in the lifecycle, and additional Owner-only protection around granting Owner access.

## ADDED Requirements

### Requirement: No unauthenticated staff account creation
No route SHALL create a staff account for an unauthenticated caller. Staff accounts SHALL only come into existence through a creation request from a caller holding the user-management permission.

#### Scenario: Anonymous caller cannot create a staff account
- **WHEN** an anonymous caller requests the staff-creation endpoint
- **THEN** the request is rejected and no staff account is created

#### Scenario: No route creates a staff account without the user-management permission
- **WHEN** the set of registered routes is enumerated
- **THEN** no route creates a staff account without requiring a caller holding the user-management permission

### Requirement: Staff account creation
A caller holding the user-management permission SHALL be able to create a new staff account by specifying at least an email address, a name, and a role. The system SHALL generate the account's initial password itself rather than accepting one from the caller, SHALL create the account in an active state marked as requiring a password change, and SHALL return that temporary password exactly once, in the creation response. The system SHALL NOT send email as part of creation. The system SHALL reject creating a staff account for an email address that already belongs to any staff account, in any status.

#### Scenario: Permitted caller creates a new staff member
- **WHEN** a caller holding the user-management permission submits a new staff member's email address, name, and role
- **THEN** a staff account is created in an active state marked as requiring a password change, and the response carries a generated temporary password

#### Scenario: Caller cannot choose the initial password
- **WHEN** a staff-creation request carries a password or password-hash field
- **THEN** the request is rejected rather than the submitted value being used

#### Scenario: Caller without the user-management permission cannot create staff
- **WHEN** a staff member lacking the user-management permission attempts to create a staff account
- **THEN** the request is rejected and no staff account is created

#### Scenario: Creating an account for an email that already has one is rejected
- **WHEN** a staff account is created for an email address that already belongs to an active or disabled staff account
- **THEN** the request is rejected, and the existing account's status, role, and credentials are unchanged

### Requirement: Only an Owner may grant Owner access
Creating a staff account whose initial role is the Owner role SHALL require that the caller already holds the Owner role. Holding the user-management permission SHALL NOT be sufficient.

#### Scenario: Non-Owner with user-management permission cannot create an Owner
- **WHEN** a staff member holding the user-management permission but not the Owner role creates a staff account whose role is the Owner role
- **THEN** the request is rejected and no staff account is created

#### Scenario: Owner may create another Owner
- **WHEN** a staff member holding the Owner role creates a staff account whose role is the Owner role
- **THEN** the account is created

### Requirement: Temporary passwords are generated, disclosed once, and hashed at rest
Every temporary password the system issues SHALL be cryptographically random with at least 128 bits of entropy, SHALL be stored only as a hash produced by the same algorithm and parameters as any other staff password, and SHALL appear in exactly one response — the creation or reset response that produced it. No endpoint SHALL disclose a temporary password after that response, and no endpoint SHALL disclose credential material for any existing account.

#### Scenario: Temporary password cannot be retrieved after issuance
- **WHEN** any staff-reading endpoint is queried for an account that was issued a temporary password
- **THEN** no response contains that password or any other credential material

#### Scenario: Issuing a new temporary password retires the previous one
- **WHEN** a second temporary password is issued for an account whose first temporary password has not yet been changed
- **THEN** the earlier temporary password no longer authenticates

### Requirement: First sign-in requires setting a new password
A staff account marked as requiring a password change SHALL be able to sign in and establish a session, but SHALL be refused at every endpoint requiring staff identity or a named permission until its password is replaced — with the sole exception of the password-change endpoint and the endpoint returning the caller's own account, which remain reachable so the change can actually be made. Replacing the password SHALL clear the requirement.

#### Scenario: Account requiring a password change can still sign in
- **WHEN** a staff member whose account is marked as requiring a password change submits their correct email and temporary password
- **THEN** a staff session is established

#### Scenario: Gated endpoints are refused until the password is changed
- **WHEN** a staff member whose account is marked as requiring a password change requests an endpoint declaring staff identity or a named permission, other than the password-change endpoint or their own-account endpoint
- **THEN** the request is rejected

#### Scenario: Changing the password lifts the restriction
- **WHEN** a staff member marked as requiring a password change replaces their password
- **THEN** the requirement is cleared and their subsequent requests to gated endpoints are evaluated on their permissions alone

### Requirement: Staff may change their own password
A signed-in staff member SHALL be able to change their own password by supplying their current password alongside the new one. The system SHALL reject the change if the current password does not verify. A successful change SHALL revoke every other session belonging to that account while leaving the caller's own session usable, so that changing a password does not sign the caller out of the request that changed it.

#### Scenario: Password change requires the current password
- **WHEN** a staff member submits a new password without a matching current password
- **THEN** the change is rejected and the existing password continues to work

#### Scenario: Changing a password ends the account's other sessions
- **WHEN** a staff member changes their password while holding sessions on other devices
- **THEN** those sessions' credentials are no longer accepted, and the caller's own session continues to work

### Requirement: Disabling a staff account
A caller holding the user-management permission SHALL be able to disable an active staff account. A disabled account SHALL lose the ability to sign in, and all of its existing sessions SHALL be revoked.

#### Scenario: Disabling ends the ability to sign in
- **WHEN** a permitted caller disables a staff account
- **THEN** subsequent sign-in attempts using that account's credentials are rejected

#### Scenario: Disabling revokes existing sessions on the next request
- **WHEN** a permitted caller disables a staff account that holds an active session
- **THEN** requests made with that account's existing access credentials are rejected on their next request, without waiting for credential expiry

#### Scenario: A staff member cannot disable their own account
- **WHEN** a staff member attempts to disable the account they are signed in as
- **THEN** the request is rejected

### Requirement: Credential reset
A caller holding the user-management permission SHALL be able to reset a staff account's credentials. Reset SHALL issue a newly generated temporary password returned exactly once in the reset response, SHALL mark the account as requiring a password change, and SHALL revoke every existing session for that account. Reset SHALL NOT send email and SHALL NOT be reachable by an unauthenticated caller.

#### Scenario: Reset issues a new temporary password and retires the old one
- **WHEN** a permitted caller resets a staff account's credentials
- **THEN** the response carries a newly generated temporary password, and the account's previous password no longer authenticates

#### Scenario: Reset revokes existing sessions
- **WHEN** a permitted caller resets the credentials of a staff account that holds active sessions
- **THEN** none of those sessions' credentials are accepted afterward

#### Scenario: Reset account must change the password again before working
- **WHEN** a staff member signs in with a temporary password issued by a reset
- **THEN** their account is marked as requiring a password change and gated endpoints are refused until it is replaced

#### Scenario: Unauthenticated caller cannot trigger a reset
- **WHEN** an anonymous caller requests a credential reset for any email address or account
- **THEN** the request is rejected and no credential is changed
