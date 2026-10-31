# AI Use

Ten key prompts from Lab 4: the planning prompt, then the prompts for Issues 1 to 7, 9 and 10. Issue 8 is left out because its prompt has the same shape as Issue 7's, for the Requester side. Issue 11 is left out because it is release prep with no feature work. My Reflection is at the end.

## Prompt drafting
I used Claude Opus 5.5 with thinking level high to digest the stakeholder request and separate it to small issues.

### Actual prompt
```
this is a lab sheet for lab 4 of cpe334, try recalling your memory for lab 2  and lab 3 planning. i want you to plan out the issues to develop in this sprint from the requirements from stakeholders (leave out updating ai_use.md and reviewer.md). plan out how many issues we split this sprint into, what should be the branch names (in this sprint we will use lab4/feat/{idx_from_1}-{name}), etc.
[attached lab handout file]
```

### Reflection
Claude recalled memories from last 2 labs and divided stakeholder request into 11 dev tasks and suggested how I can work in parallel.

For the first issues, I prompt Claude in this conversation with this prompt
```
give me prompt to start issue 1, for every prompt after this, mention to the agent that if they have questions, they can use AskUserQuestion to ask me, and also invoke caveman skill at ultra level (/caveman ultra)
```

then used this prompt to have Claude draft prompts for subsequent issues.

```
give me prompt for issue {n}
```

which I reviewed, modified, and used it to implement each issues.

## Issue 1

I used Claude Sonnet 5 with thinking level medium on Claude Code to draft the specifications, ui spec, tests.

### Actual prompt
```
/caveman ultra

We're setting up Lab 4 (CPE 334, TokTickIT project). Create all Sprint 4 GitHub issues in this repo and add them to my Kanban board.

Caveman mode applies only to your chat replies to me. Issue titles and bodies must be normal, complete English.

If you have questions at any point, use AskUserQuestion to ask me.

Setup:
- Kanban board: github.com/users/gxjakkap/projects/5 (same board as Lab 3). Run `gh project field-list 5 --owner gxjakkap` to find the Status field and its options. New issues go in the first column (Backlog/Todo, whatever it's called). If the column names look different from Lab 3, ask me.
- Labels: every issue gets both `lab4` and `feature`. Check `gh label list` first and create any label that's missing.
- Check whether any Lab 4 issues already exist (`gh issue list --label lab4 --state all`). If any do, stop and ask me before creating duplicates.
- Don't create branches or write any code. Issues only.

Each issue body uses this structure:
## Scope
## Branch
## Depends on
## Done when

"Depends on" uses sprint indexes (e.g. "Sprint item 2") on the first pass. Once every issue exists, edit each body to replace those with the real GitHub issue references (#NN).

Issues to create, in this order:

1. Title: "Sprint 4 engineering contract"
   Branch: lab4/feat/1-engineering-contract
   Scope: Write docs/lab-04/specification.md, ui-spec.md, api-spec.md, and a first-pass tests.md. Cover numbered FR/BR/AC, the full Ticket status transition matrix, the resolution gate, dashboard metric definitions (calculation, empty state, drill-down, Asia/Bangkok day boundaries), Actions Taken data design, migration/rollback decisions, the API contract with conflict handling, and the Product Definition of Done. Must merge before any implementation PR (graded evidence).
   Depends on: none
   Done when: all four docs merged into lab4-staging; every AC maps to at least one planned test.

2. Title: "DB migration: Actions Taken + seed"
   Branch: lab4/feat/2-actions-taken-migration
   Scope: Prisma ActionTaken model per specification.md (ticket FK, performedBy, action date/time, description, result, follow-up required, follow-up note, attachment notes, concurrency version, timestamps, plus assignee/status if the contract adds them). Indexes for dashboard queries. Concurrency field on Ticket if missing. Migration preserves all Lab 1-3 data, with a documented and tested rollback/recovery approach. Idempotent seed: Tickets with zero, one, and many Actions Taken; every status; assigned and unassigned; data for both zero and non-zero dashboard metrics.
   Depends on: 1
   Done when: migration runs cleanly on a Lab 3 database; seed can run twice with no duplicates; migration test passes.

3. Title: "Actions Taken API"
   Branch: lab4/feat/3-actions-taken-api
   Scope: List, create, and update endpoints per api-spec.md. performedBy is taken from the session. Follow-up note is required when follow-up is needed. Requesters get read-only access on their own Tickets; IT Staff and Admin can write. Stale updates return 409. Duplicate submits are safely handled. Safe error shapes throughout.
   Depends on: 2
   Done when: server/tests/lab-04/actions-taken.api.test.ts passes, including authorization and conflict cases.

4. Title: "Ticket workflow + resolution gate"
   Branch: lab4/feat/4-ticket-workflow
   Scope: Backend enforces the final transition matrix and role permissions. Resolution gate. The Requester "problem appears resolved" action stays advisory. Optimistic concurrency on status changes. Append-only status history with stable ordering. UI status controls show only permitted transitions and refresh the Ticket summary on success.
   Depends on: 2
   Done when: ticket-workflow.api.test.ts, TicketWorkflow.test.tsx, and e2e/lab-04/ticket-resolution.spec.ts pass.

5. Title: "Actions Taken UI"
   Branch: lab4/feat/5-actions-taken-ui
   Scope: Actions Taken area on Ticket Detail: list/table, create mode, view/edit mode, validation placement, conflict and safe-failure feedback, read-only Requester view, responsive layout, Zen Green styling.
   Depends on: 3
   Done when: ActionsTaken.test.tsx and e2e/lab-04/actions-taken-flow.spec.ts pass; desktop/tablet/mobile have no clipping or horizontal overflow.

6. Title: "Dashboard APIs"
   Branch: lab4/feat/6-dashboard-api
   Scope: Requester dashboard endpoint (owned Tickets only) and IT Staff dashboard endpoint (Admin reuses it, optionally with user-account counts). Endpoints return concise metrics and short lists, not full collections. Every metric calculated on the backend exactly as specified, with Asia/Bangkok date boundaries and drill-down query params.
   Depends on: 2
   Done when: requester-dashboard.api.test.ts and staff-dashboard.api.test.ts pass, including zero-data and ownership cases.

7. Title: "IT Staff Dashboard UI"
   Branch: lab4/feat/7-staff-dashboard-ui
   Scope: Metric cards, recent/urgent Tickets, current user's recent Actions Taken, quick actions. Drill-down into the filtered Ticket Queue (extend Queue filters if needed). Dashboard navigation with active-page indication. Loading, empty, forbidden, and safe-failure states. Responsive.
   Depends on: 6
   Done when: StaffDashboard.test.tsx passes; displayed counts match the seeded database.

8. Title: "Requester Dashboard UI"
   Branch: lab4/feat/8-requester-dashboard-ui
   Scope: Owned-Ticket metric cards, attention-required (Waiting for Requester), recently updated and recently resolved Tickets, quick actions. Drill-down into filtered My Tickets. All feedback states. Responsive. Doesn't duplicate the full My Tickets screen.
   Depends on: 6
   Done when: RequesterDashboard.test.tsx passes; a Requester sees only their own data.

9. Title: "Final hardening + Zen Green polish"
   Branch: lab4/feat/9-final-hardening
   Scope: Consistent loading, validation, success, empty, forbidden, conflict, not-found, and safe-failure feedback app-wide. Duplicate-click/retry protection. Important forms keep entered data after recoverable failures. Remove console errors, broken links, placeholders, and leftover or duplicate UI from Labs 1-3. Accessibility fixes (focus, keyboard, labels, non-color status cues). README setup/seed/migration/test/demo instructions brought up to date.
   Depends on: 4, 5, 7, 8
   Done when: the visual and accessibility checklist in ui-spec.md is fully ticked.

10. Title: "Test DD + full regression coverage"
    Branch: lab4/feat/10-test-coverage
    Scope: Finalize docs/lab-04/tests.md with AC-to-test traceability and real file paths. Fill coverage gaps. Labs 1-3 regression suite (auth, My Tickets, Ticket Detail, attachments, comments, internal notes, staff functions, admin user management). Migration test. Performance smoke test. e2e/lab-04/dashboards.spec.ts.
    Depends on: 2-9
    Done when: the full unit, API, UI, and E2E suite passes on lab4-staging and the output is captured.

11. Title: "Release integration"
    Branch: lab4/feat/11-release-integration
    Scope: Capture desktop/tablet/mobile screenshots into artifacts/lab-04/screenshots/ (staff-dashboard, requester-dashboard, actions-taken). Final check against the Definition of Done. Merge lab4-staging into main. Move all Kanban cards to Done. ai-use.md and reviewer.md are out of scope; I'm writing those myself.
    Depends on: 1-10
    Done when: main contains the full sprint and every Lab 4 issue is Done.

When finished, print a summary table with the GitHub issue number, title, branch, labels, and board status, so I can check it against the board.
```

