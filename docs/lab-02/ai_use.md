# AI Use

## Prompt drafting
I used Claude Sonnet 5 with thinking level medium to digest the stakeholder request and separate it to small issues.

### Actual prompt
```
how many issues should i open in this lab? whats the acceptance criteria for each issues? what should the staging branch be called?
[attached lab sheet file]
```

### Reflection
Claude separated the stakeholder requests into 10 issues that I refined down to 9 issues. The actual prompts in the following sessions for each issue is the results of this conversation with Claude.

For each issues, I prompt Claude in this conversation with this prompt
```
create a prompt for claude code for issue [issue number]
```

which I reviewed, modified, and used it to implement each issues.
## Issue 1

I used Claude Sonnet 5 with thinking level medium on Claude Code to draft the specifications, ui spec, tests.

### Actual prompt
```
You are acting as my AI specification agent for CPE 334 Lab 2 (TokTickIT Requester
Ticketing MVP). Do NOT write any implementation code in this task — this is Spec-Driven
Development only.

Goal: Produce the four required documents for docs/lab-02/:
1. specification.md — using the template in Appendix A (Sections 1-11: Sprint Goal,
   Stakeholder Request Interpretation, Scope, Functional Requirements (FR-01...),
   Business Rules (BR-01...), UI Specification Summary, Data Changes, API Contract,
   Acceptance Criteria (AC-01... in Given-When-Then style), Definition of Done,
   Assumptions and Decisions)
2. tests.md — using the template in Appendix B (Test Strategy, Planned Tests table,
   AC-to-test traceability matrix, Responsive/Visual Checklist, Test Commands, Final
   Results, Known Limitations)
3. ui-spec.md — using the checklist in Appendix C (color tokens, typography, field
   states, button hierarchy, validation placement, responsive rules, accessibility,
   screen-by-screen layout for Dev Requester Selection, Create Ticket, My Tickets,
   Ticket Detail)
4. api-spec.md — endpoint paths, HTTP methods, request/response shapes, query params
   for search/filter/sort/pagination, status codes, ownership checks, error cases

Requirements to satisfy:
- Cover Create Ticket, My Tickets, Requester Ticket Detail, and Attachment lifecycle
  (upload, download, soft-remove) for a Development Requester identity (NOT real auth —
  explicitly label it as a testing mechanism per Section 4.2/8.1)
- Explicitly EXCLUDE: authentication/login/sessions, IT Staff workflow, Public
  Comments/Internal Notes/Actions Taken, status changes beyond "New", admin functions
- Business rules must cover at minimum: ticket defaults, Requester selection/switching,
  ticket ownership, search/filter/sort/pagination, validation and duplicate-submission
  prevention, failure behavior, attachment upload/download/soft-removal, inactive
  Requesters, empty/no-results states, Ticket Detail access, transition to Lab 3 auth
- Attachment rules must be consistent with the fixed constraints: JPG/JPEG/PNG/WEBP/PDF,
  5MB max, 5 active attachments max, soft removal, removed files not downloadable
- Database design must model Development Requester, Ticket, Attachment, Category,
  Related System with the relationships in Section 5.1, and include a Prisma schema
  reflecting these
- Every Acceptance Criterion must map to at least one planned test in tests.md, with
  a real test-file path (e.g. server/tests/lab-02/create-ticket.api.test.ts)
- Zen Green theme tokens (colors, field states) must match Section 7 exactly

Process:
1. First, list any ambiguities, conflicts, or missing decisions you find in the handout
   that I need to resolve before you draft anything. Wait for my answers.
2. Then draft all four documents.
3. Flag every place where you made an assumption so I can review and approve or correct
   it — I am responsible for the final engineering contract, not you.
4. Do not proceed to implementation or write any application code after this task.
```

### Reflection
It works 95%, but leave some gaps which I have to manually bridge.

## Issue 2

I used Claude Opus 5 with thinking level medium on Claude Code to implement the requester context functionality.

