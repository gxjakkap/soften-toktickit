# AI Use

## Prompt drafting
I used Claude Sonnet 5 with thinking level medium to digest the stakeholder request and separate it to small issues.

### Actual prompt
```
this is a lab sheet for lab 3 of cpe334, try recalling your memory for lab 2 planning. i want you to plan out the issues to develop in this sprint from the requirements from stakeholders (leave out updating ai_use.md and reviewer.md). plan out how many issues we split this sprint into, what should be the branch names (this sprint onwards we will use lab3/feat/{idx_from_1}-{name}), etc.
[attached lab sheet file]
```

### Reflection
Claude separated the stakeholder requests into 10 issues that I refined down to 9 issues. The actual prompts in the following sessions for each issue is the results of this conversation with Claude.

For each issues, I prompt Claude in this conversation with this prompt
```
can i get a prompt for issue [issue number], mention that if the agent want to ask question, use AskUserQuestion, the pr for this issue should be named "[Lab 3] [issue number]: [issue name]"
```

which I reviewed, modified, and used it to implement each issues.

## Issue 1

I used Claude Sonnet 5 with thinking level medium on Claude Code to draft the specifications, ui spec, tests.

### Actual prompt
```
We're starting Lab 3 (CPE 334, TokTickIT project) — Issue #1: "Sprint 3 engineering contract."

  First, create and switch to a new branch: lab3/feat/1-engineering-contract

  Your task is to write the Sprint 3 engineering specification as three files:
  - docs/lab-03/specification.md
  - docs/lab-03/ui-spec.md
  - docs/lab-03/api-spec.md

  Before writing anything, read the existing Lab 2 codebase (schema, API routes, and frontend Ticket/Requester screens) so the spec is consistent with what's already built and doesn't break it. Also check docs/lab-02/ (or wherever Lab 2's spec lives) for the format/style to match.

  Lab 3 scope, in my own words:
  - Replace the temporary Development Requester selector with real email/password authentication and role-based authorization (Requester, IT Staff, Administrator).
  - Users with an initial password must change it at first login before reaching the app.
  - Requesters keep all Lab 2 ticket functions, now scoped to their authenticated identity, plus Public Comments and a "Problem Appears Resolved" action.
  - IT Staff get a Ticket Queue (search/filter/sort/pagination) and a Ticket Detail view: claim/reassign ownership, set IT Priority, change status, post Public Comments, write Internal Notes.
  - Administrators get one minimalist User Management screen: list/search/filter users, create a user with one role, edit name/email/role/active state, set a new initial password, with safety rules (no duplicate emails, can't deactivate self, can't remove the last active Administrator).
  - Explicitly excluded: email invites/reset flows, MFA, SSO, self-registration, multi-role users, user deletion/bulk ops, pagination beyond basics, department/org structures, Actions Taken (deferred to Lab 4).

  For docs/lab-03/specification.md, use exactly these sections, numbered internally where noted:
  1. Sprint Goal — one paragraph.
  2. Stakeholder Request — your own concise interpretation, not a copy of the handout.
  3. Scope — included / explicitly excluded, bulleted.
  4. Functional Requirements — numbered FR-01, FR-02... covering authentication, authorization, IT Staff operations, comments/notes, and Administrator user management.
  5. Business Rules — numbered BR-01, BR-02... Start from the five example BRs already given (auth validity, mandatory password change, requester-identity-from-auth-not-client, public/internal visibility, requester-can't-formally-resolve) and extend to cover: login attempts, password handling, logout, inactive users, duplicate emails, current-user behavior, ticket ownership, IT Staff assignment, IT Priority, status transitions, comment/note validation, and all Administrator safety rules listed in the handout.
  6. UI Specification Summary — screen list, modes (create/view/edit), controls, feedback states, role-based behavior, responsive rules; point to ui-spec.md for detail.
  7. Data Changes — models/fields/relationships/indexes/migration/seed decisions (Prisma).
  8. API Contract — summarize endpoints, auth mechanism, request/response shapes, status codes; point to api-spec.md for detail.
  9. Acceptance Criteria — numbered AC-01, AC-02... observable/testable, extending the four examples given (login success, password-change gate, requester ownership can't be spoofed, Requester forbidden from Internal Notes). Cover the full approved scope — every FR/BR should map to at least one AC.
  10. Definition of Done — a checklist the coding agent must satisfy before reporting completion.
  11. Assumptions and Decisions — only the meaningful choices not already fixed by the handout (e.g. session vs token strategy, password hashing algorithm, pagination page size, queue default sort).

  For docs/lab-03/ui-spec.md: describe each required screen (Login, Change Password, authenticated shell, Requester Ticket Detail w/ Public Comments, IT Staff Ticket Queue, IT Staff Ticket Detail, Admin User Management) — its modes, fields, editable vs read-only styling, loading/success/validation/empty/no-results/forbidden/failure states, and the desktop vs mobile/tablet layout differences. Keep it consistent with the existing Zen Green design tokens/components from Lab 2 — don't invent a new visual system.

  For docs/lab-03/api-spec.md: define exact endpoint paths, HTTP methods, request/response JSON shapes, auth mechanism (cookies vs bearer token — pick one and justify it), status codes for each error case, and the Ticket Queue's searchable/filterable/sortable fields, default ordering, and pagination shape.

  Do not copy the handout text verbatim — synthesize and resolve ambiguities yourself, flagging any real judgment calls in section 11. Do not implement any code yet — this issue is docs only.

  Once all three files are written, commit them on this branch with a message like "docs: sprint 3 engineering contract (specification, ui-spec, api-spec)" and open a PR against lab3-staging titled "Issue #1: Sprint 3 engineering contract" with a summary of the key decisions made in section 11.

  Also, move issue #35 to PR review after opening the PR, and when creating the PR, add issue #35 to the related issue part. also pass the description through unslop first. if you have any question, use AskUserQuestion to ask me.
```

### Reflection
Leave some gaps that has been caught in PR review process.

## Issue 2

I used Claude Sonnet 5 with thinking level medium on Claude Code to implement the database schema and migrations to support user and authentication.