### Reflection
Plans it generated contain some inconsistencies, which was fixed in the PR review.

## Issue 2

I used Claude Opus 5.5 with thinking level high on Claude Code to implement the database schema and migrations.
### Actual prompt
```
/caveman ultra

We're continuing Lab 4 (CPE 334, TokTickIT project), Issue #2: "DB migration: Actions Taken + seed."

Caveman mode applies only to your chat replies to me. Code, comments, docs, commit messages, and the PR description must be normal, complete English.

If you have questions at any point, use AskUserQuestion to ask me. Don't guess on anything that changes the data model.

First, pull the latest lab4-staging and create a new branch from it: lab4/feat/2-actions-taken-migration
Check that docs/lab-04/specification.md and api-spec.md exist on lab4-staging (Issue #1 merged). If they don't, stop and ask me.

Find the "DB migration: Actions Taken + seed" issue on my Kanban board (github.com/users/gxjakkap/projects/5) and move it to "Started".

Before writing anything:
- Read docs/lab-04/specification.md (sections 5 Business Rules, 7 Data Changes, 9 Acceptance Criteria, 11 Assumptions and Decisions) and api-spec.md. The spec is the source of truth. Use exactly the fields, types, enums, and constraints it defines, including whatever was decided about Action Taken assignee/status and the concurrency approach.
- Read the current Prisma schema, all existing migrations, and the seed script from Labs 1-3.
- If the spec and existing code conflict, or the spec leaves a field type/constraint undefined, ask me before deciding.

Your task:

1. Prisma schema
   - Add the ActionTaken model exactly as specified: Ticket FK (BR-01: belongs to exactly one Ticket), performedBy FK to User, action date/time, description, result, followUpRequired, followUpNote, attachmentNotes, concurrency version, createdAt/updatedAt, plus assignee and action status if the spec includes them.
   - Choose the onDelete behavior per the spec (Tickets aren't hard-deleted in this app, so prefer Restrict over Cascade unless the spec says otherwise).
   - Add the concurrency field (version or updatedAt check, per spec) to Ticket if it doesn't already have one.
   - Add the append-only status history table if the spec defines one for Issue #4's workflow. It belongs in this migration so #4 doesn't need its own.
   - Add the indexes the dashboard queries need, per spec (e.g. Ticket by status, ownerId, requesterId, updatedAt; ActionTaken by ticketId + actionAt, performedById + actionAt). Don't add indexes the spec doesn't justify.
   - Follow-up note required when followUpRequired = true is enforced in the API layer (Issue #3). Add a DB CHECK constraint too only if the spec says so.

2. Migration
   - Generate a single Prisma migration. Read the generated SQL and confirm it only adds things and never drops or rewrites existing Lab 1-3 data.
   - Backfill: existing Tickets get zero Actions Taken, and the concurrency field gets a safe default for existing rows. If the spec defines status-history backfill for existing Tickets, implement it in the migration SQL.
   - Document the rollback/recovery approach in the location the spec names (or a short section in specification.md section 7 if it says "see migration notes"). A manual down-SQL script, backup-before-migrate steps, or both, matching what the spec decided.

3. Seed (must be idempotent: running it twice creates no duplicates)
   - Keep all existing Lab 1-3 seed data working (users, inactive accounts, requiresPasswordChange account, Tickets, attachments, comments, notes).
   - Add Tickets covering every status (New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, Cancelled), every IT Priority, and both assigned and unassigned ownership.
   - Add Tickets with zero, one, and multiple Actions Taken. At least one Ticket should have Actions Taken by different IT Staff members, where someone other than the Ticket Owner performed an action (BR-02). Include follow-up-required actions, plus assignee/status variety if the spec has those fields.
   - The data must produce both non-zero and zero values for every dashboard metric in the spec. If one seed set can't produce zero for a metric (e.g. "unassigned Tickets"), give at least one seeded user a scope where it's zero (e.g. a Requester with no Waiting tickets), and note which user demonstrates it.
   - Use dates relative to now (Asia/Bangkok) so "recent" and "today" metrics stay meaningful whenever the seed runs.
   - Use stable unique keys (upsert on Ticket number or a deterministic id) to stay idempotent.

4. Tests
   - Migration/regression test (location per tests.md, e.g. server/tests/lab-04/migration.test.ts): apply migrations to a database holding Lab 3 data and assert existing Users, Tickets, Attachments, Public Comments, and Internal Notes still exist and are unchanged; legacy Tickets have zero Actions Taken; concurrency defaults are set.
   - Seed idempotency test: run the seed twice, assert counts don't change.
   - A schema-level test that an ActionTaken can't exist without a valid Ticket.
   - Update docs/lab-04/tests.md: set the real file paths and change status from Planned for the tests this issue covers. Don't rewrite other rows.
   - Run the full existing Lab 2/3 test suite and confirm nothing regressed.

5. README
   - Update the migration and seed commands section if anything changed, including the rollback/recovery steps.

Do not build any Actions Taken API endpoints (Issue #3), workflow/transition logic (#4), dashboard queries or endpoints (#6), or UI. Schema, migration, seed, and their tests only. Don't touch docs/lab-04/ai-use.md or reviewer.md.

When done:
- Commit on this branch.
- Open a PR against lab4-staging named exactly "[Lab 4] 2: DB migration: Actions Taken + seed".
- Link the PR to the GitHub issue (Closes #<issue number>). Use the issue description as the base for the PR description and run it through unslop. Summarize the schema changes, the two justified design decisions, the backfill behavior, the rollback approach, and which seeded users demonstrate zero vs non-zero metrics.
- Move the Kanban card to "PR Review".
- Report back with the PR link, the test output summary, and any spec ambiguities you hit.
```

### Reflection
Worked in one shot.

## Issue 3

I used Claude Opus 5.5 with thinking level high on Claude Code to implement the API part action taken functionality.

