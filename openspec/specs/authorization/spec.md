# authorization Specification

## Purpose

Enforces what an identified or anonymous caller may do, as a layer fully separate from authentication, covering explicitly-declared public access, reader-only access, staff-only access, and permission-based access for administrative capabilities.

## Requirements

### Requirement: Authorization is separate from authentication
Authorization SHALL be evaluated independently of authentication. A successfully authenticated caller MAY still be denied access, and an anonymous caller MAY still be granted access, depending only on what the endpoint declares.

#### Scenario: Authenticated caller denied by authorization
- **WHEN** a signed-in reader requests an endpoint declared staff-only
- **THEN** the request is denied even though authentication succeeded in identifying the caller

#### Scenario: Anonymous caller granted access
- **WHEN** an anonymous caller requests an endpoint declared public
- **THEN** the request is granted despite no identity being present

### Requirement: Every endpoint carries an explicit authorization declaration
Every registered endpoint SHALL carry an explicit authorization declaration — one of public, reader-only, staff-only, or a named permission. An endpoint carrying no declaration SHALL be denied to all callers, and the system SHALL fail to start if any registered route lacks a declaration. Authorization SHALL fail closed: absence of a declaration is a denial, never an implicit grant.

#### Scenario: Endpoint with no declaration is denied, not public
- **WHEN** a request reaches an endpoint that carries no authorization declaration
- **THEN** the request is rejected

#### Scenario: Startup fails on an undeclared route
- **WHEN** the application starts with a registered route that carries no authorization declaration
- **THEN** startup fails rather than serving that route

#### Scenario: Endpoint requiring a permission rejects a caller without it
- **WHEN** a staff member lacking the permission an endpoint declares makes a request to it
- **THEN** the request is rejected and none of the endpoint's effects occur

### Requirement: Public content is reachable without authentication
An endpoint declared public SHALL be reachable by anonymous callers with no credential of any kind. Content endpoints intended for anonymous browsing SHALL carry the public declaration.

#### Scenario: Anonymous caller reaches a public endpoint
- **WHEN** an anonymous caller requests an endpoint declared public
- **THEN** the request succeeds without any sign-in

#### Scenario: Public endpoint does not require a CSRF token for reads
- **WHEN** an anonymous caller makes a read request to a public endpoint
- **THEN** the request succeeds without any CSRF token

### Requirement: Reader-only authorization
An endpoint declared reader-only SHALL be reachable only by callers holding an authenticated reader identity whose reader account is in an active state, and SHALL reject anonymous callers and staff callers who hold no reader identity. Deactivating a reader account SHALL revoke all of that reader's sessions. A reader whose mute period has not elapsed SHALL be rejected by endpoints that create reader-authored content, while retaining access to read-only endpoints.

#### Scenario: Anonymous caller rejected from a reader-only endpoint
- **WHEN** an anonymous caller requests an endpoint declared reader-only, such as the endpoint returning the current reader's own account information
- **THEN** the request is rejected

#### Scenario: Signed-in active reader allowed
- **WHEN** an authenticated reader whose account is active requests a reader-only endpoint
- **THEN** the request is allowed

#### Scenario: Deactivated reader is rejected and loses existing sessions
- **WHEN** a reader's account is deactivated while they hold an active session
- **THEN** their existing session credentials are no longer accepted at reader-only endpoints

#### Scenario: Muted reader cannot author content
- **WHEN** a reader whose mute period has not elapsed requests an endpoint that creates reader-authored content
- **THEN** the request is rejected while their access to read-only endpoints is unaffected

### Requirement: Staff-only authorization
An endpoint declared staff-only SHALL be reachable only by callers holding an authenticated staff identity whose staff account is active, regardless of that staff member's assigned role or permissions, and SHALL reject anonymous callers and reader callers.

#### Scenario: Reader rejected from a staff-only endpoint
- **WHEN** an authenticated reader requests an endpoint declared staff-only
- **THEN** the request is rejected

#### Scenario: Any active staff member allowed through a staff-only gate
- **WHEN** an authenticated staff member with an active account, regardless of their assigned role, requests an endpoint declared staff-only
- **THEN** the request is allowed

### Requirement: Permission-based authorization
An endpoint declaring a named permission SHALL be reachable only by a staff member whose assigned role includes that permission. The system SHALL evaluate the permission itself and SHALL NOT branch on the name of any role, with the single exception of the Owner role defined below. Permission evaluation SHALL resolve the caller's current role from the caller's stored account record rather than from any value carried in the access credential, so that a role change takes effect on the caller's very next request.

