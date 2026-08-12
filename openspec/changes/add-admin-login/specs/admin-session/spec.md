## Purpose

Defines the admin single-page app's session lifecycle: how it determines whether a staff member is signed in, guards its routes accordingly, keeps a session usable across the access credential's short lifetime without ever risking the refresh credential's reuse detection, forces a pending password change, and signs out.

## ADDED Requirements

### Requirement: Session presence gates every route except sign-in
The admin app SHALL determine, before rendering a protected route's content, whether a staff session currently exists. A caller with no resolved session SHALL be redirected to the sign-in route instead of seeing any protected route's content. The sign-in route itself SHALL NOT be gated behind a session probe, and a caller who already has a resolved session SHALL be redirected away from the sign-in route into the app rather than shown the sign-in form again.

#### Scenario: Unauthenticated visit to a protected route redirects to sign-in
- **WHEN** a caller with no resolved session requests a route other than sign-in
- **THEN** the app redirects to the sign-in route and renders none of the requested route's content

#### Scenario: A resolved session allows a protected route to render
- **WHEN** a caller with a resolved session requests a protected route
- **THEN** the route's content renders

#### Scenario: An already-signed-in caller visiting sign-in is sent into the app
- **WHEN** a caller with a resolved session requests the sign-in route
- **THEN** the app redirects them into the app rather than rendering the sign-in form

#### Scenario: An expired access credential on load is recovered before concluding the caller is signed out
- **WHEN** the initial session determination fails with a 403 solely because the access credential has expired, while a valid refresh credential is still held
- **THEN** the app attempts the same refresh described below before concluding that no session exists

### Requirement: Deep-link targets are preserved but restricted to relative in-app paths
When a caller is redirected to the sign-in route from a protected route, the admin app SHALL preserve the originally requested in-app path and return to it after a successful sign-in. A preserved or otherwise supplied post-sign-in target SHALL be honored only when it is a relative path within the admin app; an absolute URL, a protocol-relative URL, or any target naming a different origin SHALL be discarded in favor of the app's default landing route.

#### Scenario: Deep link is restored after sign-in
- **WHEN** an unauthenticated caller is redirected to sign-in from a specific in-app path and then signs in successfully
- **THEN** the app returns them to that original path

#### Scenario: No preserved target defaults to the landing route
- **WHEN** a caller signs in with no preserved post-sign-in target
- **THEN** the app sends them to its default landing route

#### Scenario: An absolute or cross-origin target is not honored
- **WHEN** a post-sign-in target naming a different origin, or given as an absolute or protocol-relative URL, would otherwise be used
- **THEN** the app discards it and uses the default landing route instead

### Requirement: Sign-in proceeds according to the resulting account state
Submitting valid credentials at the sign-in route SHALL establish a session. Because the sign-in response carries no body, the admin app SHALL then determine the caller's account state from the caller's own account rather than from the sign-in response, and SHALL route a caller whose account requires a password change to the forced password-change screen, and every other caller into the app.

#### Scenario: Ordinary sign-in enters the app
- **WHEN** a caller signs in successfully and their account does not require a password change
- **THEN** the app enters the caller into the app, at the preserved deep-link target if one exists

#### Scenario: Sign-in for an account requiring a password change enters the forced-change screen
- **WHEN** a caller signs in successfully and their account requires a password change
- **THEN** the app routes them to the forced password-change screen instead of the preserved target

#### Scenario: Account state is determined from the caller's own account
- **WHEN** sign-in succeeds
- **THEN** the app reads the caller's own account to decide where to route them, rather than inferring it from the sign-in response

### Requirement: Sign-in failure is reported generically
The sign-in screen SHALL present exactly one generic failure message for any rejected sign-in attempt, regardless of whether the rejection was due to an unknown email address, an incorrect password, or rate limiting. The app SHALL NOT display a message, indicator, or delay that distinguishes a throttled attempt from an ordinary failed attempt, and SHALL NOT indicate which field, email or password, was responsible for a failure.

#### Scenario: Invalid credentials produce the generic message
- **WHEN** a sign-in attempt is rejected for an unknown email or an incorrect password
- **THEN** the app shows the same generic failure message in both cases