### Actual prompt
```
/caveman ultra

We're continuing Lab 4 (CPE 334, TokTickIT project), Issue #3: "Actions Taken API."

Caveman mode applies only to your chat replies to me. Code, comments, docs, commit messages, and the PR description must be normal, complete English.

If you have questions at any point, use AskUserQuestion to ask me. Don't guess on authorization rules or response shapes.

First, pull the latest lab4-staging and create a new branch from it: lab4/feat/3-actions-taken-api
Check that Issue #2 has merged: the ActionTaken model, migration, and seed should be on lab4-staging. If they aren't, stop and ask me.

Find the "Actions Taken API" issue on my Kanban board (github.com/users/gxjakkap/projects/5) and move it to "Started".

Before writing anything:
- Read docs/lab-04/specification.md (Business Rules, Acceptance Criteria, Assumptions and Decisions) and api-spec.md (the Actions Taken endpoints, error shapes, and conflict handling). The spec is the source of truth for paths, methods, request/response shapes, and status codes.
- Read the existing Lab 3 API structure: route organization, the authorization middleware, ownership checks, validation approach, and error response helpers. Reuse them. Don't create a parallel pattern.
- Read the Prisma schema and seed from Issue #2.
- If the spec leaves a behavior undefined, or conflicts with existing code, ask me before deciding.

Your task:

1. Endpoints (exact paths per api-spec.md)
   - List Actions Taken for a Ticket. Stable ordering as the spec defines (e.g. actionAt then createdAt then id). Include performedBy (and assignee, if the spec has it) as display-safe user info only: id, name, role. Never password hashes or internal fields.
   - Create an Action Taken on a Ticket.
   - Update an Action Taken.
   - Only add a delete endpoint if the spec includes one.

2. Authorization (enforced in the backend, never only by hiding UI)
   - Requester: read-only, and only on Tickets they own. Another Requester's Ticket returns whatever the spec defines (403 or 404). Any create/update attempt by a Requester returns 403.
   - IT Staff: create and update on accessible Tickets, per the spec's definition of "accessible."
   - Administrator: everything IT Staff can do.
   - Unauthenticated requests return 401. Users with requiresPasswordChange stay blocked, exactly as in Lab 3.
   - Follow the spec on whether IT Staff can edit an action someone else performed. If the spec is silent, ask me.

3. Business rules
   - performedBy always comes from the authenticated session. Ignore or reject a performedBy in the request body, per the spec.
   - followUpNote is required (non-empty after trim) when followUpRequired = true. Follow the spec on whether it's cleared or kept when follow-up is switched off.
   - The Ticket must exist. Follow the spec on whether actions can be added or edited on Closed/Cancelled Tickets. If it restricts this, enforce it and return the spec's status code.
   - Validate field lengths, required fields, and date/time format per the spec. Store UTC. Reject future dates if the spec says so.
   - If the spec added assignee/status: the assignee must be an active IT Staff or Admin (an inactive assignee is rejected with the spec's error, which grading Part 6 checks), and action status transitions follow the spec.
   - BR-02: performedBy may differ from the Ticket Owner. Don't block that.

4. Concurrency and duplicate safety
   - Update requires the client's version (or updatedAt) per the spec. A stale version returns 409 with the spec's conflict shape (including the current record if the spec says so). Implement the check atomically (e.g. update ... where id and version, then check the affected count), not as read-then-write.
   - Duplicate create protection per the spec (idempotency key, client request id, or whatever was decided). Network retries must not create two identical actions.

5. Errors
   - Use the Lab 3 safe error shape everywhere: validation errors with field-level details, 401/403/404/409, and a generic 500 with no stack traces or Prisma messages leaked.

6. Tests: server/tests/lab-04/actions-taken.api.test.ts
   - Cover every AC in specification.md that touches the Actions Taken API, including AC-01.
   - Must include: valid create by IT Staff and by Admin; performedBy set from the session even when the body tries to spoof it; action by non-owner IT Staff allowed (BR-02); follow-up note required; validation failures with field errors; Requester can read own Ticket's actions; Requester blocked from another Requester's Ticket; Requester create/update returns 403; unauthenticated returns 401; non-existent Ticket and non-existent action; stale update returns 409; duplicate submit doesn't create two rows; list ordering is stable; inactive-assignee rejection and status rules if applicable; closed/cancelled Ticket behavior if the spec restricts it.
   - Use the seeded users and Tickets from Issue #2 where possible. Keep tests isolated so they pass in any order.
   - Update docs/lab-04/tests.md: real file paths and status for the tests this issue covers. Don't rewrite other rows.
   - Run the full Lab 2/3 suite plus the Issue #2 tests and confirm nothing regressed.

Do not build the Actions Taken UI (Issue #5), Ticket status transition or resolution gate logic (#4), or dashboard endpoints (#6). If you need a helper that #4 will also use (e.g. a shared concurrency utility), put it somewhere reusable and mention it in the PR. Don't touch docs/lab-04/ai-use.md or reviewer.md.

When done:
- Commit on this branch.
- Open a PR against lab4-staging named exactly "[Lab 4] 3: Actions Taken API".
- Request a review from fakekase (`gh pr create ... --reviewer fakekase`, or `gh pr edit <n> --add-reviewer fakekase` after creating it).
- Link the PR to the GitHub issue (Closes #<issue number>). Use the issue description as the base for the PR description and run it through unslop. Summarize the endpoints, the authorization matrix, the conflict and duplicate-submit handling, and key decisions.
- Move the Kanban card to "PR Review".
- Report back with the PR link, the test output summary, and any spec ambiguities.
```

### Reflection

Some inconsistencies with the specs, fixed in PR review.

## Issue 4

I used Claude Opus 5.5 with thinking level high on Claude Code to implements the ticket workflow and resolution gate.

### Actual prompt
```
/caveman ultra

We're continuing Lab 4 (CPE 334, TokTickIT project), Issue #4: "Ticket workflow + resolution gate."

Caveman mode applies only to your chat replies to me. Code, comments, docs, commit messages, and the PR description must be normal, complete English.

If you have questions at any point, use AskUserQuestion to ask me. Don't guess on transition rules or role permissions.

First, pull the latest lab4-staging and create a new branch from it: lab4/feat/4-ticket-workflow
Check that Issue #2 has merged (ActionTaken model, the Ticket concurrency field, and the status history table if the spec defined one). If it hasn't, stop and ask me.

Find the "Ticket workflow + resolution gate" issue on my Kanban board (github.com/users/gxjakkap/projects/5) and move it to "Started".

Context: Issue #3 (Actions Taken API) and Issue #6 (Dashboard APIs) are being built in parallel on their own branches. Don't depend on #3's endpoints. Read ActionTaken data straight through Prisma for the resolution gate. If #3 has already merged into lab4-staging, reuse its shared concurrency helper rather than writing a second one. If it hasn't merged, write a small helper and flag it in the PR so the two can be consolidated.

Before writing anything:
- Read docs/lab-04/specification.md (the status transition matrix, resolution gate BR, the "appears resolved" advisory rule, concurrency rules, ACs) and api-spec.md (the status change endpoint, its conflict shape, and error codes). The spec is the source of truth.
- Read the existing Lab 3 status-transition code, the IT Staff Ticket Detail screen, the Requester Ticket Detail screen and its "Problem Appears Resolved" action, and the authorization middleware. Extend these. Don't build a parallel path.
- If the spec's matrix conflicts with Lab 3 behavior, or a transition/role pair is undefined, ask me.

Your task:

1. Backend: transition enforcement
   - Put the final transition matrix (New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, Cancelled) in one place: a single source of truth that both the API and the "allowed transitions" response use.
   - Enforce role permissions per transition, in the backend. A disallowed transition returns the spec's status code and error shape, even when the request skips the UI.
   - The resolution gate: moving to Resolved checks the spec's rule against ActionTaken data (e.g. at least one non-cancelled action and no unresolved follow-ups) and rejects with a clear, safe error naming the unmet condition.
   - The Requester "problem appears resolved" action stays advisory. It records the indication per spec and never changes status to Resolved by itself. Keep the Lab 3 behavior working.
   - Optimistic concurrency on status changes: a stale version returns 409 with the spec's conflict shape. Do the check atomically.
   - Status history: append-only, stable ordering per spec. Every successful transition writes a row (from, to, actor, timestamp, reason if the spec has one). No update/delete paths for history rows.
   - If the spec says the Ticket Detail response includes allowedTransitions for the current user, add it. The UI should render from that, not from duplicated client logic.

2. UI: Ticket Detail status controls
   - IT Staff/Admin Ticket Detail: status controls show only the permitted transitions for this user and Ticket. A gate failure (e.g. trying to resolve without qualifying actions) shows the backend's message inline. A 409 conflict shows the spec's conflict feedback and offers a refresh without losing anything the user typed (e.g. a resolution reason).
   - A successful change refreshes the Ticket summary status and the history list.
   - Requester Ticket Detail: the advisory action still works and is clearly labeled as a request, not a resolution. Requesters see no staff status controls.
   - Busy state while submitting, and double-click protection.
   - Zen Green styling, with non-color status cues (badge text/icon), keyboard operable, visible focus. Responsive at desktop/tablet/mobile.

3. Tests
   - server/tests/lab-04/ticket-workflow.api.test.ts: every allowed transition per role succeeds; every disallowed transition and role is rejected (table-driven over the matrix); resolution gate blocks and allows correctly; the Requester advisory action doesn't change status; a direct API call that bypasses the UI is still blocked; stale version returns 409; history rows are appended in stable order and can't be modified; unauthenticated returns 401 and another Requester's Ticket is blocked.
   - client/.../lab-04 tests/TicketWorkflow.test.tsx (the real client test location from Lab 3): only permitted transitions render; gate error displays; conflict feedback displays; the summary refreshes after success; the Requester view has no staff controls.
   - e2e/lab-04/ticket-resolution.spec.ts: IT Staff works a seeded Ticket that already has qualifying Actions Taken through to Resolved, then Closed; a Ticket without qualifying actions is blocked at Resolved; the Requester advisory action appears and doesn't resolve the Ticket. Use seeded data from #2. Don't depend on #3/#5 UI.
   - Update docs/lab-04/tests.md: only the rows for this issue (real file paths and status). Other parallel branches edit the same file, so keep your edits to your own rows to keep merge conflicts small.
   - Run the full Lab 2/3 suite plus the #2 tests and confirm nothing regressed, especially the Lab 3 status-transition tests. If an old test encodes a transition the Lab 4 matrix now forbids, update it and list each change in the PR.

Do not build Actions Taken endpoints or UI (#3/#5) or dashboards (#6-#8). Don't touch docs/lab-04/ai-use.md or reviewer.md.

When done:
- Commit on this branch.
- Open a PR against lab4-staging named exactly "[Lab 4] 4: Ticket workflow + resolution gate".
- Request a review from fakekase (`--reviewer fakekase`).
- Link the PR to the GitHub issue (Closes #<issue number>). Use the issue description as the base for the PR description and run it through unslop. Summarize the transition matrix enforcement, the resolution gate, conflict handling, history behavior, any Lab 3 tests you changed, and the concurrency helper situation with #3.
- Move the Kanban card to "PR Review".
- Report back with the PR link, the test output summary, and any spec ambiguities.
```

