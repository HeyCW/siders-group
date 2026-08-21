## MODIFIED Requirements

### Requirement: Partner CRUD
The system SHALL expose admin endpoints to create, list, update, and delete partners. Each partner
SHALL have a name, a logo, and an active flag defaulting to active. A website URL is optional: a
partner MAY be created and stored with no website URL.

#### Scenario: Create a partner
- **WHEN** a staff member holding `settings.manage` submits a valid name and logo
- **THEN** the system persists the partner and returns its representation including its id

#### Scenario: Create a partner with a website URL
- **WHEN** a staff member holding `settings.manage` submits a valid name, logo, and website URL
- **THEN** the system persists the partner, including the website URL, and returns its representation including its id

#### Scenario: Create a partner without a website URL
- **WHEN** a staff member holding `settings.manage` submits a valid name and logo and omits the website URL
- **THEN** the system persists the partner with no website URL, and the request is not rejected for missing it

#### Scenario: Website URL must be a valid absolute URL when supplied
- **WHEN** a staff member submits a partner with a non-empty website URL that is not a valid absolute URL
- **THEN** the system rejects the request and does not create or update the partner

#### Scenario: Admin list includes inactive partners
- **WHEN** a staff member holding `settings.manage` lists partners
- **THEN** the response includes both active and inactive partners, each with its website URL when one is stored and without one otherwise

### Requirement: A partner website URL must be http or https
A partner's website URL, when supplied, is rendered as a link target on a public page, so validity
as an absolute URL is not sufficient: the scheme SHALL be `http` or `https`. Any other scheme —
including `javascript`, `data`, `vbscript`, `file` and `mailto` — SHALL be rejected on both create
and update. The rule SHALL be enforced by the shared request contract, so the admin surface and the
API cannot diverge on it. A partner with no website URL is not subject to this rule.

#### Scenario: A script-bearing scheme is rejected
- **WHEN** a staff member submits a partner whose website URL uses the `javascript` or `data` scheme
- **THEN** the system rejects the request, creates or updates no partner, and no such value is ever
  served to the public site

#### Scenario: An ordinary web address is accepted
- **WHEN** a staff member submits a partner whose website URL uses `http` or `https`
- **THEN** the request is accepted

#### Scenario: An omitted website URL is accepted
- **WHEN** a staff member submits a partner with no website URL at all
- **THEN** the request is accepted and no scheme validation is performed

#### Scenario: The admin surface rejects an invalid scheme before submission
- **WHEN** a staff member types a website URL with a non-http(s) scheme into the partner form
- **THEN** the form reports it as invalid and does not allow the partner to be saved

### Requirement: Public partner listing serves only active partners in order
The system SHALL expose a public endpoint that returns every active partner in stored order,
including each partner's name and logo URL, and its website URL when one is stored. The endpoint
SHALL require no authentication and SHALL NOT include inactive partners.

#### Scenario: Public listing returns active partners in order
- **WHEN** a client requests the public partner listing
- **THEN** the response contains every active partner, in the stored order, each with its name and logo URL, and its website URL when one is stored

#### Scenario: A partner with no website URL is served without one
- **WHEN** the public partner listing includes a partner that has no stored website URL
- **THEN** that partner's entry in the response carries no website URL, rather than an empty string or placeholder value

#### Scenario: Inactive partners are absent from public output
- **WHEN** one or more partners are inactive
- **THEN** the public partner listing does not include them

#### Scenario: Empty directory yields an empty listing
- **WHEN** no partners are active
- **THEN** the public partner listing returns an empty collection rather than an error