#### Scenario: Staff member with the required permission is allowed
- **WHEN** a staff member whose assigned role includes a given permission requests an endpoint declaring that permission
- **THEN** the request is allowed

#### Scenario: Staff member without the required permission is rejected
- **WHEN** a staff member whose assigned role does not include a given permission requests an endpoint declaring that permission
- **THEN** the request is rejected

#### Scenario: Revoking a permission from a role takes effect on the next request
- **WHEN** a permission is removed from a staff member's assigned role after they were already signed in
- **THEN** their next request to an endpoint declaring that permission is rejected

#### Scenario: Demotion takes effect before the access credential expires
- **WHEN** a staff member's assigned role is replaced with one lacking a permission they previously had, and they make a request with an access credential issued before the change
- **THEN** their request to an endpoint declaring that permission is rejected

### Requirement: The Owner role satisfies every permission check
A staff member holding the Owner role SHALL satisfy every permission-based authorization check, so that role and permission administration can never become inaccessible to every staff member. The system SHALL recognize the Owner role by the immutable identity of the seeded Owner record, never by a caller-supplied or editable name or slug.

#### Scenario: Owner reaches a permission-gated endpoint with no explicit assignment
- **WHEN** a staff member holding the Owner role requests an endpoint declaring a specific permission
- **THEN** the request is allowed, whether or not that permission has been explicitly assigned to the Owner role

#### Scenario: Owner recognition survives an emptied permission assignment
- **WHEN** every permission assignment for the Owner role is removed and a staff member holding that role requests a permission-gated endpoint
- **THEN** the request is still allowed

### Requirement: A pending password change blocks every gated endpoint
Both the staff-only and permission-based guards SHALL reject a caller whose staff account is marked as requiring a password change, before evaluating any permission, and SHALL do so with a response distinguishable from an ordinary permission denial so the client can route the caller to the password-change screen. Only two endpoints SHALL be exempt: the password-change endpoint itself and the endpoint returning the caller's own account. The Owner role SHALL NOT bypass this check — it is not a permission check, and an Owner holding a temporary password is exactly the case that most needs it.

#### Scenario: Staff-only endpoint is refused while a password change is pending
- **WHEN** a staff member whose account is marked as requiring a password change requests an endpoint declared staff-only, other than their own-account endpoint
- **THEN** the request is rejected

#### Scenario: Permission-gated endpoint is refused before the permission is evaluated
- **WHEN** a staff member whose account is marked as requiring a password change requests an endpoint declaring a permission their role does hold
- **THEN** the request is still rejected, and the rejection identifies the pending password change rather than a missing permission

#### Scenario: Owner does not bypass a pending password change
- **WHEN** a staff member holding the Owner role and marked as requiring a password change requests a permission-gated endpoint
- **THEN** the request is rejected despite the Owner role's permission bypass

#### Scenario: The password-change endpoint stays reachable
- **WHEN** a staff member marked as requiring a password change requests the password-change endpoint or their own-account endpoint
- **THEN** the request is allowed

#### Scenario: A role that merely claims the Owner name gets no bypass
- **WHEN** a staff member holds a role whose name or slug resembles the Owner role's but which is not the seeded Owner record
- **THEN** that role receives no bypass, and permission checks are evaluated against its assigned permissions only

### Requirement: A staff member's own effective permissions and Owner status are readable
The endpoint returning a staff member's own account SHALL report that caller's currently effective permission keys and whether they hold the Owner role, resolved the same way a permission-based check would resolve them. This report SHALL exist for client-side rendering decisions only: it SHALL NOT be treated as a grant, SHALL NOT be substituted for evaluating any later request, and SHALL have no effect on how any staff-only or permission-based check evaluates that or any subsequent request.

#### Scenario: Effective permissions are reported
- **WHEN** a staff member reads their own account
- **THEN** the response includes exactly the permission keys resolved from their currently assigned role

#### Scenario: Owner status is reported independent of explicit permission rows
- **WHEN** a staff member holding the Owner role, whose role currently holds no explicit permission assignments, reads their own account
- **THEN** the response still reports that they hold the Owner role

#### Scenario: A role or permission change is reflected on the next read
- **WHEN** a staff member's assigned role changes, or a permission is added to or removed from their role, after they were already signed in
- **THEN** their next read of their own account reports the updated permission keys

#### Scenario: Reported state does not change enforcement
- **WHEN** a permission is removed from a staff member's role after their effective permissions were last reported to them, and they then request an endpoint declaring that permission
- **THEN** the request is rejected exactly as it would be had the permission never been reported to them