### Reflection
Worked in one shot.

## Issue 5

I used Claude Opus 5.5 with thinking level high on Claude Code to implement UI part of Action Taken functionality.

### Actual prompt
```
/caveman ultra

We're continuing Lab 4 (CPE 334, TokTickIT project), Issue #5: "Actions Taken UI."

Caveman mode applies only to your chat replies to me. Code, comments, docs, commit messages, and the PR description must be normal, complete English.

If you have questions at any point, use AskUserQuestion to ask me. Don't guess on layout or behavior the spec doesn't cover.

First, pull the latest lab4-staging and create a new branch from it: lab4/feat/5-actions-taken-ui

Find the "Actions Taken UI" issue on my Kanban board (github.com/users/gxjakkap/projects/5) and move it to "Started".

Context: #2 (migration + seed), #3 (Actions Taken API), and #4 (Ticket workflow + resolution gate, including the consolidated concurrency helper, shared rule error, and staff-roles const) are merged into lab4-staging. #6 (Dashboard APIs) is being built in parallel and doesn't affect this issue. Reuse what's there:
- #3's endpoints, response shapes, 409 conflict shape, and duplicate-submit mechanism (idempotency key or whatever was decided). The UI must send whatever that mechanism requires.
- #4's status controls on the IT Staff Ticket Detail screen. The Actions Taken area sits on the same screen, so it has to coexist cleanly.
- client/src/lib/datetime.ts (Bangkok formatDateTime) for every date/time shown.
- The existing Lab 2/3 Zen Green components (cards, tables, badges, buttons, forms, tabs, loading/empty/error states, modals/drawers). Don't create new styling primitives unless nothing existing fits.

Before writing anything:
- Read docs/lab-04/ui-spec.md (the Actions Taken area: list/table, create mode, view/edit mode, Requester read-only view, validation placement, conflict feedback, responsive rules, accessibility checklist), specification.md (the Actions Taken BRs and ACs), and api-spec.md (the Actions Taken endpoints).
- Read the merged #3 API code and #4 Ticket Detail changes, plus the Lab 3 IT Staff and Requester Ticket Detail screens and how they fetch and refresh data.
- If ui-spec.md doesn't say whether create/edit is inline, a modal, or a drawer, ask me.

Your task:

1. IT Staff/Admin Ticket Detail: Actions Taken area
   - List/table of all Actions Taken for the Ticket, in #3's stable order. Columns/fields: action date/time, description, result, performed by, follow-up required (as a text/icon badge, not color only), follow-up note, attachment notes, plus assignee and action status if the spec has them.
   - Desktop: table. Tablet/mobile: stacked cards per ui-spec. No horizontal page scroll, no clipped text (long descriptions wrap or truncate with full text accessible).
   - Empty state for Tickets with no Actions Taken, with a clear "Add action" call to action.
   - Loading, forbidden, not-found, and safe-failure states using the existing conventions.

2. Create mode
   - Form fields per spec. Performed by is shown read-only as the current user and is never sent as an editable value.
   - Action date/time input that defaults per spec (e.g. now, Bangkok time).
   - Follow-up Note becomes required, with a visible required marker, only when Follow-Up Required is on. Validation runs client-side, but server field errors from #3 map onto the same fields.
   - If the spec has an assignee: the picker lists only active IT Staff/Admin. Reuse the endpoint Lab 3's reassign-owner feature uses if there is one. A server-side inactive-assignee rejection (grading Part 6) still shows clearly on the field.
   - Busy state on submit, the button disabled while in flight, and the duplicate-submit mechanism wired so a double-click or retry creates one row.
   - Success: the new action appears in the list and the form resets.

3. View/edit mode
   - Selecting an action opens it in view mode. IT Staff/Admin can switch to edit if the spec allows them to edit that action (e.g. own actions only, or any). Hide the edit control when not allowed, but rely on the backend for enforcement.
   - Saving sends the version from #3. A 409 shows the spec's conflict feedback, keeps the user's unsaved edits visible, and offers to reload the latest version. Never silently overwrite.
   - Action status changes (complete, cancel, etc.) if the spec has them, using only permitted transitions.
   - Cancel edit restores the saved values.

4. Interaction with #4's workflow controls
   - Creating, editing, completing, or cancelling an action can change whether the Ticket can be Resolved (the resolution gate). After any successful action change, refresh the Ticket's allowed transitions and summary so the status controls stay accurate without a page reload.

5. Requester Ticket Detail: read-only view
   - Requesters see all Actions Taken on their own Ticket (handout 8.3), read-only, with no create/edit/status controls. Use the same list/card component in a read-only variant.
   - Show only the fields the spec says Requesters see. If the spec hides something (e.g. internal assignee details), respect that, and confirm the API isn't returning it either. If it is, flag it in the PR rather than fixing #3 here.

6. Data protection and accessibility
   - Important forms keep entered data after a recoverable failure (network error, 409, 500). Don't clear the form on error.
   - Labels tied to inputs, errors announced (aria-describedby / aria-live per the Lab 3 pattern), full keyboard operation, visible focus, focus moved sensibly when opening and closing create/edit (and trapped and restored if it's a modal), non-color cues for status and follow-up.

7. Tests
   - client/.../lab-04 tests/ActionsTaken.test.tsx (the real client test location from Lab 3): list renders in order; empty state; create with valid data; follow-up note required only when follow-up is on; server field errors map to fields; inactive-assignee error shown (if applicable); submit button disabled while in flight; edit sends the version; 409 keeps edits and offers reload; form data kept after a 500; Requester read-only variant has no write controls; allowed transitions refresh after an action change.
   - e2e/lab-04/actions-taken-flow.spec.ts: IT Staff opens a seeded Ticket with no actions, adds one, adds a second action as a different IT Staff user (BR-02, so the Ticket shows actions by different staff, which grading Part 6 wants), edits one, completes or cancels one if the spec has statuses, and confirms the Resolve transition becomes available once the gate is met. Then log in as the Ticket's Requester and confirm they see the actions read-only. Also cover a validation failure and a role restriction.
   - Responsive checks at desktop/tablet/mobile widths for the Actions Taken area (no horizontal overflow), using the approach Lab 3 used for responsive tests.
   - Update docs/lab-04/tests.md: only the rows for this issue (real paths and status).
   - Run the full suite (Lab 2/3, #2, #3, #4, plus these) and confirm nothing regressed, especially #4's TicketWorkflow tests and the Lab 3 Ticket Detail tests.

Do not build dashboards (#7/#8) or change Actions Taken API behavior. If you find a bug in #3/#4, note it in the PR and tell me rather than fixing it here. Screenshot capture for grading happens in #11, so skip it here. Don't touch docs/lab-04/ai-use.md or reviewer.md.

When done:
- Commit on this branch.
- Open a PR against lab4-staging named exactly "[Lab 4] 5: Actions Taken UI".
- Request a review from fakekase (`--reviewer fakekase`).
- Link the PR to the GitHub issue (Closes #<issue number>). Use the issue description as the base for the PR description and run it through unslop. Summarize the screens and modes, conflict and duplicate handling, the Requester read-only view, how it refreshes the workflow controls, and key decisions.
- Move the Kanban card to "PR Review".
- Report back with the PR link, the test output summary, and any spec ambiguities or #3/#4 issues found.
```