### Actual prompt
```
We're continuing Lab 3 (CPE 334, TokTickIT project) — Issue #2: "DB migration: Users & auth model."

  First, create and switch to a new branch: lab3/feat/2-db-migration-auth

  Read docs/lab-03/specification.md, ui-spec.md, and api-spec.md (from Issue #1) first — your migration must match the data model and decisions already approved there, not just the raw handout. Also read the existing Lab 2 Prisma schema and seed script so you evolve them without breaking existing Ticket/Attachment data.

  Your task:

  1. Prisma schema changes
     - Add a User model: id, name, email (unique), hashed password, role (enum: Requester, IT_Staff, Administrator), isActive (boolean), requiresPasswordChange (boolean), timestamps. One role per user — no join table for multiple roles.
     - Migrate the existing Ticket ownership relation: replace the temporary Development Requester identity with a proper foreign key to User (requesterId). Add a nullable ticketOwnerId FK to User for IT Staff/Administrator ownership (a Ticket may be unassigned).
     - Add models for Public Comment and Internal Note: content, authorId (FK to User), ticketId (FK to Ticket), createdAt. Both append-only — no update/delete fields needed.
     - Add whatever IT Priority / status fields are still missing per the approved spec (check specification.md — don't duplicate fields Lab 2 already has).
     - Add appropriate indexes (email uniqueness, ticket lookups by owner/requester/status).
     - Never store passwords in plaintext — use a hashing approach consistent with what api-spec.md specifies (bcrypt/argon2, etc. — check the spec's decision in section 11 before picking one yourself).
  2. Migration from Lab 2 data
     - Write the Prisma migration so existing Tickets/Attachments are preserved and their ownership correctly points at real User records afterward, not the old dev-requester mechanism.
     - Document the migration approach (how old Development Requester records become real Users, how existing Ticket ownership is preserved) in a short section you add to docs/lab-03/specification.md under "Data Changes" if not already detailed there.
  3. Seed script (idempotent — safe to re-run without duplicating data)
     - At least 4 active Requester accounts + 1 inactive Requester account
     - At least 3 active IT Staff accounts + 1 inactive IT Staff account
     - At least 1 active Administrator account
     - Realistic seeded Tickets distributed across Requesters, statuses, priorities, and assigned/unassigned ownership
     - A handful of example Public Comments and Internal Notes (no sensitive info)
     - Clearly document in the seed file or a README that these are local-dev-only credentials, never real secrets
  4. Tests
     - Add or update Prisma/migration tests confirming: existing Lab 2 Ticket/Attachment data survives migration, ownership FKs resolve correctly, seed script is idempotent (running it twice doesn't duplicate/break data), and password fields are never stored in plaintext.

  Do not build any API routes or UI in this issue — schema, migration, and seed data only. Flag any schema decisions you had to make that weren't already fixed by the spec (e.g. cascade behavior on user deactivation vs deletion, index choices) so I can review them.

  Once done, commit on this branch and open a PR against lab3-staging titled "Issue #2: DB migration - Users & auth model" summarizing the schema changes and migration approach.

  Also, move issue #36 on the kanban board at https://github.com/users/gxjakkap/projects/5 to started, then when submitting the pr, move it to PR review after opening the PR, and when creating the PR, add issue #36 to the description and pass the description through unslop first, also add issue #36 to the development section of the pr. if you have any question, use AskUserQuestion to ask me.
```

### Reflection
This one worked in one shot.

## Issue 3

I used Claude Sonnet 5 with thinking level medium on Claude Code to implement the API part of authentication.

### Actual prompt
```
We're continuing Lab 3 (CPE 334, TokTickIT project) — Issue #3: "Auth API."

  First, create and switch to a new branch: lab3/feat/3-auth-api

  Read docs/lab-03/specification.md, ui-spec.md, and api-spec.md first — this must match the approved data model (Issue #2's User schema) and the auth mechanism/session decisions already fixed in api-spec.md section 6.1. Also check the Issue #2 branch/PR for the actual User model fields (email, hashed password, role, isActive, requiresPasswordChange) before writing any code.

  Your task:

  1. Login endpoint
     - Accepts email + password, validates against the User table, checks isActive before anything else.
     - On success, establishes the session/token mechanism defined in api-spec.md (cookie or bearer token — use whatever was decided there, don't re-decide it here).
     - On failure, return a safe, generic error (invalid email or password) — never reveal whether the email exists or whether the account is specifically inactive vs wrong password, unless api-spec.md explicitly calls for a distinct inactive-account message.
     - Password comparison must use the hashing library already chosen in Issue #2.
  2. Logout endpoint
     - Invalidates the current session/token server-side (not just client-side clearing).
  3. Current-user endpoint
     - Returns the authenticated user's id, name, email, role, and requiresPasswordChange flag. Used by the frontend to drive role-based navigation and the mandatory password-change gate.
  4. Password-change endpoint
     - Requires the current (temporary) password, a new password meeting the rules defined in the spec/UI mockup (min length, upper/lower case, number, special character).
     - On success, clears requiresPasswordChange and updates the stored hash.
     - Must be usable both for the mandatory first-login flow and (if in scope per api-spec.md) any later voluntary password change.
  5. Cross-cutting
     - Rate-limit or otherwise guard against brute-force login attempts per whatever BR/AC exists for login attempts in specification.md.
     - Never expose auth secrets (hashing keys, session secrets) in client code or commit them to source control — use environment variables.
     - Return the correct status codes and safe error shapes consistent with api-spec.md's error taxonomy.
  6. Tests
     - Unit tests for password hashing/verification.
     - API tests: valid login, invalid credentials, inactive account, logout invalidates session, current-user returns correct shape when authenticated vs 401 when not, mandatory password-change flow (can't reach protected routes until password changed), password validation rule enforcement.
     - Place these under server/tests/lab-03/auth.api.test.ts (or wherever the repo's existing test convention points) per the required repository structure.

  Do not build authorization/role-guard middleware in this issue (that's Issue #4) and do not build any frontend UI (that's Issue #9) — backend auth endpoints and tests only. Flag any implementation choices you had to make that weren't already fixed by the spec.

  Once done, commit on this branch and open a PR against lab3-staging titled "[Lab 3] 3: Auth API" summarizing the endpoints and key decisions.

  When creating the PR, add issue #37 to the description and pass it through unslop first. If you have any questions, use AskUserQuestion to ask me.
```

### Reflection

Left some gaps that doesn't meet the contracts, caught in PR review.

## Issue 4

I used Claude Sonnet 5 with thinking level medium on Claude Code to implements the middleware for authentication.