#### Scenario: A throttled attempt produces the same generic message
- **WHEN** a sign-in attempt is rejected because the caller has been rate limited
- **THEN** the app shows the same generic failure message it would show for an ordinary failed attempt, with no indication that throttling occurred

#### Scenario: The failure message never names a field
- **WHEN** any sign-in attempt is rejected
- **THEN** the message does not identify email or password as the specific cause

### Requirement: Refresh is single-flight
When a request to a feature route is rejected with a 403 coded `forbidden`, the admin app SHALL attempt a session refresh before giving up on that request, other than the sign-in screen's own credential submission. A 403 coded `csrf_failed` is a distinct condition and SHALL NOT trigger this refresh path — it is handled by the CSRF recovery described below, since a refresh cannot repair a CSRF mismatch. Regardless of how many requests discover a `forbidden` 403 at approximately the same time, the app SHALL have at most one refresh request in flight per session at any time, and every request that discovers one while a refresh is already in flight SHALL await that same attempt rather than starting its own. A request SHALL be retried at most once following a refresh.

#### Scenario: A single 403 triggers exactly one refresh and one retry
- **WHEN** one request to a feature route is rejected with a 403 coded `forbidden`
- **THEN** the app issues one refresh request and, if it succeeds, retries the original request exactly once

#### Scenario: Concurrent 403s share one refresh attempt
- **WHEN** multiple requests to feature routes are rejected with a 403 coded `forbidden` at approximately the same time
- **THEN** the app issues exactly one refresh request for that session, and every rejected request retries only after that one attempt resolves

#### Scenario: A request is not retried a second time
- **WHEN** a request has already been retried once following a refresh and is rejected again
- **THEN** the app does not attempt another refresh or retry for that request

#### Scenario: A CSRF failure does not trigger a refresh
- **WHEN** a request is rejected with a 403 coded `csrf_failed`
- **THEN** the app does not attempt a session refresh for it, and instead follows the CSRF recovery path described below

#### Scenario: The sign-in screen's own submission never triggers a refresh
- **WHEN** the sign-in screen's credential submission is rejected, for any reason including a 403
- **THEN** the app does not attempt a session refresh for it — a stale CSRF cookie on that same request is instead recovered via the bootstrap path below, not by refreshing

### Requirement: A CSRF failure is recovered by bootstrapping, not by refreshing
When a request, including the sign-in screen's own credential submission, is rejected with a 403 coded `csrf_failed`, the admin app SHALL recover by calling the CSRF cookie re-pairing endpoint and then retrying the original request once. Regardless of how many requests discover a `csrf_failed` 403 at approximately the same time, the app SHALL have at most one such recovery call in flight at a time, and every request that discovers one while a recovery call is already in flight SHALL await that same attempt rather than starting its own. A request SHALL be retried at most once following this recovery, and this recovery path SHALL NOT chain with the refresh path above for the same rejection — a request already retried once, by either path, is not retried again.

#### Scenario: A CSRF failure recovers via bootstrap and one retry
- **WHEN** a request to a feature route is rejected with a 403 coded `csrf_failed`
- **THEN** the app calls the CSRF cookie re-pairing endpoint and, having done so, retries the original request exactly once

#### Scenario: Sign-in recovers from a stale CSRF cookie the same way
- **WHEN** the sign-in screen's own credential submission is rejected with a 403 coded `csrf_failed`
- **THEN** the app calls the CSRF cookie re-pairing endpoint and retries the sign-in submission once — unlike a `forbidden` rejection, which the sign-in submission never attempts to recover from by refreshing

#### Scenario: Concurrent CSRF failures share one recovery call
- **WHEN** multiple requests are rejected with a 403 coded `csrf_failed` at approximately the same time
- **THEN** the app calls the CSRF cookie re-pairing endpoint exactly once, and every rejected request retries only after that one call resolves

#### Scenario: Recovery paths do not chain into an unbounded retry
- **WHEN** a request has already been retried once, whether following CSRF recovery or following a refresh
- **THEN** a further rejection of that same request does not trigger the other recovery path or any additional retry