### Reflection
Some bugs were caught in the PR review process.

## Issue 6

I used Claude Sonnet 5 with thinking level medium on Claude Code to implement API for dashboard page.

### Actual prompt
```
/caveman ultra

We're continuing Lab 4 (CPE 334, TokTickIT project), Issue #6: "Dashboard APIs."

Caveman mode applies only to your chat replies to me. Code, comments, docs, commit messages, and the PR description must be normal, complete English.

If you have questions at any point, use AskUserQuestion to ask me. Don't guess on metric definitions.

First, pull the latest lab4-staging and create a new branch from it: lab4/feat/6-dashboard-api

Find the "Dashboard APIs" issue on my Kanban board (github.com/users/gxjakkap/projects/5) and move it to "Started".

Context: Issues #2 (migration + seed), #3 (Actions Taken API), and #4 (Ticket workflow + resolution gate) have all merged into lab4-staging. This issue is read-only over the data and doesn't change their behavior, but it should reuse what they built:
- The shared rule-violation error class and the consolidated staff-roles const from the #3/#4 consolidation. Don't redefine roles or error types.
- The Ticket status history table from #2/#4. If the spec defines time-based metrics like "recently resolved" or "status changed since", base them on status history timestamps rather than Ticket.updatedAt, unless the spec says otherwise.
- The Actions Taken list item shape from #3 (display-safe performedBy, and assignee/status if present). The staff dashboard's "my recent actions" items should match it, or be a documented subset of it, so the UI in #7 can reuse components.
- client/src/lib/datetime.ts (Bangkok formatDateTime) exists on the client. There may not be a server-side Bangkok date-boundary helper yet. Check first; create one in server/src/lib/ only if nothing suitable exists.

Before writing anything:
- Read docs/lab-04/specification.md (every dashboard metric BR: name, calculation, empty behavior, drill-down destination, Asia/Bangkok date boundary rules) and api-spec.md (dashboard endpoints, response shapes, drill-down query params, any Queue / My Tickets filter params added for drill-down).
- Read the merged #3 and #4 code (shared modules, the status history model, the transition matrix definition) and the existing Lab 3 Ticket Queue and My Tickets list endpoints with their filter/sort/pagination handling.
- If any metric's calculation is ambiguous (e.g. whether "open" includes Reopened, or which timestamp "recently resolved" uses), ask me before implementing.

Your task:

1. Requester dashboard endpoint (path per api-spec.md)
   - Every metric and list is scoped to the authenticated Requester's own Tickets only, enforced in the query itself, not filtered afterward.
   - Metrics per spec (e.g. open, waiting for Requester, in progress, resolved, closed), plus short lists: attention-required, recently updated, recently resolved. Lists follow the spec's size limit and order (stable tiebreaker on id).
   - IT Staff/Admin calling it gets the spec's behavior (403, or their own Requester view if the spec says so).

2. IT Staff dashboard endpoint (Admin uses the same endpoint or variant per spec)
   - Metrics per spec: e.g. counts by status, unassigned, owned by the current user, by IT Priority, recent or urgent Tickets, and the current user's recent Actions Taken (grading Part 5 checks this one).
   - Admin: the same data plus optional concise user-account counts if the spec includes them. No full user lists.
   - A Requester gets 403.
   - If the spec has "from yesterday" deltas like the mockup, implement them exactly as specified, using status history where a status count at a past point in time is needed. If the spec dropped them, don't add them.

3. Calculation rules
   - All counts are calculated by the backend from authoritative data. Use Prisma count/groupBy (or one parameterized raw query if clearer), never "fetch everything and count in JS."
   - Status groupings (e.g. which statuses count as "open") come from one definition shared with or derived from #4's transition matrix module, not a second hardcoded list.
   - Date boundaries: compute "today", "recent", and so on in Asia/Bangkok, then convert to UTC for the queries. Put this in one tested server helper.
   - Empty behavior per spec: zero counts return 0 (never null or missing), and empty lists return [].
   - Each metric carries its drill-down target as the spec defines (route + query params), so #7/#8 don't hardcode filters.
   - The response is concise. No full Ticket collections; list items carry only the fields the spec lists.

4. Drill-down filter support on existing list endpoints
   - If api-spec.md adds query params to the Ticket Queue or My Tickets endpoints for drill-down (e.g. status, ownership=me, unassigned, priority, updatedSince), implement them here. Keep existing params and behavior unchanged, and validate new params with the shared error shape.
   - A card's count must equal the total its drill-down list returns for the same user. Test that directly.

5. Tests
   - server/tests/lab-04/requester-dashboard.api.test.ts: only own Tickets counted (data for two Requesters, assert no leakage, AC-02); each metric matches its spec calculation; zero-data Requester gets 0s and []; list size and order; unauthenticated returns 401; wrong role per spec; date-boundary behavior around Bangkok midnight; card count equals drill-down total.
   - server/tests/lab-04/staff-dashboard.api.test.ts: each metric matches its calculation; "mine" scoped to the current user; unassigned correct; recent Actions Taken include only the current user's actions and match the #3 item shape; Admin variant; Requester gets 403; zero-data behavior; time-based metrics use status history correctly (e.g. a Ticket resolved then reopened); card count equals drill-down total for every metric with a drill-down.
   - Unit test for the Bangkok date-boundary helper.
   - Tests for new Queue / My Tickets filter params, including invalid values and unchanged old behavior.
   - Performance-smoke test for the dashboard endpoints against the spec's threshold, if tests.md planned it for this issue.
   - Update docs/lab-04/tests.md: only the rows for this issue (real paths and status).
   - Run the full suite (Lab 2/3, #2, #3's actions-taken tests, #4's workflow tests, plus these) and confirm nothing regressed, especially the existing Queue and My Tickets tests.

Do not build any dashboard UI (#7/#8) or change Actions Taken or workflow behavior. If you find a bug in #3/#4 code, don't fix it here. Note it in the PR and tell me. Don't touch docs/lab-04/ai-use.md or reviewer.md.

When done:
- Commit on this branch.
- Open a PR against lab4-staging named exactly "[Lab 4] 6: Dashboard APIs".
- Request a review from fakekase (`--reviewer fakekase`).
- Link the PR to the GitHub issue (Closes #<issue number>). Use the issue description as the base for the PR description and run it through unslop. Include a table of every metric (name, calculation, empty value, drill-down target), the timezone handling, which #3/#4 modules were reused, any new list filter params, and key decisions.
- Move the Kanban card to "PR Review".
- Report back with the PR link, the test output summary, and any spec ambiguities.
```