### Actual prompt
```
We're continuing Lab 3 (CPE 334, TokTickIT project) — Issue #4: "Authorization middleware."

  First, create and switch to a new branch: lab3/feat/4-authorization-middleware

  Read docs/lab-03/specification.md and api-spec.md first, along with the Issue #3 branch/PR (auth API — login, logout, current-user, password-change), since this middleware sits directly on top of that session/token mechanism.

  Your task:

  1. Role-based route guards
     - Build reusable middleware that checks the authenticated user's role (Requester, IT Staff, Administrator) against what each route permits, per the authorization matrix in specification.md.
     - Requests with no valid session/token → 401. Valid session but wrong role → 403. Never fall back to trusting a client-supplied role or user id.
  2. Ownership checks
     - Reusable check(s) for "does this authenticated user own this resource" — e.g. a Requester can only access their own Tickets/Attachments; a requesterId in the request body/query must never override the authenticated identity (per BR-03 in specification.md).
     - Same pattern for IT Staff ticket ownership where relevant (claim/reassign is IT Staff/Admin only, not ownership-restricted to a single staff member unless the spec says otherwise — check specification.md for the exact rule).
  3. Safe error responses
     - Apply the error taxonomy from api-spec.md consistently: unauthenticated (401), authenticated-but-forbidden (403), invalid input (400), not found (404), conflict (409), unexpected server error (500).
     - Critical: never leak whether another user's protected Ticket, Attachment, or Internal Note exists — a Requester probing another user's ticket ID should get the same response whether it exists or not (typically 404, not 403, unless the spec says otherwise).
  4. Requester vs IT Staff vs Administrator boundaries
     - Requester: only their own Tickets/Attachments, can post Public Comments, cannot access Internal Notes at all (reject without exposing note content or existence, per AC-04).
     - IT Staff: full Ticket Queue and Ticket Detail access, Public Comments + Internal Notes, cannot access Administrator user-management endpoints.
     - Administrator: user-management endpoints only — per specification.md, Administrator does not automatically get IT Staff ticket operations unless the approved matrix explicitly grants it, so don't assume overlap.
  5. Wire it in, don't just write it
     - Apply this middleware to every protected endpoint that exists so far (auth's current-user route, and stub/placeholder routes for Ticket Queue, Ticket Detail, and Admin User Management if those don't exist yet — coordinate with Issues #5/6/7/8 so they can build on top rather than duplicating guard logic).
  6. Tests
     - Unit tests for the guard/ownership-check functions in isolation.
     - API tests: unauthenticated request rejected, wrong-role request rejected, Requester can't access another Requester's ticket, Requester blocked from Internal Notes without leaking existence, IT Staff blocked from Admin endpoints, Administrator blocked from IT Staff ticket endpoints (unless matrix says otherwise).
     - Place these under server/tests/lab-03/authorization.api.test.ts per the required repository structure.

  Do not build the actual Ticket Queue, Ticket Detail, or Admin User Management business logic in this issue — only the authorization layer and any minimal stub routes needed to prove it works end-to-end. Flag any authorization-matrix ambiguities you find in specification.md.

  Once done, commit on this branch and open a PR against lab3-staging titled "Issue #4: Authorization middleware" summarizing the guard/ownership-check design.

  If you have any questions, use AskUserQuestion to ask me.
```

### Reflection
The agent deemed that the specs might not be that tight and called its brainstorming skill. Then it laid out its plan for implementation for me to approve before proceeding. But still, it leave some bugs that was caught by the reviewer.

## Issue 5

I used Claude Sonnet 5 with thinking level medium on Claude Code to implement requester regression and public comments.

### Actual prompt
```
We're continuing Lab 3 (CPE 334, TokTickIT project) — Issue #5: "Requester regression + Public Comments."

 First, create and switch to a new branch: lab3/feat/5-requester-regression

 Read docs/lab-03/specification.md, ui-spec.md, and api-spec.md first. Also review the merged work from Issues #2 (User schema, Public Comment model), #3 (auth API), and #4 (authorization middleware), since this issue builds directly on all three. Check the existing Lab 2 Requester screens and APIs so you know exactly what must keep working.

 Your task:

 1. Remove the Development Requester mechanism
    - Delete the Development Requester selector and the "Change Requester" action from the UI.
    - Remove all client-side state, storage, and API plumbing tied to the temporary selector (stored requester id, headers/query params carrying it, etc.).
    - Make sure nothing in the codebase still reads a client-supplied requesterId to decide ownership.

 2. Wire Lab 2 Requester functions to the authenticated identity
    - Every Lab 2 Requester Ticket and Attachment API (create, list, view, edit, cancel, attachment upload/download/delete, or whatever Lab 2 actually implemented) must now derive the Requester from the authenticated session via the Issue #4 middleware, not from the request body/query (BR-03).
    - Ownership protection must be preserved: a Requester can only see and modify their own Tickets and Attachments, and probing another Requester's Ticket or Attachment id must not reveal whether it exists.
    - Requested Priority stays as submitted by the Requester; IT Priority initially copies it, per the spec.

 3. Public Comments (Requester side)
    - API: create and retrieve Public Comments on the Requester's own Ticket. Author and createdAt come from the backend, never the client. Reject empty or whitespace-only content, enforce the length limit defined in specification.md, and render content safely (no raw HTML injection). Comments are append-only, so no edit or delete.
    - UI: add a Public Comments section to the Requester Ticket Detail screen following the Zen Green mockup (author name, role badge, timestamp, comment text, an "Add Public Comment" input with a Post button). Include loading, empty, validation, and safe failure feedback.

 4. "Problem Appears Resolved" action
    - Add the approved action to the Requester Ticket Detail screen, following the exact behavior defined in specification.md (BR-05 and related rules). The Requester can indicate the problem appears resolved but must not be able to set the Ticket to Resolved or Closed directly. Enforce that on the backend, not just by hiding the control. Include a confirmation step if the spec requires one.

 5. Regression checks
    - All existing Lab 2 tests must still pass, updated only where the selector removal forces a change (e.g. tests that set a dev requester now need an authenticated session). Do not weaken or delete Lab 2 tests to make them pass; if one needs to change, tell me why.
    - Use the seeded Requester accounts from Issue #2 for manual and E2E checks.

 6. Tests
    - API tests for Requester ticket/attachment access using the authenticated identity, spoofed requesterId being ignored (AC-03), cross-Requester access blocked with no existence leak, Public Comment create/retrieve/validation, and "Problem Appears Resolved" allowed while direct Resolved/Closed is rejected.
    - UI component tests for the Requester Ticket Detail comment section and the resolved action, following the client test conventions from the required repo structure (client/.../lab-03 tests/).
    - Add regression coverage confirming the Lab 2 Requester flows still work end-to-end without the selector.

 Do not build IT Staff Ticket Queue/Detail features (Issues #6/#7), Internal Notes UI, or the login/shell screens (Issue #9) in this issue. If the login UI doesn't exist yet, use whatever minimal approach the earlier issues set up for getting an authenticated session in dev/tests, and flag it to me. Flag any spec ambiguities or decisions you had to make.

 Once done, commit on this branch and open a PR against lab3-staging named exactly "[Lab 3] 5: Requester regression and public comments", with a description summarizing what was removed, what was rewired, and the key decisions.

 If you have any questions, use AskUserQuestion to ask me.
```

### Reflection
Asked 2 questions, 1 to clarify on what it should do with development requester api route, and another one for the approval. Leave 2 bugs that the reviewer noticed.

## Issue 6

I used Claude Sonnet 5 with thinking level medium on Claude Code to implement staff ticket queue.