### Requirement: A 403 after refresh is resolved by re-probing, never assumed
Because a 403 from a permission-gated route and a 403 from having no session are indistinguishable by status code alone, the admin app SHALL NOT assume which occurred. If the refresh attempt itself does not succeed, the app SHALL treat the session as gone and route the caller to sign-in without retrying the original request. If the refresh succeeds but the retried request is rejected with a 403 again, the app SHALL re-probe the caller's own account before deciding what happened: a successful re-probe SHALL be treated as a permission denial, and a failed re-probe SHALL be treated as the session being gone.

#### Scenario: A failed refresh ends the session locally
- **WHEN** the refresh request itself does not succeed
- **THEN** the app routes the caller to sign-in without retrying the original request or probing further

#### Scenario: A retry that still fails triggers a re-probe rather than a conclusion
- **WHEN** the original request is retried after a successful refresh and is rejected with a 403 again
- **THEN** the app re-probes the caller's own account before treating the failure as either a permission denial or a lost session

#### Scenario: A successful re-probe means permission denial
- **WHEN** the re-probe following a still-failing retry succeeds
- **THEN** the app shows a permission-denied outcome for that action and the caller remains signed in

#### Scenario: A failed re-probe means the session is gone
- **WHEN** the re-probe following a still-failing retry itself fails
- **THEN** the app routes the caller to sign-in

### Requirement: A pending password change confines the app to the change screen
Once a session is established, if the caller's account requires a password change, the admin app SHALL render only the forced password-change screen and SHALL NOT render any other route until the change succeeds. This determination SHALL be made from the caller's own account state, not assumed from the outcome of sign-in alone. A successful change SHALL release the restriction for the remainder of that session without requiring the caller to sign in again.

#### Scenario: A pending password change blocks navigation to any other route
- **WHEN** a signed-in caller whose account requires a password change requests any route other than the change screen
- **THEN** the app shows the change screen instead

#### Scenario: A successful change releases the restriction
- **WHEN** the caller successfully completes the password change
- **THEN** the app allows navigation to the rest of the app without requiring sign-in again

#### Scenario: The restriction is detected from the caller's own account
- **WHEN** the app decides whether to show the change screen
- **THEN** it does so from the password-change flag on the caller's own account rather than from a client-side assumption made at sign-in time

### Requirement: Sign-out ends the local session
The admin app SHALL provide a sign-out affordance reachable from within the app. Activating it SHALL call the session's sign-out endpoint, SHALL discard any locally held account state, and SHALL return the caller to the sign-in route whether or not the sign-out call itself succeeded.

#### Scenario: Sign-out calls the endpoint and returns to sign-in
- **WHEN** a signed-in caller activates sign-out
- **THEN** the app calls the sign-out endpoint and then shows the sign-in route

#### Scenario: Sign-out clears locally held account state
- **WHEN** sign-out completes
- **THEN** no previously rendered protected content or cached account state remains reachable without signing in again

#### Scenario: A failed sign-out call still returns to sign-in
- **WHEN** the sign-out endpoint call itself fails, for example due to a network error
- **THEN** the app still discards local account state and shows the sign-in route

### Requirement: Permission-aware rendering is cosmetic, never authoritative
The admin app MAY use the caller's reported permission keys and Owner status to decide which navigation items and controls to render. It SHALL NOT treat that reported state as a substitute for the server's own decision: every action SHALL still be attempted against the server, and a resulting 403 SHALL be treated as authoritative regardless of what the app had chosen to render.

#### Scenario: Reported permissions drive what is shown
- **WHEN** the caller's reported permission keys include the permission a given control requires
- **THEN** the app shows that control

#### Scenario: Absent permissions hide what would otherwise be shown
- **WHEN** the caller's reported permission keys do not include the permission a given control requires
- **THEN** the app does not show that control

#### Scenario: A rendered control is still rejected when the permission is actually absent
- **WHEN** a caller attempts an action whose control was shown because of previously reported state, and the server rejects the request as forbidden
- **THEN** the app treats the rejection as authoritative and does not treat having rendered the control as proof of access

#### Scenario: Owner sees every permission-gated affordance
- **WHEN** the caller's reported state indicates the Owner role
- **THEN** every permission-gated navigation item and control is shown, consistent with Owner satisfying every permission check