### Reflection
Worked in one shot.

## Issue 7

I used Claude Sonnet 5 with thinking level high on Claude Code to implement IT Staff dashboard UI.

### Actual prompt
```
/caveman ultra

We're continuing Lab 4 (CPE 334, TokTickIT project), Issue #7: "IT Staff Dashboard UI."

Caveman mode applies only to your chat replies to me. Code, comments, docs, commit messages, and the PR description must be normal, complete English.

If you have questions at any point, use AskUserQuestion to ask me. Don't guess on layout, metrics, or navigation the spec doesn't cover.

First, pull the latest lab4-staging and create a new branch from it: lab4/feat/7-staff-dashboard-ui
Check that #6 (Dashboard APIs) has merged. If it hasn't, stop and ask me. Also check whether #5 (Actions Taken UI) has merged; see the note in step 3.

Find the "IT Staff Dashboard UI" issue on my Kanban board (github.com/users/gxjakkap/projects/5) and move it to "Started".

Context: #2, #3, #4, and #6 are merged into lab4-staging. #8 (Requester Dashboard UI) will be built after or alongside this one and should reuse the dashboard building blocks you create here, so put them in a shared location (e.g. client/src/components/dashboard/) with props general enough for both roles.

Before writing anything:
- Read docs/lab-04/ui-spec.md (the IT Staff dashboard: cards, lists, quick actions, responsive arrangement, loading/empty/forbidden/safe-failure states, Dashboard nav and active-page rules, the Admin dashboard variant, the accessibility checklist), specification.md (dashboard metric BRs and ACs), and api-spec.md (the staff dashboard endpoint and drill-down params).
- Read the merged #6 code: the response shape, how each metric carries its drill-down target, and the Queue filter params it added.
- Read the Lab 3 app shell (nav, role-based routing, profile menu), the IT Staff Ticket Queue (filters and URL query handling), and the Zen Green components.
- Look at the handout mockup for the IT Staff dashboard (section 8.1): welcome header, a row of metric cards, a "My Recent Tickets" list with status badges, and Quick Actions. Follow ui-spec.md where it differs from the mockup.

Your task:

1. Route and navigation
   - Add the staff dashboard route. IT Staff and Admin can reach it; a Requester going to the URL directly gets the forbidden state or a redirect per ui-spec (the backend 403 stays the authority).
   - Add "Dashboard" to the IT Staff/Admin nav with clear active-page indication (visual plus aria-current), consistent with the existing nav items.
   - Set the post-login landing page for IT Staff/Admin per ui-spec (likely the dashboard). Don't break deep links or the Lab 3 mandatory password-change redirect.

2. Metric cards
   - One card per metric from #6, in ui-spec order, each showing a label, a value, and an accessible drill-down action (a real link or button with a descriptive accessible name like "View 14 unassigned tickets", not just "View all").
   - Drill-down uses the target #6 returns. Don't hardcode filters in the UI. It lands on the Ticket Queue with the matching filters applied and visible in the Queue's filter controls, so the user can see why the list is filtered.
   - Deltas ("+3 from yesterday") only if #6/the spec provides them, with a non-color cue for direction (sign/icon plus text).
   - Zero values display as 0 with the spec's empty wording, not as a blank or a loading spinner.

3. Lists
   - Recent/urgent Tickets list per spec: Ticket number, title, status badge (text, not color only), and Bangkok time via client/src/lib/datetime.ts. Each row links to Ticket Detail. "View all" goes to the Queue.
   - Current user's recent Actions Taken (grading Part 5): each item shows the Ticket number, a short description, result/status, and the time, and links to that Ticket's Detail scrolled to or highlighting the action if that's practical. If #5 has merged, reuse its Actions Taken item/badge components rather than restyling. If it hasn't, build a minimal item in the shared dashboard folder and flag it in the PR for later consolidation.
   - Empty states per ui-spec for each list.

4. Quick actions and Admin variant
   - Quick actions per ui-spec (e.g. My Queue, Search Tickets). Only include actions that lead to real, working screens. No placeholder buttons (handout 8.5 says to remove unfinished controls). Leave out "Create Ticket" for staff unless the spec says staff can create Tickets.
   - Admin: the same dashboard plus the concise user-account counts from #6 if present, with drill-down to Admin User Management filtered appropriately. No full user lists on the dashboard.

5. States and behavior
   - Loading skeletons in the card/list shapes (no layout jump when data arrives), the forbidden state, and a safe-failure state with a retry. A failed refresh keeps the last good data visible with an error notice instead of blanking the page.
   - A refresh button per the mockup/spec that re-fetches without a full page reload, disabled while fetching.
   - Welcome header using the authenticated user's name.

6. Responsive and accessibility
   - Desktop: card row plus a two-column lower section, as in the mockup. Tablet: wrapped card grid. Mobile: single column, cards readable, no horizontal page scroll, no clipped labels (e.g. "Waiting for Requester" wraps cleanly).
   - Semantic structure (headings, lists, landmarks), keyboard reachable in a logical order, visible focus, non-color status cues. Card values and labels read correctly to screen readers (e.g. "Unassigned: 4").

7. Tests
   - client/.../lab-04 tests/StaffDashboard.test.tsx (the real client test location): renders every metric card from mocked #6 data; zero values; each drill-down link points to the target #6 returned; recent Tickets and recent Actions Taken render and link correctly; empty states; loading; forbidden; safe failure with retry; refresh keeps old data on failure; Admin variant shows user counts; the Requester can't see the Dashboard nav item.
   - Extend e2e/lab-04/dashboards.spec.ts (create it if missing; #8 adds the Requester part): log in as seeded IT Staff, check that the card counts match the seeded database (query through the API or a test helper, not hardcoded numbers), click a card drill-down, confirm the Queue shows the same number of results with filters visible, open a recent Ticket and a recent action, log in as Admin and see the variant, try the dashboard URL as a Requester.
   - Responsive checks at desktop/tablet/mobile widths using the Lab 3 approach.
   - If the Queue needed changes to read drill-down params from the URL, add or extend its tests too.
   - Update docs/lab-04/tests.md: only the rows for this issue (real paths and status).
   - Run the full suite (Lab 2/3, #2-#6, plus these) and confirm nothing regressed, especially the Lab 3 nav, routing, login redirect, and Queue tests.

Do not build the Requester dashboard (#8) or change dashboard API behavior. If #6's response is missing something ui-spec needs, flag it in the PR and ask me rather than patching the API here. Screenshots for grading happen in #11. Don't touch docs/lab-04/ai-use.md or reviewer.md.

When done:
- Commit on this branch.
- Open a PR against lab4-staging named exactly "[Lab 4] 7: IT Staff Dashboard UI".
- Request a review from fakekase (`--reviewer fakekase`).
- Link the PR to the GitHub issue (Closes #<issue number>). Use the issue description as the base for the PR description and run it through unslop. Summarize the cards and lists, drill-down behavior, nav and landing changes, the Admin variant, the shared dashboard components #8 should reuse, and key decisions.
- Move the Kanban card to "PR Review".
- Report back with the PR link, the test output summary, and any spec or API gaps.
```