### Actual prompt
```
We're continuing Lab 3 (CPE 334, TokTickIT project) — Issue #6: "IT Staff Ticket Queue."

  First, create and switch to a new branch: lab3/feat/6-staff-ticket-queue

  Read docs/lab-03/specification.md, ui-spec.md, and api-spec.md first — especially the Queue query behavior section (searchable/filterable/sortable fields, default ordering, page size, pagination metadata). Also review the merged work from Issue #2 (Ticket/User schema), Issue #3 (auth), and Issue #4 (authorization middleware — apply the IT-Staff-only guard to every endpoint here, don't rebuild it).

  Your task:

  1. Ticket Queue API
     - Endpoint for IT Staff (and Administrator, only if the authorization matrix explicitly grants it — check specification.md, don't assume) to retrieve the shared Ticket Queue.
     - Support search (per the searchable fields defined in api-spec.md — likely ticket number and summary), suitable filters (category, status, requested/IT priority, ownership state), sorting on the defined sortable fields, and pagination with the metadata shape api-spec.md specifies.
     - Validate query parameters; invalid values return a safe 400, not a crash or silent fallback.
     - Reject non-IT-Staff/Administrator callers via the Issue #4 middleware; don't duplicate guard logic.
  2. Ticket Queue UI
     - Desktop table view with the fields justified in ui-spec.md (likely Ticket Number, Created Date, Summary, Category, Requested Priority, IT Priority, Status, Owner, Last Updated) — follow ui-spec.md exactly rather than re-deciding the field set here.
     - Search box, filter controls, sortable column headers, and pagination controls, all wired to the API above.
     - Smaller-screen representation as designed in ui-spec.md (not just a squeezed table — follow whatever card/list layout was specified).
     - Status, Requested Priority, and IT Priority rendered as the consistent Zen Green badges already established.
     - An action to open Ticket Detail from each row (the detail screen itself is Issue #7 — a stub/placeholder route is fine if Issue #7 isn't merged yet).
     - Loading, empty (no tickets at all), no-results (search/filter returned nothing), forbidden, and safe-failure states, all per Zen Green conventions.
  3. Tests
     - API tests: valid IT Staff request returns paginated results, search matches expected tickets, each filter in isolation and combined with others, each sortable field in both directions, invalid query params rejected safely, Requester/unauthenticated callers rejected, default ordering when no params given.
     - UI tests: queue renders seeded data, search/filter/sort/pagination interactions, empty vs no-results vs forbidden vs failure states render correctly, responsive layout switch.
     - Place API tests under server/tests/lab-03/staff-queue.api.test.ts and UI tests under client/.../lab-03 tests/StaffTicketQueue.test.tsx per the required repo structure.
     - Use the seeded Tickets from Issue #2 (realistic spread across requesters/statuses/priorities/ownership) to validate real query behavior, not just mocked data.

  Do not build Ticket Detail (claim/reassign, IT Priority edit, status transitions, comments/notes — that's Issue #7), and do not build the Admin User Management screen (Issue #8) in this issue. If Issue #7 hasn't merged yet, link the queue's "open" action to a placeholder route rather than blocking on it. Flag any field/filter/sort ambiguities you find in the spec.

  Once done, commit on this branch and open a PR against lab3-staging named exactly "[Lab 3] 6: IT Staff ticket queue", with a description summarizing the query behavior and UI decisions.

  If you have any questions, use AskUserQuestion to ask me.
```

### Reflection
Asked no questions, worked by itself, and worked in one shot.

## Issue 7

I used Claude Sonnet 5 with thinking level high on Claude Code to implement ticket details page.

### Actual prompt
```
We're continuing Lab 3 (CPE 334, TokTickIT project) — Issue #7: "IT Staff Ticket Detail."

  First, create and switch to a new branch: lab3/feat/7-staff-ticket-detail

  Read docs/lab-03/specification.md, ui-spec.md, and api-spec.md first — especially the Ticket Ownership/Priority/Status rules (section 4.5) and the Public Comments/Internal Notes rules (section 4.6). Also review the merged work from Issue #2 (Ticket/Comment/Note schema), Issue #4 (authorization middleware), Issue #5 (Public Comments on the Requester side — reuse that model/logic, don't duplicate it), and Issue #6 (Ticket Queue, which links into this screen).

  Your task:

  1. Ticket ownership API
     - Claim endpoint: an unassigned Ticket can be claimed by the requesting IT Staff/Administrator, setting them as Ticket Owner.
     - Assign/reassign endpoint: change the Ticket Owner to a different active IT Staff/Administrator user. Validate the target is active and holds a permitted role.
     - Enforce via the Issue #4 middleware that only IT Staff/Administrator can call these (per the matrix — don't assume Administrator has ticket operations unless specification.md explicitly grants it).

  2. IT Priority and status
     - Endpoint to update IT Priority — IT Staff/Administrator only. Requested Priority stays untouched (read-only, submitted by the Requester).
     - Endpoint to update status, enforcing the transition matrix defined in specification.md (New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, Cancelled) — only permitted transitions for the calling role succeed; invalid transitions return a safe 409/400 per api-spec.md's error taxonomy, not a silent no-op.
     - Remember: Lab 3 excludes Actions Taken, so there's no gate on resolution from incomplete actions — that's deferred to Lab 4.

  3. Internal Notes
     - API to create and retrieve Internal Notes, visible only to IT Staff and Administrator (BR-04) — reuse the Public Comment pattern from Issue #5 (author/createdAt from backend, append-only, reject empty/whitespace, enforce length limit, safe rendering) but keep the two models/endpoints distinct so a Requester request for notes is rejected without leaking content or existence (AC-04).

  4. Ticket Detail UI (IT Staff view)
     - Extend the Lab 2 Ticket Detail screen per ui-spec.md: Ticket info grouped and mostly read-only, with only the permitted operational fields editable (Ticket Owner, IT Priority, Status).
     - Claim/reassign control, IT Priority selector, status selector constrained to permitted transitions, existing Attachments (read-only continuity from Lab 2), and clear role-specific actions.
     - Public Comments and Internal Notes sections that are visually distinct (different styling/placement  notes can't be accidentally mistaken for public ones — this is a hard requirement from the handout, nota nice-to-have.
     - Loading, validation, success, forbidden, not-found, conflict (e.g. invalid status transition), and safe-failure feedback, per Zen Green conventions.
     - Wire this screen into the "open" action from the Issue #6 Ticket Queue (replace the placeholder route if one exists).

  5. Tests
     - API tests: claim an unassigned ticket, reassign an owned ticket, reject claim/reassign by non-IT-Staff, IT Priority update success/rejection by role, every valid and a sample of invalid status transitions, Internal Note create/retrieve by IT Staff, Internal Note request by Requester rejected without leaking content (extends #5), Public Comment create/retrieve still works on this screen's data path.
     - UI tests: ownership/priority/status controls render and submit correctly, Public Comments vs Internal Notes render in visually distinct sections, forbidden/conflict/failure states.
     - Place API tests under server/tests/lab-03/staff-ticket-detail.api.test.ts and server/tests/lab-03/comments-notes.api.test.ts, and UI tests under client/.../lab-03 tests/StaffTicketDetail.test.tsx, per the required repo structure.
     - Use seeded Tickets/Comments/Notes from Issue #2 for realistic coverage.

  Do not build the Admin User Management screen (Issue #8) or the login/shell UI (Issue #9) in this issue. If the Issue #6 queue's placeholder route isn't merged yet, coordinate the route path with that issue rather than guessing. Flag
  any ambiguities in the status transition matrix or ownership rules.

  Once done, commit on this branch and open a PR against lab3-staging named exactly "[Lab 3] 7: IT Staff ticket detail", with a description summarizing the ownership/priority/status/notes implementation and key decisions.

  If you have any questions, use AskUserQuestion to ask me.
```

