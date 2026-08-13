## ADDED Requirements

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