### Actual prompt
```
You are my AI coding agent for CPE 334 Lab 2 (TokTickIT), working on Issue 2:
  Development Requester Context. I'm on branch feature/2-dev-requester-context off
  lab2-staging.

  Contract: Read docs/lab-02/specification.md, tests.md, ui-spec.md, and api-spec.md
  first. These are your contract — do not invent business rules that conflict with them.
  Before writing any code, list ambiguities or missing details relevant to THIS issue
  only, and wait for my answers.

  Scope for this issue ONLY — implement:
  1. The Prisma model for the Development Requester (e.g. RequesterUser), including
     active/inactive status, per specification.md's data design
  2. Idempotent seed data: at least 4 active Development Requesters and 1 inactive one,
     safe to re-run without creating duplicates
  3. API endpoint to retrieve active Development Requesters only (inactive Requesters
     must never be returned)
  4. The Development Requester Selection screen per ui-spec.md and Section 8.1 of the
     handout: title, short "testing only, not login" explanation, dropdown populated
     from the active-Requesters API, Continue button, loading state, empty state (no
     active Requesters), safe API-failure state, keyboard-accessible controls,
     responsive Zen Green styling
  5. Selected-Requester context: how the selection is stored and read across the app
     (e.g. context/provider — no cookies/sessions/JWTs, this is not authentication)
  6. App shell changes: display current Requester's name, provide a "Change Requester"
     action, and reload Requester-specific data whenever the selection changes
  7. Guard behavior: if no Requester is selected, attempted access to Requester-scoped
     screens (My Tickets, Create Ticket, Ticket Detail) redirects to the Selection screen

  Explicitly do NOT implement in this issue:
  - Ticket creation, My Tickets, Ticket Detail, or Attachment features (later issues)
  - Any real authentication: no passwords, sessions, tokens, or role-based auth
  - Anything from Lab 3 scope

  Test-first: Before implementing, write the failing tests from tests.md that cover this
  issue's planned scenarios (active-Requester API, inactive-Requester exclusion
  state, API-failure state, selection persistence, redirect-when-unselected). Confirm
  they fail for the expected reason, then implement the smallest correct behavi
  make them pass.

  When done, report:
  - Which Acceptance Criteria and planned tests from tests.md this issue satisf
  - Any deviations from ui-spec.md or api-spec.md and why
  - Any assumptions you made that I need to review and approve
```

### Reflection
Almost one shot it.  But the agent asked some questions back to clarify the requirements and decisions. Such as routing library, testing library, and refactoring decision.

## Issue 3

I used Claude Opus 5 with thinking level medium on Claude Code to draft up the database schema.
### Actual prompt
```
You are my AI coding agent for CPE 334 Lab 2 (TokTickIT), working on Issue 3:
Database Schema. I'm on branch feature/3-database-schema off lab2-staging.

Contract: Read docs/lab-02/specification.md and api-spec.md first, specifically the
Data Changes and API Contract sections. These are your contract — do not invent
fields, relationships, or constraints that conflict with them. Before writing any
code, list ambiguities or missing details relevant to THIS issue only, and wait for
my answers.

Note: Issue 2 (Development Requester context) is being worked in parallel on a
different branch and will also touch schema.prisma (adding the RequesterUser model).
Design this schema so the two are structurally compatible — Ticket must have a
foreign key relationship to the Requester model, but do not implement or duplicate
the RequesterUser model itself in this issue; assume it exists.

Scope for this issue ONLY — implement:
1. Prisma models for: Ticket, Attachment, Category, RelatedSystem — per the data
   design in specification.md
2. Required relationships (Section 5.1 of the handout):
   - one Requester owns many Tickets (FK to Requester, not implemented here)
   - one Ticket belongs to one Requester
   - one Ticket may contain many Attachments
   - one Category is used by many Tickets
   - one Related System is used by many Tickets
3. Fields needed to support the full API contract: official Ticket Number (unique,
   backend-generated), Current Status (defaulting to "New"), Requested Priority,
   Summary, Description, timestamps (createdAt/updatedAt), and any IT Priority /
   Ticket Owner fields the spec calls for as read-only/system fields
4. Attachment model fields: original filename, safe storage filename/path, MIME
   type, size, uploadedAt, and soft-removal fields (e.g. removedAt, removalReason) —
   soft-removed attachments must remain queryable as metadata but excluded from
   download/preview
5. Indexes and constraints per specification.md's justified decisions: unique
   constraint on Ticket Number, foreign keys on all relationships, indexes on
   fields used for search/filter/sort (e.g. Current Status, Category, createdAt),
   and nullability rules for optional fields
6. Category and RelatedSystem as reference tables (not enums), each with an active/
   inactive flag consistent with how Requester active status works
7. A Prisma migration reflecting all of the above
8. Idempotent seed data for:
   - the 4 required Categories: Account and Access, Hardware, Software, Network
   - at least 6 realistic Related Systems (e.g. Email, Campus Wi-Fi, VPN, LEB2 App,
     Grade Submission App, Printer, Corporate Laptop)
   - safe to re-run without creating duplicates (upsert by a natural unique key,
     not by auto-increment id)

Explicitly do NOT implement in this issue:
- The RequesterUser/Development Requester model or its seed (owned by Issue 2)
- Any API endpoints, controllers, or routes
- Any frontend code
- Ticket creation, listing, detail, or attachment upload/download logic

Test-first: Before finalizing the schema, write the planned unit/integration tests
from tests.md that validate schema-level constraints for this issue (e.g. Ticket
Number uniqueness enforcement, cascading/restrict behavior on delete, seed
idempotency, required-field nullability). Confirm they fail against an empty schema,
then implement the migration to make them pass.

When done, report:
- Which Acceptance Criteria and planned tests from tests.md this issue satisfies
- Any deviations from specification.md's data design and why
- Any assumptions you made (e.g. cascade behavior, index choices) that I need to
  review and approve
- A note on where the Requester foreign key is stubbed/expected so Issue 2 can be
  merged in cleanly
```