### Reflection
It drafted up a plan with `superpower:writing-plans` then start executing it, worked by itself, got some inconsistencies that was caught by the reviewer.

## Issue 8

I used Claude Sonnet 5.5 with thinking level medium on Claude Code with cloud environment (so this is not being developed on my machine, just wanted to try this feature out) to develop the admin user manager functionality.

### Actual prompt
```
We're continuing Lab 3 (CPE 334, TokTickIT project) — Issue #8: "Admin User Management."

First, create and switch to a new branch: lab3/feat/8-admin-user-management

Read docs/lab-03/specification.md, ui-spec.md, and api-spec.md first — especially section 4.3 (Administrator role scope — user accounts only, not IT Staff ticket operations unless explicitly granted) and the Administrator business rules in section 4.4. Also review the merged work from Issue #2 (User schema), Issue #3 (auth/password hashing), and Issue #4 (authorization middleware — apply the Administrator-only guard, don't rebuild it).

Your task:

1. User list API
   - Endpoint to retrieve users, Administrator-only, showing Name, Email, Role, Status (active/inactive).
   - Support search by name or email, and an optional role filter. No pagination, multi-column sorting, or multiple simultaneous filters required (explicitly excluded per the handout) — keep it simple.

2. Create user API
   - Name, email, one permitted role (Requester/IT Staff/Administrator), activation state, and an initial password.
   - Reject duplicate emails with a safe 409.
   - New user's requiresPasswordChange must be set true (reuse the field/hashing approach from Issue #2/#3) so they're forced to change the initial password at first login.

3. Edit user API
   - Update name, email, role, and activation state.
   - Reject duplicate emails on change.
   - Enforce: an Administrator cannot deactivate their own account, and the system must always have at least one active Administrator (block an edit that would remove the last one). Check the authenticated identity server-side for the self-deactivation rule, not a client-supplied id.

4. Set new initial password API
   - Administrator sets a new password for a user; that user's requiresPasswordChange flips true, forcing a change at next login (reuses the Issue #3 password-change flow).

5. Admin User Management UI
   - Single screen per ui-spec.md: user list (Name, Email, Role, Status, Edit action), search box, optional role filter dropdown, "Create User" action opening a form (name, email, role, active toggle, initial password), and an edit panel/modal for existing users (name, email, role, active toggle, "set new initial password" action).
   - Validation feedback for duplicate email and invalid input, success feedback on save, and safe failure feedback for forbidden/conflict/server errors.
   - Visibly disable/block self-deactivation and last-Administrator-removal in the UI, but the real enforcement must be server-side (Issue #4 principle — hiding a control isn't authorization).
   - Follow Zen Green styling and keep the screen responsive (desktop/tablet/mobile) per the mockup.
   - Explicitly out of scope for this screen: user deletion, pagination, multi-column sort, multiple simultaneous filters, multi-role assignment, departments, bulk ops, import/export, role/audit history, email-based invites or resets — don't build any of these.

6. Tests
   - API tests: user list with search and role filter, create user (success, duplicate email rejected, invalid role rejected), edit user (success, duplicate email rejected, self-deactivation rejected, removing last active Administrator rejected), set new initial password (forces requiresPasswordChange), non-Administrator callers rejected on every endpoint.
   - UI tests: list renders seeded users, search/filter interactions, create/edit form validation and submission, self-deactivation control disabled/blocked, forbidden state for non-Administrators.
   - Place API tests under server/tests/lab-03/users-admin.api.test.ts and UI tests under client/.../lab-03 tests/UserManagement.test.tsx, per the required repo structure.
   - Use the seeded Administrator/IT Staff/Requester accounts from Issue #2 for realistic coverage.

Do not build any IT Staff ticket features (Issues #6/#7) or the login/shell UI (Issue #9) in this issue. Flag any ambiguities around the last-active-Administrator rule or role-value validation.

Once done, commit on this branch and open a PR against lab3-staging named exactly "[Lab 3] 8: Admin User Management", with a description summarizing the endpoints, safety-rule enforcement, and key decisions.

If you have any questions, use AskUserQuestion to ask me.
```

### Reflection
Did a lot of things that it wouldn't do on my machine, not in a good way, since on my machine I already put in measures to prevent most of what I don't like it to do. It also didn't (or rather can't) commit the changes in my name, so it commit it using its own name. Interestingly this PR got approved without changes requested.

## Issue 9

I used Claude Sonnet 5.5 with thinking level high on Claude Code to implement the Auth UI Shell.