### Reflection
Some inconsistencies with the specs, which was caught in the review process.

## Issue 9

I used Claude Opus 5.5 with thinking level high on Claude Code to finalize the UI for this sprint.

### Actual prompt
```
/caveman ultra

We're continuing Lab 4 (CPE 334, TokTickIT project), Issue #9: "Final hardening + Zen Green polish."

Caveman mode applies only to your chat replies to me. Code, comments, docs, commit messages, and the PR description must be normal, complete English.

If you have questions at any point, use AskUserQuestion to ask me. Always ask before removing a screen, route, or control that a user can currently reach. "Leftover" to you may be a graded feature to me.

First, pull the latest lab4-staging and create a new branch from it: lab4/feat/9-final-hardening
Check that #4, #5, #7, and #8 have merged. If any haven't, stop and ask me.

Find the "Final hardening + Zen Green polish" issue on my Kanban board (github.com/users/gxjakkap/projects/5) and move it to "Started".

Context: all Lab 4 features (#2-#8) are on lab4-staging. This issue adds no new product features. It makes the whole app (Labs 1-4) consistent, robust, accessible, and demo-ready, per handout sections 7 and 8.5 and the visual/accessibility checklist in ui-spec.md. #10 (full test coverage and traceability) comes after this, so add tests here only for the things you fix. Don't attempt the full regression suite.

Before writing anything:
- Read docs/lab-04/ui-spec.md (especially the visual and accessibility checklist and the feedback-state conventions), specification.md (Definition of Done, hardening FRs/BRs/ACs), api-spec.md (the error shapes), and the Lab 2/3 ui-specs for the conventions being preserved.
- Read the PR descriptions for #3-#8 (`gh pr list --base lab4-staging --state merged`, then `gh pr view`) and collect every "flagged for later", "noted for hardening", or "out of scope here" item. Those are this issue's backlog too.

Step 1: Audit first, then fix. Don't fix while auditing.
Run the app with the seeded data and go through every screen for every role (Requester, IT Staff, Admin, plus the requiresPasswordChange and inactive accounts): login, change password, shell/nav, both dashboards, My Tickets, Create Ticket, Ticket Detail (Requester and staff), attachments, Public Comments, Internal Notes, Actions Taken, status controls, Ticket Queue, Admin User Management. Use Playwright to walk the screens at desktop (1440), tablet (768), and mobile (375) widths.

Write findings to a scratch file (not committed) grouped as:
- feedback-state gaps: loading, validation, success, empty vs no-results, forbidden, conflict, not-found, safe API failure. Each screen should handle every state that can occur, using the same components and wording style.
- duplicate-action risks: any submit/mutation without in-flight disabling or retry safety.
- form-data loss: any important form that clears or loses input on a recoverable failure.
- console errors/warnings, broken links, placeholder text, unfinished or non-functional controls, dead routes.
- leftover/duplicate/inconsistent UI from Labs 1-3 (e.g. any Development Requester remnants, duplicate buttons, one-off styles that bypass Zen Green components, inconsistent badges for the same status).
- visual: clipping, overlap, horizontal page scroll, misaligned or inconsistent spacing, status/priority/private-vs-shared not visually distinct.
- accessibility: missing labels, focus not visible, keyboard traps or unreachable controls, modals without focus management, color-only cues, missing aria-current, heading order. Run @axe-core/playwright (add it as a dev dependency if missing) on every screen and record violations.
- the flagged items collected from #3-#8 PRs.

Then send me the findings list with AskUserQuestion, grouped and prioritized, so I can confirm scope before you change code. Mark anything that would remove a user-reachable element.

Step 2: Fix (after I confirm)
- Make feedback states consistent. Reuse or extract shared components (e.g. one ErrorState, EmptyState, ConflictNotice) and wire every screen to them. 401 goes to login, the requiresPasswordChange redirect keeps working, 403 shows the forbidden state, 404 shows not-found, 409 shows conflict feedback with reload, 5xx shows the safe failure with retry, with no stack traces or raw server messages shown.
- Duplicate-action protection on every mutation: disable while in flight, and pass through the idempotency mechanism from #3 where the API supports it.
- Keep entered data after recoverable failures on Create Ticket, comment/note composers, Actions Taken forms, status-change reasons, admin user forms, and change password (keep the fields, but never re-display a password the user didn't type).
- Remove console errors and warnings (React key warnings, act warnings in tests, failed requests), broken links, placeholder text, and unfinished controls.
- Remove confirmed leftover/duplicate UI and align one-off styling to the Zen Green components.
- Fix every visual and accessibility finding. axe should report zero serious/critical violations on every screen.
- Fix confirmed bugs flagged in #3-#8 PRs, each in its own commit with a clear message, and keep API behavior consistent with api-spec.md (if a fix needs a spec change, ask me first).
- README: bring setup, environment variables, migration, rollback/recovery, seed, test commands (unit, API, UI, E2E), and demo instructions up to date. Include the seeded demo accounts by role, which seeded users demonstrate zero vs non-zero dashboard metrics, and a short demo script that walks through the Lab 4 grading parts (staff dashboard, Actions Taken, Ticket workflow, Requester dashboard). Follow the README's existing style.

Step 3: Evidence and tests
- Tick every item in the ui-spec.md visual and accessibility checklist, each with a note on how it was verified (test name, axe run, or manual check at a given width). If an item can't be met, leave it unticked with the reason, and tell me.
- Add a Playwright test (location per tests.md, e.g. e2e/lab-04/hardening.spec.ts) that visits every major screen per role and fails on any console error, any failed same-origin request other than expected 4xx in negative cases, any horizontal overflow at 375/768/1440, and any serious/critical axe violation.
- Add focused tests for each fix (duplicate-submit prevention, form data kept after failure, each new feedback state) next to the relevant existing test files.
- Update docs/lab-04/tests.md: only rows for this issue (real paths and status).
- Run the full suite (Labs 1-3, #2-#8, plus these) and confirm nothing regressed.

Do not add product features, change business rules, or change API contracts. Screenshot capture for grading happens in #11. Don't touch docs/lab-04/ai-use.md or reviewer.md.

When done:
- Commit on this branch (group commits by finding category; bug fixes from #3-#8 get one commit each).
- Open a PR against lab4-staging named exactly "[Lab 4] 9: Final hardening + Zen Green polish".
- Request a review from fakekase (`--reviewer fakekase`).
- Link the PR to the GitHub issue (Closes #<issue number>). Use the issue description as the base for the PR description and run it through unslop. Include a findings-vs-fixes table by category, the axe result summary, anything removed (and that I approved it), README changes, and any checklist items left open.
- Move the Kanban card to "PR Review".
- Report back with the PR link, the test output summary, and any open items.
```

### Reflection
Check and fixes some UI inconsistencies and nitpicks around the UI. However it still left some gaps caught by the reviewer.

## Issue 10

I used Claude Opus 5.5 with thinking level high on Claude Code to check on test coverage.