### Reflection
Initially, I was working on issue 2 and 3 at the same time (which is why the prompt mentioned issue 2) but the agent working on issue 3 raise the issue that we might run into conflicts. So I waited for issue 2's PR to be merged first, then worked on this PR.

I don't know if it's related to the model, my prompts being too long, or what. Opus is supposed to be better than Sonnet but I have never had any issue with Sonnet. So the agent did something confusing (e.g. checked out new branch while they're already on specified branch)

Other than that, the results is good.

## Issue 4

I used Claude Sonnet 5 with thinking level medium on Claude Code to implements the API part of ticket creation flow.

### Actual prompt
```
You are my AI coding agent for CPE 334 Lab 2 (TokTickIT), working on Issue 4:
Ticket Creation API. I'm on branch feature/4-ticket-creation-api off lab2-staging,
which already has the RequesterUser model/seed (Issue 2) and the Ticket/Attachment/
Category/RelatedSystem schema (Issue 3) merged in.

Contract: Read docs/lab-02/specification.md and api-spec.md first, specifically the
Functional Requirements, Business Rules, and API Contract sections covering ticket
creation and reference data. These are your contract — do not invent validation
rules, defaults, or response shapes that conflict with them. Before writing any code,
list ambiguities relevant to THIS issue only, and wait for my answers.

Scope for this issue ONLY — implement these API endpoints:
1. GET active Categories — returns only active Categories
2. GET active Related Systems — returns only active Related Systems
3. POST /api/tickets (or the path defined in api-spec.md) — create one Ticket:
   - Accepts requesterId, category, relatedSystem, summary, description,
     requestedPriority per the request shape in api-spec.md
   - Backend generates the official Ticket Number — must be unique (BR-01)
   - New Ticket defaults to Current Status "New" (BR-02)
   - Server-side validation must enforce the same rules as the frontend will
     (required fields, length limits on Summary/Description, allowed
     requestedPriority values) — do not trust client-side validation alone
   - Reject creation for a requesterId that doesn't exist or belongs to an
     inactive Requester
   - Reject creation for an invalid/inactive Category or Related System
   - Return 201 with the created Ticket (including generated Ticket Number) on
     success
   - Return 400 with field-level validation errors on invalid input — response
     shape must let the frontend map errors to specific fields
   - Handle duplicate-submission prevention per whatever rule specification.md
     defines (e.g. idempotency key, or rely on frontend disabling submit — follow
     the spec's decision, don't invent a new one)

Explicitly do NOT implement in this issue:
- Attachment upload (belongs to Issue 5's Create Ticket UI or Issue 7's Attachment
  lifecycle — check api-spec.md for which endpoint owns it, and flag if unclear)
- The Create Ticket frontend screen (Issue 5)
- My Tickets, Ticket Detail, or attachment download/soft-removal (Issues 6, 7)
- Any authentication — requesterId comes from the Development Requester context,
  not a session

Test-first: Before implementing, write the failing API tests from tests.md that
cover this issue (valid creation → 201 + unique Ticket Number, missing required
field → 400, invalid/inactive Category or Related System → 400, inactive
Requester → rejected, reference-data endpoints exclude inactive rows). Confirm
they fail for the expected reason, then implement the smallest correct behavior to
make them pass.

When done, report:
- Which Acceptance Criteria and planned tests from tests.md this issue satisfies
- Any deviations from api-spec.md's request/response shapes and why
- Any assumptions you made (e.g. duplicate-submission strategy, Ticket Number
  format) that I need to review and approve
```

### Reflection
Works fine. Just some problem with test which the agent fixed when prompted.

## Issue 5

I used Claude Sonnet 5 with thinking level medium on Claude Code to create ticket creating ui.

### Actual prompt
```
You are my AI coding agent for CPE 334 Lab 2 (TokTickIT), working on Issue 5:
Create Ticket UI. I'm on branch feature/5-create-ticket-ui off lab2-staging, which
already has the Development Requester context (Issue 2), the schema (Issue 3), and
the Ticket creation + reference-data APIs (Issue 4) merged in.

Contract: Read docs/lab-02/specification.md, ui-spec.md, and api-spec.md first,
specifically the Create Ticket screen layout, component rules, and required fields.
These are your contract — do not invent field arrangements, validation copy, or
states that conflict with them. Before writing any code, list ambiguities relevant
to THIS issue only — including whether attachment upload happens inline during
Ticket creation or only after the Ticket exists, per api-spec.md — and wait for my
answers.

Scope for this issue ONLY — implement:
1. The Create Ticket screen per ui-spec.md and handout Section 8.2/8.3:
   - System-generated/read-only fields (Ticket Number, Ticket Date, Requester)
     visually distinct from editable fields
   - Category and Related System as dropdowns populated from the reference-data
     APIs (Issue 4)
   - Requested Priority selector
   - Summary and Description with sufficient width/height, Description resizable
     without breaking layout
   - Attachments section: file picker restricted to JPG/JPEG/PNG/WEBP/PDF, 5MB max
     per file, max 5 files, with clear client-side rejection messages for invalid
     type/size/count (server-side enforcement already exists or belongs to Issue 4/7
     per your ambiguity check above)
   - Labels above controls, required-field red asterisks, validation messages
     directly below the associated field (not a single top-level error banner)
   - Primary Submit action and secondary Cancel action at the bottom
2. Required screen states: initial, loading (reference data), validation-failure,
   submitting (Submit button shows busy state and is disabled), success (displays
   the generated Ticket Number and a clear next action), and API-failure (safe
   error message, form values preserved — do not clear the form on failure)
3. Requester field auto-populated from the current Development Requester context
   (Issue 2) — not user-editable
4. Responsive behavior per Section 8.7: desktop ≥992px multi-column, tablet
   768-991px two-column, mobile <768px fields stack vertically with no horizontal
   scroll
5. Zen Green styling tokens from Section 7 / ui-spec.md: primary/secondary green,
   pale green, editable vs read-only field shading, error/warning/success styles
6. Keyboard accessibility: all controls reachable and operable via keyboard, visible
   focus indicators, accessible labels on any icon-only controls

Explicitly do NOT implement in this issue:
- The Ticket creation API itself (already done in Issue 4 — call it, don't
  duplicate its validation logic)
- My Tickets or Ticket Detail screens (Issues 6, 7)
- Attachment download or soft-removal UI (Issue 7)
- Any authentication UI

Test-first: Before implementing, write the failing UI component tests from tests.md
for this issue (e.g. submit without Summary shows field message and does not call
the API; busy state disables Submit; invalid attachment type/size shows rejection
message; success state displays the returned Ticket Number). Confirm they fail for
the expected reason, then implement the smallest correct behavior to make them pass.
Also capture the Playwright screenshots required for Section 8.8 (desktop, tablet,
mobile) once the screen is stable.

When done, report:
- Which Acceptance Criteria and planned tests from tests.md this issue satisfies
- Any deviations from ui-spec.md's layout or component rules and why
- Any assumptions you made (e.g. exact attachment-upload timing/flow) that I need
  to review and approve
```

### Reflection
Left some gap which was caught in PR review process. Fixed in one prompt.

## Issue 6

I used Claude Sonnet 5 with thinking level medium on Claude Code to implement my ticket part.

### Actual prompt
```
You are my AI coding agent for CPE 334 Lab 2 (TokTickIT), working on Issue 6:
My Tickets. I'm on branch feature/6-my-tickets off lab2-staging, which already has
the Development Requester context (Issue 2) and the Ticket/Attachment/Category/
RelatedSystem schema (Issue 3) merged in.

Contract: Read docs/lab-02/specification.md, ui-spec.md, and api-spec.md first,
specifically the sections on the Ticket-list query contract, ownership, and the My
Tickets screen layout. These are your contract — do not invent query-parameter names,
default sort order, or column choices that conflict with them. Before writing any
code, list ambiguities relevant to THIS issue only — including exactly which columns/
card fields are final, and whether Ticket creation (Issue 4) is merged yet or you need
to seed test Tickets directly for this issue's tests — and wait for my answers.

Scope for this issue ONLY — implement:
1. GET Ticket-list API per api-spec.md:
   - Returns only Tickets owned by the currently selected Requester (ownership
     enforced server-side, not just filtered client-side) — a request for another
     Requester's tickets must never leak data
   - Supports search (per the searchable fields defined in api-spec.md, e.g. Ticket
     Number, Summary), filters (Category, Requested Priority, IT Priority, Current
     Status), sorting (with defined default and secondary sort), and pagination
     (page number, page size, with permitted page sizes and invalid-parameter
     behavior as documented)
   - Returns pagination metadata (total count, current page, total pages) per the
     documented response shape
   - Invalid query parameters handled safely (e.g. ignored or defaulted, not a 500)
2. My Tickets screen per ui-spec.md and handout Section 8.4:
   - Search box, filter controls (Category, Requested Priority, IT Priority,
     Current Status), sortable columns, pagination controls, Clear Filters action,
     Create Ticket navigation action
   - Table/list columns sufficient to identify and open a Ticket (Ticket Number,
     Summary, Category, Requested Priority, IT Priority, Current Status, Ticket
     Owner, Last Updated, or your team's justified final set from ui-spec.md)
   - Loading state while fetching
   - Empty state (Requester has zero Tickets at all) distinct from no-results state
     (filters/search return nothing) — these must not look identical
   - Safe API-failure state
   - Clicking/tapping a row navigates toward Ticket Detail (Issue 7 owns the detail
     screen itself — just wire the navigation)
3. Desktop table vs. mobile card/responsive-table behavior per Section 8.7 and 8.8
4. Badge styling for Requested Priority, IT Priority, and Current Status consistent
   with Zen Green tokens — badges must not rely on color alone (include text)
5. Behavior when the Development Requester is changed: the ticket list reloads and
   reflects only the newly selected Requester's Tickets (cross-Requester isolation)

Explicitly do NOT implement in this issue:
- The Ticket Detail screen itself (Issue 7) — only the navigation link/route to it
- Ticket creation logic (Issue 4) — if it isn't merged yet, seed test Tickets
  directly in the database for this issue's own tests
- Attachment display or management (Issue 7)
- Any authentication

Test-first: Before implementing, write the failing tests from tests.md for this
issue: ownership isolation (Requester B never sees Requester A's tickets), search/
filter/sort/pagination behavior, empty state vs. no-results state, invalid query
params handled safely, and Requester-switch reload behavior. Confirm they fail for
the expected reason, then implement the smallest correct behavior to make them pass.
Capture responsive screenshots (desktop table / mobile card view) once stable.

When done, report:
- Which Acceptance Criteria and planned tests from tests.md this issue satisfies
  (especially the AC-03-style ownership criterion)
- Any deviations from api-spec.md's query contract or ui-spec.md's layout and why
- Any assumptions you made (e.g. final column set, default sort) that I need to
  review and approve
```

### Reflection
The agent asks some questions to clarify some inconsistencies with the specification, other than that it worked by itself and required little correction, just some issue with seed script it generated which violate the constraints, and some routes not perfectly matching the spec, which is caught in PR review process.

## Issue 7

I used Claude Sonnet 5 with thinking level medium on Claude Code to implement ticket details page.

### Actual prompt
```
You are my AI coding agent for CPE 334 Lab 2 (TokTickIT), working on Issue 7:
  Requester Ticket Detail and Attachment Lifecycle. I'm on branch
  feature/7-ticket-detail-attachments off lab2-staging.

  Status: Issues 1-5 are already merged into lab2-staging — this includes the
  Development Requester context (Issue 2), the Ticket/Attachment/Category/
  RelatedSystem schema (Issue 3), the Ticket creation API (Issue 4), and the Create
  Ticket UI (Issue 5). This means real Tickets can already be created end-to-end
  through the app — you do not need to seed fake Tickets manually for testing; use
  the existing Create Ticket flow (or its API directly) to produce test data.

  Issue 6 (My Tickets) may be in progress in parallel on a different branch. Do not
  depend on it — this issue must stand alone and only needs a Ticket ID to operate
  on (e.g. navigated to directly, or via a test fixture/API call), not the My Tickets
  list itself.

  Contract: Read docs/lab-02/specification.md, ui-spec.md, and api-spec.md first,
  specifically the sections on Ticket Detail retrieval, ownership, and the full
  Attachment lifecycle (upload, metadata, download, soft removal). These are your
  contract — do not invent removal-permission rules, storage behavior, or response
  shapes that conflict with them. Before writing any code, list ambiguities relevant
  to THIS issue only — including exact required Attachment metadata and safe-filename
  strategy — and wait for my answers.

  Scope for this issue ONLY — implement these API endpoints and the UI:
  1. GET one owned Ticket (Ticket Detail) — must enforce ownership server-side: a
     request for a Ticket belonging to a different Requester must be rejected (not
     just hidden in the UI), matching the AC-03-style ownership rule
  2. POST attachment upload to an existing Ticket:
     - Enforce allowed types (JPG/JPEG, PNG, WEBP, PDF), 5MB max size, max 5 active
       attachments per Ticket — server-side, not just client-side
     - Store using a safe filename/storage strategy (not the raw user-supplied
       filename) and record original filename, MIME type, size, uploadedAt as
       metadata
     - Reject upload to a Ticket not owned by the current Requester
     - Define and implement the failure/compensation behavior if the Ticket exists
       but the attachment write fails (per specification.md's decision)
  3. GET attachment metadata (for display) — soft-removed attachments must still
     appear as metadata
  4. GET attachment download for an active (non-removed) attachment only — a removed
     attachment must return a safe rejection, never the file
  5. Soft-remove an attachment:
     - Enforce removal permissions (only the owning Requester can remove their own
       attachment) per specification.md
     - Record removal metadata (e.g. removedAt, removal reason if required by spec)
     - Removed attachment must remain visible as metadata but become undownloadable
       and unpreviewable
  6. Requester Ticket Detail screen per ui-spec.md and handout Section 8.5:
     - All Ticket fields presented read-only, clearly grouped and distinct from
       Attachment actions
     - Attachment section showing active attachments with download/preview actions,
       an "add attachment" control (reuse the same validation rules/component
       already built in Issue 5's Create Ticket UI where practical), and a remove
       action per attachment with the required confirmation/reason step
     - Removed attachments displayed distinctly (e.g. greyed out, "Removed" label) —
       not hidden, and not offering download/preview
     - Loading, empty (no attachments), and API-failure states
     - Responsive layout per Section 8.7 (desktop/tablet/mobile)
     - Do NOT implement Public Comments, Internal Notes, Actions Taken, or any
       status-change controls — this is explicitly out of scope per Section 4.2/8.5

  Explicitly do NOT implement in this issue:
  - The My Tickets list itself (Issue 6, separate/parallel branch) — only assume you
    can reach Ticket Detail via a direct route/Ticket ID
  - Any authentication
  - Any IT Staff-side attachment or ticket controls

  Test-first: Before implementing, write the failing tests from tests.md for this
  issue: ownership enforcement on Ticket Detail and attachment access, valid vs.
  invalid attachment upload (type/size/count), download rejected for removed
  attachments, soft-removal permission and metadata retention, and empty/loading/
  failure states. Use the real Ticket creation API/flow from Issue 4/5 to set up
  test fixtures rather than inserting raw seed rows, where practical. Confirm tests
  fail for the expected reason, then implement the smallest correct behavior to make
  them pass. Capture responsive screenshots once stable.

  When done, report:
  - Which Acceptance Criteria and planned tests from tests.md this issue satisfies
    (especially unauthorized ticket/attachment access cases)
  - Any deviations from api-spec.md's attachment contract or ui-spec.md's layout and
    why
  - Any assumptions you made (e.g. storage backend, removal-reason requirement) that
    I need to review and approve
  - Any merge-conflict risk you anticipate with Issue 6, if that branch touches
    shared components (e.g. Ticket-row rendering, navigation) you also touch here
```

### Reflection
The agent came up with its design and asked me for confirmation, I reviewed it and its ok, just some modification needed (the agent proposed using native <dialog/> component, I prefer it use Bootstrap modal instead).

## Issue 8

I used Claude Sonnet 5 with thinking level medium on Claude Code to verify and polish the UI to conform to Zen Green scheme and responsive design.

### Actual prompt
```
You are my AI coding agent for CPE 334 Lab 2 (TokTickIT), working on Issue 8 (GH issue #23):
  Zen Green Styling and Responsive Pass. I'm on branch
  feature/8-responsive-visual-polish off lab2-staging.

  Status: Issues 1-7 are already merged into lab2-staging. The Development Requester
  Selection screen, Create Ticket screen, My Tickets screen, and Requester Ticket
  Detail (with Attachments) all exist and function end-to-end. This issue does NOT
  add new functionality — it audits and polishes the existing screens against
  ui-spec.md and the Zen Green Theme, and produces the required visual evidence.

  Contract: Read docs/lab-02/ui-spec.md first, specifically the color tokens,
  typography, spacing, component states (editable/read-only/invalid/disabled/
  focused), button hierarchy, validation placement, and responsive rules (Section
  8.7 and 8.8 of the handout). Also re-check Section 7 of the handout (Zen Green
  Theme table) directly. Before making changes, list every screen/component where the
  CURRENT implementation deviates from ui-spec.md or the handout's Zen Green table,
  and wait for my confirmation before fixing each one — do not silently redesign
  anything that already matches spec.

  Scope for this issue ONLY:
  1. Audit and correct color tokens across all four screens (Selection, Create
     Ticket, My Tickets, Ticket Detail) against:
     - Primary green #006B3C (header, primary actions, strong emphasis)
     - Secondary green #0B7A46 (active tabs, focus accents, links, hover)
     - Pale green #EAF6EF (selected/success/subtle emphasis)
     - Page background #F5F7F6
     - Editable field: white bg, clear neutral border
     - Read-only field: soft gray-green or warm ivory, clearly distinct but readable
     - Error: dark red text/border, message directly below field
     - Warning: amber callout/badge, not used as ordinary decoration
     - Success: green confirmation, readable text, not relying on color alone
  2. Audit button hierarchy consistency (primary/secondary/tertiary/destructive/
     disabled/busy) across all screens — same visual language everywhere, not
     reinvented per screen
  3. Verify validation-message placement is consistent (directly below the field,
     not a single top-of-form banner) on every form across the app
  4. Verify badge styling for Requested Priority, IT Priority, and Current Status is
     visually consistent between My Tickets (list/table) and Ticket Detail, and does
     not rely on color alone (text label present)
  5. Run through responsive breakpoints on every screen:
     - Desktop ≥992px: multi-column, content centered with sensible max-width
     - Tablet 768-991px: two-column where practical, Summary/Description get
       sufficient width
     - Mobile <768px: fields stack vertically, buttons remain touch-friendly, NO
       horizontal page scrolling
     Fix any clipped labels, overlapping messages, hidden buttons, or unreadable
     attachment names at any size
  6. Verify keyboard focus indicators are visible on all interactive controls across
     all four screens (not just the ones built most recently)
  7. Verify every icon-only control has an accessible label and tooltip
  8. Capture Playwright screenshots at desktop, tablet, and mobile viewport sizes for
     Create Ticket, My Tickets, and Ticket Detail, saved to artifacts/lab-02/
     screenshots/{create-ticket,my-tickets,ticket-detail}/ per the required repo
     structure
  9. Produce a short visual checklist (for tests.md's Responsive and Visual
     Checklist section) confirming: no clipping, no overlap, no unintended
     horizontal scrolling, consistent field styling, and all required states present

  Explicitly do NOT implement in this issue:
  - New functionality, new endpoints, or new fields — this is a polish/audit pass
    only
  - Changes to business logic, validation rules, or API contracts
  - New screens

  Test-first: Before making visual fixes, write or extend the Playwright
  visual/responsive tests from tests.md that assert the required CSS classes, field
  states, and absence of horizontal overflow at each breakpoint. Confirm they fail
  against the current implementation where a real deviation exists, then fix the
  minimum needed to make them pass — do not change things that already pass.

  When done, report:
  - The list of deviations found and fixed, screen by screen
  - Which planned visual/responsive tests from tests.md now pass
  - Screenshot paths captured for each screen at each viewport size
  - Any ui-spec.md ambiguity you had to resolve, for my review

  /frontend-design:frontend-design /caveman /design-taste-frontend
```

### Reflection
This time, I invoked some skills to go along with my main prompts. The results is good, UI is clean.

## Issue 9

I used Claude Sonnet 5 with thinking level medium on Claude Code to create E2E tests from specifications.

### Actual prompt
```
You are my AI coding agent for CPE 334 Lab 2 (TokTickIT), working on issue 9 of this sprint (GitHub Issue
  #24): Final Test Consolidation, Traceability, and Release Integration. I'm on branch
  feature/24-release-integration off lab2-staging.

  Status: Issues 1-8 are already merged into lab2-staging. All required screens
  (Development Requester Selection, Create Ticket, My Tickets, Requester Ticket
  Detail with Attachments) exist, function end-to-end, and have been styled/audited
  for responsiveness. This is the final issue before the release PR from
  lab2-staging to main.

  Contract: Read docs/lab-02/specification.md, tests.md, ui-spec.md, and api-spec.md
  in full. This issue does not add new product functionality — it proves completion
  against the full contract and prepares the repository for submission. Before
  making changes, list any Acceptance Criteria or planned tests you cannot currently
  find evidence for, and wait for my input before treating anything as "already
  done."

  Note: docs/lab-02/ai-use.md is NOT part of this issue — I am writing that myself.
  Do not create, edit, or touch that file.

  Scope for this issue:

  1. Test Suite Consolidation and Traceability
     - Go through every Acceptance Criterion (AC-01, AC-02, ...) in specification.md
       and confirm it maps to at least one actual, passing, non-skipped automated
       test with a real file path
     - Update tests.md's Planned Tests table and AC-to-test traceability matrix to
       reflect the FINAL state: test ID, type, AC reference, what it tests, expected
       result, actual test file path, and pass/fail status
     - Run the full test suite (unit, API/integration, UI component, E2E) from a
       clean clone of main and record the actual commands and output in tests.md's
       Test Commands and Final Results sections
     - Flag and fix any test that is skipped, disabled, commented out, or flaky —
       do not report completion with any such test remaining
     - Document any genuinely deferred test in tests.md's Known Limitations section,
       with justification

  2. Screenshot Audit (do this explicitly, do not assume prior issues captured
     everything)
     - Cross-reference every screenshot requirement in the handout's Section 14
       submission table against what currently exists in
       artifacts/lab-02/screenshots/:
       * Create Ticket: initial, validation failure, submitting, success, API
         failure, invalid-attachment state, Development Requester Selection screen,
         active-user dropdown, selected-user display, Change Requester action,
         loading state, failure state
       * My Tickets: Requester A's list, Requester B's list showing A's tickets
         gone, search, filters, sorting, pagination, empty state, no-results state
       * Ticket Detail + Attachments: owned Ticket Detail, add attachment, download
         active attachment, soft removal with reason, retained metadata, blocked
         removed-download attempt, unauthorized ticket-access rejection
       * Responsive: desktop, tablet, and mobile views of Create Ticket, My
         Tickets, and Ticket Detail (per Section 8.8/9 visual checklist)
     - For anything missing, incomplete, outdated (e.g. captured before an Issue 8
       styling fix), or not readable without extreme zoom, use Playwright to
       capture it now at the correct viewport size and save it to the correct
       artifacts/lab-02/screenshots/ subfolder
     - Produce a short checklist in tests.md's Responsive and Visual Checklist
       section listing every required screenshot and its final file path, so
       nothing required by Section 14 is missing at submission time

  3. Repository Documentation
     - docs/lab-02/reviewer.md: reviewer identity, PR links, comments given and
       received, responses, and approvals across all merged Issues — rendered and
       complete
     - README: current setup and test-run instructions, verified against a clean
       clone (don't just assume old instructions still work after all the merges)
     - Confirm .gitignore is appropriate (no node_modules, .env, uploaded
       attachments, etc. committed)

  4. Definition of Done Verification (Part 1: Product Completion, per Section 13.1)
     - Confirm all approved scope is implemented, all AC satisfied with test
       evidence, no required test skipped/disabled, screens/APIs conform to the
       approved contract, and setup/usage docs are current
     - Update specification.md's Definition of Done checklist to reflect the
       verified final state

  5. Release Integration
     - Confirm the GitHub Project Kanban shows every Issue in Done
     - Open the single release Pull Request from lab2-staging to main
     - Do not merge it yourself — flag it for my review and manual merge

  Explicitly do NOT implement in this issue:
  - Any new product feature, endpoint, or screen
  - docs/lab-02/ai-use.md (mine to write)
  - Any change to business logic or validation rules discovered late — if you find
    a real contract violation, report it to me first rather than silently patching
    it as part of this "documentation" issue

  When done, report:
  - Full AC-to-test traceability status (any AC without passing test evidence)
  - The screenshot audit results: what already existed vs. what you had to capture
    with Playwright in this issue, with file paths
  - Any Definition of Done item that is NOT yet satisfied
  - Confirmation of the release PR link, and any file you believe I should review
    personally before merging
```

### Reflection
Worked in one shot. Installed Playwright, set it up, and gathered screenshots for me with almost no mistake.