### Actual prompt
```
We're continuing Lab 3 (CPE 334, TokTickIT project) — Issue #9: "Auth UI shell."

 First, create and switch to a new branch: lab3/feat/9-auth-ui-shell

 Read docs/lab-03/specification.md, ui-spec.md, and api-spec.md first, especially the Login/Change Password screen designs, the application shell requirements (section 7), and the auth/session decisions in api-spec.md. Also review the merged work from Issue #3 (login, logout, current-user, password-change endpoints) and Issue #4 (authorization middleware). Check what Issues #5-#8 did to get an authenticated session in dev/tests, since this issue replaces that stopgap with the real login flow.

 Your task:

 1. Login screen
    - Email and password fields, with validation, a show/hide password toggle, a busy state while submitting, and safe failure feedback ("Invalid email or password. Please try again." style, matching the mockup).
    - Inactive accounts get a clear response without exposing unnecessary account information, following whatever api-spec.md decided in Issue #3.
    - The mockup shows a "Forgot your password?" link, but password-reset email is explicitly excluded from Lab 3. Don't build it; omit the link or show a non-functional hint per ui-spec.md, and flag which you chose.

 2. Mandatory Change Password screen
    - Shown when the current-user response has requiresPasswordChange = true. Normal application screens must be unreachable until a valid new password is saved (BR-02, AC-02). Enforce this in route guards on the client, and confirm the backend already blocks protected APIs for such users (Issue #3/#4); flag it if it doesn't.
    - Fields: current (temporary) password, new password, confirm new password, each with a show/hide toggle.
    - Live password-rule checklist matching the mockup and the rules in the spec (min length, upper and lower case, number, special character), plus confirmation-match validation.
    - On success, continue into the application for the user's role.

 3. Authenticated application shell
    - Replace any leftover Development Requester display with the authenticated user's name and role.
    - Profile menu with Logout and permitted profile/password actions.
    - Role-specific navigation that never presents unauthorized destinations: Requester sees their ticket screens, IT Staff sees My Queue and Create Ticket as per ui-spec.md, Administrator sees Admin. Wire the existing screens from Issues #5-#8 into this nav.
    - Route guards: unauthenticated users are redirected to login, wrong-role direct URL access shows the forbidden state, and after logout, direct URL access is blocked and no authenticated data remains in client state.
    - Consistent role badge styling alongside the existing status and priority badges.
    - Loading state while the current-user check runs on app load, so there's no flash of protected content.

 4. Remove stopgaps
    - Replace any temporary dev session helpers added in Issues #5-#8 with the real login flow in the app. Keep test helpers that log in via the API where tests need them, and tell me which you removed or kept.

 5. Zen Green and responsive
    - Reuse the existing tokens and components; don't introduce a second visual system.
    - All screens usable on desktop, tablet, and mobile, with visible focus states and accessible form labels and error association, same standard as Lab 2.

 6. Tests
    - UI component tests for Login (valid submit, validation errors, busy state, invalid credentials feedback, inactive account feedback) and ChangePassword (rule checklist, mismatch, success path), placed at client/.../lab-03 tests/Login.test.tsx and ChangePassword.test.tsx.
    - Shell and guard tests: role-based nav per role, redirect when unauthenticated, forbidden on wrong-role URL, logout clears access.
    - If the repo's E2E setup (Playwright or similar) exists, add e2e/lab-03/authentication.spec.ts covering login, first-login forced password change, role navigation, logout, and blocked access after logout. Issue #10 will broaden E2E coverage, so keep this focused on auth.
    - Use the seeded accounts from Issue #2, including the inactive ones and an account with requiresPasswordChange set.

 Do not build new ticket or admin features in this issue; this one is login, password change, the shell, nav, and guards only. Flag any spec ambiguities or choices you made.

 Once done, commit on this branch and open a PR against lab3-staging named exactly "[Lab 3] 9: Auth UI Shell", with a description summarizing the screens, guard behavior, and key decisions.

 If you have any questions, use AskUserQuestion to ask me.

```

In the process, it spawned an exploration subagent with this prompt:
```
I'm implementing a new "Auth UI Shell" feature (Issue #9) for a TypeScript monorepo at /Users/jakka/Code/soften-toktickit (client = React/Vite, server = Express/Prisma). I need a thorough map of what already exists so I know what to build vs. reuse. Report back with file paths and brief descriptions (not full file contents unless something is small/critical) for each of the following:

 SERVER SIDE:
 1. server/src/lib/requester-context.ts — what it currently does (identity resolution seam mentioned in CLAUDE.md).
 2. Auth routes: find files implementing POST /api/auth/login, /api/auth/logout, GET /api/auth/me, POST /api/auth/change-password. List their file paths.
 3. Authorization/role middleware (from "Issue #4: authorization middleware") — file path and how it's wired into server/src/app.ts or route files, especially how it enforces the PASSWORD_CHANGE_REQUIRED gate (api-spec.md §1.5) and role checks.
 4. server/src/app.ts — what middleware order looks like currently (just the overview, not full file).
 5. Any server/src/generated/prisma client usage related to User, Session tables — confirm schema has mustChangePassword, role, isActive fields as the spec describes (quick check of server/prisma/schema.prisma).

 CLIENT SIDE:
 6. Find any "dev session helper" / "Development Requester selector" stopgap code added in Issues #5-#8 — grep for terms like "DevRequester", "RequesterSelector", "dev-session", "x-requester-id", or similar. List file paths and a one-line description of what each does.
 7. client/src/apiClient.ts — what it currently does (the identity seam mentioned in CLAUDE.md), especially how it currently establishes "who is asking" (cookie-based fetch already? or header-based?).
 8. Existing routing setup: is there a router (react-router?) already in place? Find the main App component / router config file path, and list what routes/screens currently exist (e.g. MyTickets, CreateTicket, TicketDetail, StaffTicketQueue, StaffTicketDetail per the commit log: "add IT Staff Ticket Detail screen", "add IT Staff ticket queue"). Give file paths for each screen component.
 9. Existing shell/layout component (header, nav) — file path, and what it currently renders (likely the Dev Requester display mentioned in CLAUDE.md to replace).
 10. Existing Zen Green design tokens / shared UI components (buttons, badges, cards, form fields, toggles) — just list directory paths and component file names available for reuse (e.g. a components/ui folder), don't need full contents.
 11. Existing test setup: test runner (vitest?), test file locations under client/tests/ for prior labs, to understand conventions (e.g. client/tests/lab-02/...). List a couple of example test file paths so I can match their style.
 12. Check for existing e2e setup (Playwright) — is there an e2e/ directory with prior lab specs? List file paths of 1-2 example e2e spec files.
 13. Check client/src/AGENTS.md and server/src/AGENTS.md (or wherever AGENTS.md files live per CLAUDE.md) for any additional conventions relevant to this work (routing, state management, testing, component structure, API client patterns). Summarize key points only.

 Report concisely — file paths and 1-3 sentence descriptions per item, organized under the same numbered headings. Don't dump full file contents; only quote a snippet (a few lines) where truly necessary to explain a seam I must plug into (e.g. the exact shape of requester-context.ts's exported function signature, or apiClient.ts's core fetch wrapper signature).
```

### Reflection
It recognized that this is a rather large feature to implement, so it called `superpower:brainstorming` and spawned an exploration subagent to check out what's already been built and what's missing, after that it worked by itself. This PR also passed without changes requested.

## Issue 10

I used Claude Sonnet 5.5 with thinking level high on Claude Code to check on test coverage.