### Actual prompt
```
/caveman ultra

We're continuing Lab 4 (CPE 334, TokTickIT project), Issue #10: "Test DD + full regression coverage."

Caveman mode applies only to your chat replies to me. Code, comments, docs, commit messages, and the PR description must be normal, complete English.

If you have questions at any point, use AskUserQuestion to ask me. Don't guess on what an AC means. Ask before changing app code to make a test pass.

First, pull the latest lab4-staging and create a new branch from it: lab4/feat/10-test-coverage
Check that #2-#9 have all merged. If any haven't, stop and ask me.

Find the "Test DD + full regression coverage" issue on my Kanban board (github.com/users/gxjakkap/projects/5) and move it to "Started".

Context: every Lab 4 feature and the hardening pass are on lab4-staging. Each earlier issue wrote its own tests and filled in its own rows in docs/lab-04/tests.md. This issue is the integration pass: it makes tests.md complete and traceable, closes coverage gaps, adds the Labs 1-3 regression suite, and produces the evidence for grading Part 3 (and the metric-vs-database evidence for Part 5).

Important: tests.md must read as a plan driven by the acceptance criteria, not a list rebuilt from whatever tests exist. Start from the ACs in specification.md, work forward to tests, then reconcile with what #2-#9 already wrote. Extend the existing file; don't rewrite rows earlier issues completed unless they're wrong.

Before writing anything:
- Read docs/lab-04/specification.md (every FR, BR, AC, and the Definition of Done), ui-spec.md (including the checklist #9 ticked), api-spec.md, and the current tests.md.
- Read docs/lab-03/tests.md and docs/lab-02/tests.md to see what regression coverage already exists from earlier labs.
- List every existing test file (server, client, e2e) and run the full suite once to get a baseline: pass/fail counts and any flaky tests.

Your task:

1. docs/lab-04/tests.md
   - Use the handout format: Test ID, Type, Requirement/AC, What It Tests, Expected Result, Automated Test File, Final.
   - Cover every type the handout requires: unit, API/integration, UI component, UI style, responsive, authorization, workflow, migration/regression, performance-smoke, and E2E.
   - Every AC maps to at least one test, and every test row points to a real file and test name. Add a traceability matrix (AC -> Test IDs) and an FR/BR -> Test IDs matrix. Flag any AC with no test. The goal is zero.
   - Make sure the plan covers what handout section 10 lists: all UI, dashboard calculations, drill-down, role restrictions, concurrent/stale updates, safe failures, responsive behavior, accessibility, and complete Labs 1-3 regression.
   - "Final" holds the real result from the last run (Pass, or Fail with a reason). Never mark something Pass that you didn't run.

2. Gap analysis and new tests
   - Compare tests.md against the actual test files and write the missing ones. Don't duplicate existing tests.
   - Lab 4 areas to check specifically: every cell of the Ticket transition matrix (allowed and denied, per role); resolution gate edge cases (cancelled actions, open follow-ups, reopened Tickets); Actions Taken create/edit/status per role, including inactive-assignee rejection if the spec has assignees; stale updates on both Tickets and Actions Taken; duplicate submit on every mutation that has protection; every dashboard metric's calculation, zero value, and card-count-equals-drill-down-total; Bangkok midnight boundaries; Requester ownership across dashboards, My Tickets drill-downs, Ticket Detail, and Actions Taken.
   - Required files from handout section 12 must all exist and be non-trivial: server/tests/lab-04/{actions-taken,ticket-workflow,requester-dashboard,staff-dashboard}.api.test.ts; client/.../lab-04 tests/{StaffDashboard,RequesterDashboard,ActionsTaken,TicketWorkflow}.test.tsx; e2e/lab-04/{actions-taken-flow,ticket-resolution,dashboards}.spec.ts.

3. Labs 1-3 regression
   - Make sure the regression suite exercises, against the Lab 4 schema and seed: Lab 1 health check; Lab 2 Create Ticket with validation, attachments (type/size/count limits, soft-removed attachment behavior), My Tickets search/filter/sort/pagination, Ticket Detail ownership; Lab 3 login (valid, invalid, inactive), mandatory password change, logout, role navigation, direct API authorization, IT Staff Queue, claim/reassign, IT Priority, Public Comments vs Internal Notes visibility, Admin user management (create, duplicate email, edit, one role, activate/deactivate, new initial password, self-deactivation block, last-active-Administrator block, non-Admin forbidden).
   - Re-run the Lab 2 and Lab 3 tests as they are. If some no longer pass because Lab 4 intentionally changed behavior (e.g. the transition matrix), update them and list each change with the BR that justifies it. If one fails for any other reason, it's a regression: don't change the test, tell me.
   - Add one E2E regression journey (e.g. e2e/lab-04/regression.spec.ts) that crosses all three roles in a single flow: Requester creates a Ticket with an attachment; IT Staff claims it, adds an Internal Note, a Public Comment, and two Actions Taken by different staff, and resolves it; the Requester sees the comment and actions but not the note, and their dashboard updates; Admin deactivates and reactivates a staff user.

4. Migration and performance smoke
   - Make sure the migration test from #2 still passes against the final schema (Lab 3 data preserved, legacy Tickets have zero actions).
   - Run the seed twice in a test and assert idempotency still holds after #3-#9.
   - Performance-smoke: dashboard endpoints, Queue, My Tickets, and the Actions Taken list respond within the thresholds in tests.md on the seeded data. If no thresholds were set, ask me before picking numbers.

5. Dashboard metric evidence (grading Part 5)
   - Add a test or script (e.g. server/tests/lab-04/dashboard-metrics-evidence.test.ts) that, for a seeded IT Staff user and a seeded Requester, computes every metric with an independent raw SQL query and asserts it equals the dashboard API value. Print a readable table (metric, SQL, expected, API value) so I can screenshot it.

6. Run and evidence
   - Run the full suite three times in a row to catch flakiness. Fix flaky tests (timing, order dependence, shared state) without weakening their assertions.
   - If the project has coverage tooling, produce a coverage summary. Don't add a new coverage tool just for this.
   - Save the final passing output from lab4-staging to artifacts/lab-04/test-output/ (one file per suite: unit/API, client, E2E, plus the metric evidence table), with the date and commit hash at the top. #11 re-runs this on main for the final evidence.
   - Make sure the README test commands match what you ran.

Don't change application behavior. If a new test exposes a real bug, stop and tell me with AskUserQuestion: whether to fix it here (small, isolated) or leave the test failing with a note. Don't touch docs/lab-04/ai-use.md or reviewer.md.

When done:
- Commit on this branch.
- Open a PR against lab4-staging named exactly "[Lab 4] 10: Test DD + full regression coverage".
- Request a review from fakekase (`--reviewer fakekase`).
- Link the PR to the GitHub issue (Closes #<issue number>). Use the issue description as the base for the PR description and run it through unslop. Include pass/fail counts per suite, AC coverage (n/n mapped), the list of new test files, any Lab 2/3 tests changed and why, flakiness fixes, and any bugs found.
- Move the Kanban card to "PR Review".
- Report back with the PR link, the test summary, and any ACs or bugs still open.
```

### Reflection
It checked every tests and ran it. Got a straight pass from the reviewer.

## My Reflection

**Specification agent.** Writing the contract first with Claude Sonnet 5 in Issue 1 paid off. It produced four documents that mostly agreed with each other and with Lab 3, and every later prompt could point at a rule ID instead of explaining the feature again. The gaps it left were between documents and at the edges: a rule that was only in api-spec, a migration backfill that depended on the database time zone, and no place in the order of checks for an idempotent replay. My reviewer found all three before any code was written, which was much cheaper than finding them later.

**Coding agents.** With the contract in place, Claude Opus 5.5 implemented each issue close to the spec and wrote the tests along with the code. It missed the same two kinds of thing each time. One was state while a request is still in flight, like a form or dialog that could close mid-save. The other was input with the right shape but an impossible value, like 31 February, a page past the end, or an id bigger than int4. It covered what the spec spelled out and not much past it. Peer review caught these on six of the ten feature PRs. When I gave the agent the reviewer's steps, it fixed them and added a test that failed on the old code.

**What I'd keep.** Planning every issue in one conversation and having it draft each issue's prompt kept the prompts consistent. Telling the agent to ask with AskUserQuestion stopped it from making scope calls on its own. I still had to read and edit every prompt before using it, and a human reviewer still found things the agent and I both missed.