### Actual prompt
```
We're continuing Lab 3 (CPE 334, TokTickIT project) — Issue #10: "Test DD + full coverage."

  First, create and switch to a new branch: lab3/feat/10-test-coverage

  Read docs/lab-03/specification.md, ui-spec.md, and api-spec.md first, then review everything merged into lab3-staging from Issues #2-#9 and the test files each one added. This issue is the integration pass: it finalizes the test plan, closes coverage gaps, and produces the evidence the grader needs for Part 3.

  Important: the test plan (docs/lab-03/tests.md) must read as a plan driven by the acceptance criteria, not a list reconstructed from whatever tests happen to exist. Start from the ACs in specification.md and work forward to tests, then reconcile against what the earlier issues already wrote.

  Your task:

  1. docs/lab-03/tests.md
     - If it doesn't exist yet, create it. If an earlier issue started it, extend it rather than rewriting history.
     - Use the table format from the handout: Test ID, Type, Requirement/AC, What It Tests, Expected Result, Automated Test File, Final status.
     - Cover every type the handout requires: unit, API/integration, UI component, UI style, responsive, security/authorization, migration/regression, and E2E.
     - Every AC in specification.md must map to at least one test, and every test must point at a real file path. Include a traceability matrix (AC -> Test IDs) and flag any AC with no test.
     - Make sure the plan covers the topics the handout lists: valid/invalid login, inactive accounts, password boundaries, logout, role navigation, direct API authorization, Requester regression, queue queries, ownership, IT Priority, status transitions, comments, notes, user administration (listing, search, role filter, create, duplicate email, edit, one-role assignment, activate/deactivate, new initial password, self-deactivation block, last-active-Administrator block, non-Administrator forbidden), migration, responsive behavior, accessibility, and safe failures.

  2. Gap analysis and new tests
     - Compare tests.md against the actual test files from Issues #2-#9 and write the missing ones. Do not duplicate tests that already exist.
     - Required locations per the handout: server/tests/lab-03/ (auth, authorization, staff-queue, staff-ticket-detail, comments-notes, users-admin API tests), client/.../lab-03 tests/ (Login, ChangePassword, StaffTicketQueue, StaffTicketDetail, UserManagement), and e2e/lab-03/ (authentication.spec.ts, staff-ticket-flow.spec.ts, user-administration.spec.ts). If an earlier issue named a file differently, tell me before renaming anything.
     - Security/authorization: a direct-API matrix test running every protected endpoint as unauthenticated, Requester, IT Staff, and Administrator, asserting 401/403/404 per api-spec.md and no existence leaks for other users' Tickets, Attachments, or Internal Notes.
     - Migration/regression: Lab 2 data survives, ownership FKs resolve, seed is idempotent, no plaintext passwords, and the Lab 2 Requester flows work without the selector. Lab 2 tests must still pass; don't weaken or delete them.
     - UI style and responsive: tests or scripted checks for badge consistency, editable vs read-only field styling, validation placement, and no horizontal overflow at desktop/tablet/mobile widths. Where something can only be verified visually, mark it as a manual check in tests.md with a note on what the screenshot should show, and don't pretend an automated test covers it.
     - Accessibility: label/error association and focus visibility, at the same standard as Lab 2.
     - E2E: staff-ticket-flow (login as IT Staff, queue search/filter, open detail, claim, set IT Priority, change status, post Public Comment and Internal Note, Requester sees the Public Comment but not the Note) and user-administration (create user, forced password change at first login, edit, deactivate, self-deactivation and last-Administrator blocks). Extend authentication.spec.ts from Issue #9 only where needed.

  3. Fix, don't hide
     - If a new test exposes a real bug in earlier work, tell me what it is. Fix it if it's small and clearly within the spec, otherwise leave the test failing, mark it clearly, and ask me. Never skip, weaken, or delete a test to get green.
     - No flaky tests: avoid arbitrary sleeps, and make each test set up and clean up its own data.

  4. Final run and evidence
     - Run the complete suite (unit, API/integration, UI, E2E) from the current branch state and record the passing output. Update the Final column in tests.md to match the real results.
     - Save the raw output somewhere sensible for the PDF submission (for example artifacts/lab-03/test-output/) and mention in the PR how to reproduce the run with one command. If there's no single command to run everything, add a package script for it.
     - Don't touch ai-use.md or reviewer.md.

  Do not add new product features in this issue. Flag any AC that is vague or untestable as written, and any place where tests.md and specification.md disagree.

  Once done, commit on this branch and open a PR against lab3-staging named exactly "[Lab 3] 10: Test Coverage", with a description summarizing the coverage added, any bugs found, and the final test counts.

  If you have any questions, use AskUserQuestion to ask me.
```

While working, it forked into another subagent to draft the `tests.md` with this prompt

```
Write docs/lab-03/tests.md from scratch (it doesn't exist yet). This is the Lab 3 test plan deliverable for Issue #10 of the current task (test coverage consolidation for TokTickIT, the IT ticketing app). You have full conversation context: you've already read docs/lab-03/specification.md (FR-01..28, BR-01..40, AC-01..38, §7 status matrix, §8 migration/seed), docs/lab-03/api-spec.md, and docs/lab-03/ui-spec.md in full, you inventoried every test file under server/tests/lab-01/, server/tests/lab-02/, server/tests/lab-03/, client/tests/lab-01/, client/tests/lab-02/, client/tests/lab-03/, and e2e/lab-02/, e2e/lab-03/ (including the it()/test() names you grepped out), and you just fixed one real bug (missing requireAuth on GET /api/categories and GET /api/related-systems, api-spec.md §2) and added these new files this session:
  - server/tests/lab-03/authorization-matrix.api.test.ts — a table-driven matrix of every protected endpoint × {unauthenticated, REQUESTER, IT_STAFF, ADMINISTRATOR}, plus 4 existence-leak checks (65 tests total).
  - e2e/lab-03/staff-ticket-flow.spec.ts — IT Staff search/claim/priority/status/comment/note flow, ending with the Requester seeing the comment but not the note.
  - e2e/lab-03/user-administration.spec.ts — 3 tests: create+forced-password-change, edit+deactivate+login-blocked, self-deactivation/last-Administrator disabled-controls.
  - e2e/lab-03/staff-and-admin-screenshots.spec.ts — desktop/tablet/mobile screenshots + scrollWidth assertions for Login, Change Password, Ticket Queue, Ticket Detail (IT Staff), User Management — filling the four artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/ directories that ui-spec.md §11 requires and that were previously empty.
  - You also updated server/tests/lab-02/reference-data.api.test.ts and server/tests/lab-01/categories-list.test.ts to authenticate (since those endpoints now require a session) and added 401 cases.

  Current full suite state (verified green just now): server pnpm --filter server test → 344/344 passing (26 files), client pnpm --filter client test → 126/126 passing (17 files), e2e pnpm e2e → 29/29 passing. These are the real, final numbers — use them.

  Read docs/lab-02/tests.md first (if not already fully in your context, read it now) — it is the exact format template: §1 Test Strategy, §2 Planned Tests (one markdown table, columns Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final), §3 Acceptance-Criterion Traceability Matrix (AC | Covered by), §4 Responsive and Visual Checklist (mirrors ui-spec.md's checklist, checked off with justification), §5 Test Commands, §6 Final Results (narrative per-issue, ending with the actual passing counts in a fenced bash block), §7 Known Limitations or Deferred Tests. Match this structure and prose style exactly — it's written by/for a student submitting a course lab, citing exact AC/FR/BR/file:line identifiers, terse and factual, no marketing language.

  What to do:

  1. Re-read every lab-03 test file under server/tests/lab-03/, client/tests/lab-03/, e2e/lab-03/ (and the two lab-01/lab-02 files just touched) to get each test's exact name and assertions — don't rely only on the it()-name grep already in this conversation; open the files to confirm what each test actually asserts, so "Expected Result" in your table is accurate, not guessed from the test title.
  2. Build §2's Planned Tests table using IDs with a type prefix per the handout's required categories: UNIT-, API-, UI-, STYLE- (visual/responsive), SEC- (security/authorization matrix), MIG- (migration/regression), E2E-. One row per meaningful test case — for a mechanically-generated parameterized block (e.g. the 65-test authorization matrix, or the admin non-admin-role loop in users-admin.api.test.ts), collapse it into one or a small handful of rows describing the matrix as a whole (don't write 65 rows for one mechanical loop) rather than one row per it(); for ordinary hand-written tests, one row per it()/test() as lab-02's tests.md does. Every row's "Automated Test File" must be a real path that exists.
  3. Cover every category the handout lists (restated from the issue): unit, API/integration, UI component, UI style, responsive, security/authorization, migration/regression, E2E. Make sure these specific topics each have a traceable row: valid/invalid login, inactive accounts, password boundaries (complexity rule + "must differ from current"), logout, role-scoped navigation, direct-API authorization (the new matrix file), Requester regression (Lab 2 flows under session auth), queue search/filter/sort/pagination, ownership (claim/reassign/BR-19/BR-20), IT Priority, status transitions (the full §7 matrix — permitted and rejected), comments/notes (BR-04/BR-26..30), user administration (listing, search, role filter, create, duplicate email, edit, one-role assignment, activate/deactivate, new initial password, self-deactivation block, last-active-Administrator block, non-Administrator forbidden), migration (§8.3 steps), responsive behavior, accessibility, safe failures.
  4. Accessibility: there is no dedicated a11y test file in this codebase (checked — same as Lab 2). Label/error association is proven implicitly everywhere via Testing Library's getByLabelText/Playwright's getByLabel (which fail if a control isn't properly associated with its label) — note this explicitly in §1 or §4 rather than fabricating a dedicated accessibility row that doesn't exist, matching how Lab 2's tests.md handled it (it didn't have one either).
  5. §3 Traceability Matrix: every AC-01..AC-38 must appear with at least one covering Test ID, or be explicitly flagged as uncovered with a one-line reason. Check especially: AC-02 (gate, covered by multiple layers), AC-30 (forced password change — both API and E2E), AC-36/AC-37 (Administrator read-only exception and rejection — now has the matrix file too), AC-38 (claim-vs-reassign). Call out any AC that is vague/untestable as written, if you find one — the issue brief asks for this explicitly. Also flag anywhere tests.md (as you're writing it) and specification.md/api-spec.md disagree — you already found and fixed one real disagreement (categories/related-systems missing auth); mention that fix explicitly in §6's narrative as this issue's finding, with the exact fix (file:line in server/src/app.ts — find the current line numbers) and the two test files you updated to catch it.
  6. §4 Responsive and Visual Checklist: mirror ui-spec.md §10's "Visual Inspection Checklist" items, mark each checked with the backing evidence (scrollWidth assertions + screenshot paths). List all screenshot paths under artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/ (6 files: desktop/tablet/mobile for staff-queue/staff-ticket-detail/user-management, plus 6 for authentication since it has both {viewport}.png for Login and change-password-{viewport}.png — 2×3) that this issue's new e2e file produced — confirm the exact filenames by listing artifacts/lab-03/screenshots/authentication/, .../staff-queue/, .../staff-ticket-detail/, .../user-management/ yourself (ls) rather than guessing. Note explicitly: no dedicated UI-style/badge-consistency test file was added because client/src/badges.tsx is already the single shared source for StatusBadge/PriorityBadge/RoleBadge across every screen (verified — grep it to confirm the three exports and who imports them), so consistency is structural, not something a new test needed to re-prove; each screen's own component test already asserts the right badge renders.
  7. §5 Test Commands: reuse Lab 2's three commands (pnpm --filter server test, pnpm --filter client test, pnpm e2e) run from server/, client/, and repo root respectively. Also mention the single root command pnpm test that this issue adds (a root package.json script running all three — confirm it actually exists by reading root package.json; if it's not there yet when you check, note that it's being added in this same change rather than fabricate it — check back with the main thread's work by reading the file fresh).
  8. §6 Final Results: write it as "Issue #10 (Test Plan, Gap Analysis, and Full Coverage)" following lab-02's narrative style for its own Issue #10/#24 sections — state what gap analysis found (the real auth bug + the specific missing role-matrix test cases you can reconstruct from this conversation: GET /api/tickets, GET /api/tickets/:id, attachment endpoints, POST /api/tickets, POST /api/tickets/:id/comments, PATCH /api/tickets/:id/resolved each missing an ADMINISTRATOR and/or IT_STAFF role-rejection test; GET /api/staff/it-staff-users missing an ADMINISTRATOR-rejection test), what three new e2e files were added and why (ui-spec.md §11 screenshot paths were empty for 4 of the required screens; no e2e flow existed yet for the IT Staff operational screen or the Administrator lifecycle), and end with the exact passing counts in a fenced bash block:
  pnpm --filter server test   # 344/344 passing
  pnpm --filter client test   # 126/126 passing
  pnpm e2e                    # 29/29 passing

  9. §7 Known Limitations or Deferred Tests: carry forward anything still genuinely open — check specification.md §11 Definition of Done's "Course Delivery Requirements" checklist; note that ai_use.md and reviewer.md do not yet exist under docs/lab-03/ and were explicitly left untouched per this issue's scope (don't create them, just note the gap). Note anything else you find genuinely deferred or manual-only (e.g., the Visual Inspection Checklist items that are automated now vs. anything still only a scripted/manual visual judgment call, if any remain).

  Constraints:
  - Do not touch docs/lab-03/ai_use.md or docs/lab-03/reviewer.md (they don't exist — do not create them).
  - Do not modify any test file, source file, or other doc — this task is writing exactly one new file, docs/lab-03/tests.md.
  - Do not run the test suites yourself unless you need to double-check one specific assertion you're unsure of from reading the source — the full-suite numbers above are already confirmed, don't re-run the whole thing.
  - Match docs/lab-02/tests.md's terse, precise, citation-heavy prose voice. No filler, no marketing adjectives, no AI-tell phrasing ("comprehensive", "robust", "seamless", "ensure that").
  - When you're done, just confirm the file was written and give a one-paragraph summary of row counts per category and any ACs you flagged as weak/uncovered. Do not print the whole file back.
```

### Reflection
It found 2 bugs related to API routes not guarded with `requireAuth()` which it fixed immediately. Still, it left 3 gaps to be caught by the reviewer.

## Issue 11

I did not use AI agents in the process of issue 11, since most of the task is just releasing lab 3 to main.
