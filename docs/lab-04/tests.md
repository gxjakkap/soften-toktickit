# Lab 4 Test Plan and Results

This is the Lab 4 test plan and its results. The first pass was written
with the engineering contract (Issue #61), before any implementation, from
`specification.md` (FR-01–25, BR-01–55, AC-01–47, §7 data changes),
`api-spec.md`, and `ui-spec.md`. Each implementation issue (#62–#69) filled
in its own rows. Issue #70 reconciled the plan: it walked every acceptance
criterion forward to its tests, compared the plan with the test files,
wrote the missing tests, and set the Final column from the last full run
(§7). A row's Final value is the result of that run, never a prediction.

Earlier labs' acceptance criteria stay in force. `docs/lab-02/tests.md` and
`docs/lab-03/tests.md` still apply. Lab 3 tests that change because this
contract supersedes a Lab 3 rule are listed in §6, with the rule that
changed them.

Test IDs restart for Lab 4. Each test file opens with a comment naming its
`API-nn`/`UI-nn`/… IDs and the ACs it covers (repository convention,
`CLAUDE.md`). Each test, or the `describe` block around it, carries its Test
ID in its name, so `grep -rn "API-05" server/tests/lab-04` finds the exact
test a row describes.

## 1. Test Strategy

- **Unit**: pure logic with no DB or HTTP. Covers the resolution gate
  function, Action status transitions and field locks, Asia/Bangkok day
  boundaries, and the client date formatter. Server unit tests live in
  `server/tests/lab-04/`, client ones in `client/tests/lab-04/`.
- **API / integration**: Vitest + Supertest against the real Postgres test
  database, one file per resource area named in handout §12, under the
  fixture rules in `server/AGENTS.md` (unique `TAG`, children deleted
  before parents, `fileParallelism: false`).
- **Authorization**: one table-driven matrix
  (`server/tests/lab-04/authorization-matrix.api.test.ts`) over every Lab 4
  new or changed endpoint × {unauthenticated, Requester, IT Staff,
  Administrator}, asserting each denial and that every allowed role reaches
  the handler. This is the same pattern as Lab 3 SEC-01.
- **Workflow**: the full 8 × 8 status matrix, the gate, concurrency, and
  history, all through direct API calls so the UI is bypassed (handout
  §4.5).
- **Dashboard calculation**: each metric is compared with an independent
  Prisma query on the same fixture data, and checked with a zero case and
  a boundary case.
- **Migration / regression**: the real Lab 4 migration and rollback SQL run
  against a scratch database seeded with Lab 3-shaped rows. The seed
  idempotency test is extended. The full Lab 1–3 server, client, and E2E
  suites run unchanged except for §6.
- **UI component**: Vitest + jsdom + Testing Library, with `fetch` stubbed
  per URL (`client/AGENTS.md`), rendering `AppRoutes`.
- **UI style / responsive / accessibility**: Playwright screenshots at three
  viewports with a `scrollWidth` assertion, keyboard-only traversal checks,
  and a `@axe-core/playwright` scan of every Lab 4 screen.
- **Performance smoke**: dashboard and list endpoints timed on the seeded
  database plus 2,000 generated Tickets and 6,000 Actions.
- **E2E**: Playwright full flows for Actions Taken, resolution, dashboards
  and drill-down, and a cross-role regression tour.
- **Dashboard evidence**: one file recomputes every dashboard value for
  seeded users with raw SQL that shares no code with the handlers, and
  prints a metric/SQL/expected/API table (EVID-01, grading Part 5).

### 1.1 Coverage by Test Type

Every test type the handout requires, with the rows that cover it:

| Type | Test IDs |
| --- | --- |
| Unit | UNIT-01–UNIT-08 |
| API / integration | API-01–API-58, EVID-01 |
| UI component | UI-01–UI-51 |
| UI style | STYLE-01–STYLE-03, UI-48, UI-49, HARD-03 |
| Responsive | STYLE-01, STYLE-02, HARD-01 (1440/768/375 on every major screen), the responsive cases in `e2e/lab-04/dashboards.spec.ts` |
| Authorization | SEC-01–SEC-04, API-01, API-17, API-27, API-37, API-43, API-56, API-57, plus Lab 3 SEC-01–SEC-05 (§9) |
| Workflow | API-20–API-35, API-56, API-57, UI-24–UI-31, E2E-03–E2E-07 |
| Migration / regression | MIG-01–MIG-09, E2E-12, and the Lab 1–3 regression map (§9) |
| Performance smoke | PERF-01–PERF-03 |
| E2E | E2E-01–E2E-13, A11Y-02 |

### 1.2 Coverage of Handout §10

| Handout §10 area | Test IDs |
| --- | --- |
| All UI | UI-01–UI-51; HARD-01 opens every major screen for every role |
| Dashboard calculations | API-38, API-44–API-47, API-52, API-58, EVID-01, E2E-08, E2E-09 |
| Drill-down | API-41, API-50, API-42, API-51, UI-02, UI-09, UI-34–UI-37, E2E-08, E2E-09 |
| Role restrictions | SEC-01–SEC-04, API-01, API-17, API-27, API-37, API-43, API-56, API-57, UI-22, UI-32, UI-40 |
| Concurrent and stale updates | API-11, API-14, API-28, API-29, API-31, UI-18, UI-20, UI-28, E2E-06 |
| Safe failures | API-53, API-54, UI-04, UI-10, UI-19, UI-37, UI-40, UI-43–UI-46, UI-50, HARD-01 |
| Responsive behavior | STYLE-01, STYLE-02, HARD-01 |
| Accessibility | A11Y-01, A11Y-02, HARD-01, HARD-03, UI-23, UI-47 |
| Complete Labs 1–3 regression | MIG-07–MIG-09, E2E-12, §9 |

## 2. Tests

### 2.1 Unit

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-01 | Unit | BR-18, AC-16, AC-17, AC-18 | `evaluateResolutionGate(actions)` | Returns `canResolve` and reasons in fixed order for: no Actions; only Cancelled; one Done; Done + Planned; Done + In Progress; Done with follow-up; Cancelled with follow-up (ignored); all three failing | `server/tests/lab-04/resolution-gate.unit.test.ts` | Pass |
| UNIT-02 | Unit | BR-07 | `canTransitionAction(from, to)` | Exactly the 6 permitted pairs are true; all 10 others (incl. from Done/Cancelled and same-status) false | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-03 | Unit | BR-09 | `lockedFieldChanged(action, patch)` | Planned/In Progress: none locked; Done: only follow-up fields and attachment notes editable; Cancelled: all locked; unchanged values never count as changes | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-04 | Unit | BR-06, BR-05, BR-08 | Action payload validation | Trims; enforces lengths; follow-up note required iff follow-up; note nulled when follow-up false; Result required for Done; future `actionAt` rejected only for Done; offset-less timestamp rejected | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-05 | Unit | BR-34, AC-29 | `startOfBangkokDay`, `bangkokDateString` | `2026-10-06T16:59:59.999Z` → `2026-10-06`; `2026-10-06T17:00:00.000Z` → `2026-10-07`; start of `2026-10-07` = `2026-10-06T17:00:00Z`; 30-day window start | `server/tests/lab-04/bangkok-time.unit.test.ts` | Pass |
| UNIT-06 | Unit | BR-21 | `nextResolvedAt(to, now, current)` | Set on →Resolved; kept on Resolved→Closed; cleared on →Reopened; unchanged otherwise | `server/tests/lab-04/ticket-workflow.unit.test.ts` | Pass |
| UNIT-07 | Unit | BR-33, AC-37 | Client `formatDateTime` / `formatDate` | With `TZ=America/New_York`, renders `2026-10-06T07:05:00Z` as `6 Oct 2026, 14:05`; date-only form; `<time dateTime>` value is the ISO input; September reads `Sep` | `client/tests/lab-04/datetime.test.ts` | Pass (the `<time dateTime>` wrapper is checked by HARD-02) |
| UNIT-08 | Unit | BR-16 | Client and server matrices agree | `client/src/lib/ticket-status.ts` and `server/src/lib/ticket-status.ts` yield identical permitted sets for all 8 statuses | `client/tests/lab-04/ticket-status-parity.test.ts` | Pass |

### 2.2 API / Integration

**Actions Taken** (`server/tests/lab-04/actions-taken.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | API | AC-06, BR-12 | Staff Action endpoints, wrong role | 401 no session; 403 Requester on GET/POST/PATCH | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-02 | API | FR-02, BR-13, AC-15 | `GET /api/staff/tickets/:id/actions` order | `actionAt asc, id asc` with tied timestamps; Cancelled included; repeated calls identical; `[]` for a Ticket with none; 404 unknown Ticket | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-03 | API | AC-01, FR-01, BR-01, BR-04 | Create a valid Action Taken | 201; saved under the path Ticket; `performedBy` = caller; `assignedTo` = requested active user; `assignedTo` defaults to caller when omitted | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-04 | API | AC-03, BR-03 | Spoofed `performedById`/`ticketId` in body | Ignored on create and on update; `performedBy` never changes | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-05 | API | AC-04, BR-06 | Follow-up without note | 400 `field: followUpNote` for missing, empty, and whitespace note; no row inserted; note sent with follow-up false is stored `null` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-06 | API | AC-05, BR-04 | Invalid assignee | 400 `INVALID_ASSIGNEE` for inactive IT Staff, a Requester, and a nonexistent id, on create and on update; Administrator assignee accepted | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-07 | API | BR-05 | Field validation | 400 with correct `field` for empty/oversize description, oversize result/attachment notes, bad `actionAt`, `actionAt` before the Ticket's creation minute (Ticket created 10:00:30: 10:00:00 accepted, 09:59:59 rejected), `status: CANCELLED` on create, non-UUID `clientRequestId`, body-less request (not 500) | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-08 | API | AC-09, BR-08 | Done without Result / future Done | 400 `field: result`; 400 `field: actionAt` for >5 min future; Planned with future `actionAt` accepted | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-09 | API | FR-03, BR-07, AC-10 | Status transitions on update | All 6 permitted succeed and bump `version`; Done→anything and Cancelled→anything 409 `INVALID_ACTION_TRANSITION` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-10 | API | AC-10, AC-11, BR-09 | Field locks | Done: follow-up cleared OK; description change 409 `ACTION_LOCKED` `field: description`; Cancelled: any change 409; resending unchanged locked values 200 | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-11 | API | AC-08, BR-25, BR-26 | Stale Action update | Two updates from version n: first 200 (n+1), second 409 `STALE_UPDATE` with `details.current` = stored Action; stored values are the first update's | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-12 | API | BR-25 | Missing/invalid `version` on update | 400 `field: version`; no-op body with correct version returns 200 without increment | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-13 | API | AC-12, BR-10 | Non-active Ticket | Create and update 409 `TICKET_NOT_ACTIONABLE` on Resolved, Closed, Cancelled; allowed again after Reopened | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-14 | API | AC-13, BR-14, FR-06 | Idempotent create | Same caller + `clientRequestId` twice → 201 then 200, one row, same id; concurrent duplicate (two parallel requests) → one row; different user same key → two rows; same key on another Ticket → 400; replay after the Ticket was resolved (first attempt saved, response lost) → 200 with the saved Action, not `TICKET_NOT_ACTIONABLE` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-15 | API | AC-14, BR-02, BR-11 | Multiple performers on one Ticket | Owner A; B (IT Staff) and Admin create Actions; list shows three different `performedBy`; Ticket `ownerId` still A and `version` unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-16 | API | BR-27 | Activity touches `updatedAt` | Action create/update and comment/note post advance Ticket `updatedAt`, leave `version` unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-17 | API | AC-06, AC-07, FR-05, BR-12 | `GET /api/tickets/:id/actions` (Requester) | Own Ticket: 200, every field incl. follow-up note and attachment notes, same order as staff list; other Requester's Ticket 404; IT Staff caller 403; POST/PATCH under `/api/tickets/:id/actions` not routable (404) | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-18 | API | BR-04 | Inactive existing assignee kept | Action assigned to a user later deactivated: an update not sending `assignedToId` succeeds; response shows `assignedTo.isActive: false` | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| API-19 | API | api-spec.md §2.3 | Action from another Ticket | `PATCH /tickets/A/actions/<action of B>` → 404 | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |

**Ticket workflow** (`server/tests/lab-04/ticket-workflow.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-20 | API | AC-21, BR-16 | All 64 status pairs | 17 permitted succeed (gate satisfied by fixture for →Resolved); 47 others incl. 8 same-status → 409 `INVALID_TRANSITION`, status and version unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-21 | API | AC-16, BR-18, BR-19 | Gate: no Actions | Direct API call In Progress→Resolved → 409 `RESOLUTION_BLOCKED`, `reasons: [NO_DONE_ACTION]`; also from Waiting for Requester | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-22 | API | AC-17, BR-18 | Gate: open Actions | Done + Planned → `[OPEN_ACTIONS]`; Done + In Progress → same; only-Cancelled → `[NO_DONE_ACTION]` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-23 | API | AC-18, BR-18 | Gate: pending follow-up | Done with follow-up → `[PENDING_FOLLOW_UPS]`; follow-up on a Cancelled Action ignored; all three failing → all three reasons in order | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-24 | API | AC-19, BR-21, BR-22 | Successful resolve | 200 `TicketWorkflowState`; `resolvedAt` set; version +1; exactly one history row `IN_PROGRESS→RESOLVED` by caller | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-25 | API | AC-25, BR-21 | Reopen clears `resolvedAt` | Resolved→Closed keeps it; Closed→Reopened clears it; Reopened→In Progress→Resolved needs the gate again (blocked after a new Planned Action) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-26 | API | AC-20, BR-20 | Advisory "appears resolved" | `PATCH /api/tickets/:id/resolved` leaves `currentStatus`, `resolvedAt`, `version`, history, and `resolutionGate` unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-27 | API | AC-22, BR-17 | Requester status change | 403 on `PATCH /api/staff/tickets/:id/status` for own and other Tickets; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-28 | API | AC-23, BR-24, BR-26 | Concurrent status change | Two requests with the same version (sequential and `Promise.all`): exactly one 200; other 409 `STALE_UPDATE` with `details.current.currentStatus` = winner's; one history row | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-29 | API | AC-46, BR-24 | Version required on every workflow write | claim/owner/priority/status without `version` → 400 `field: version`; stale version → 409 for each; success returns version +1; no-op claim doesn't bump | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-30 | API | AC-24, BR-22 | History append-only and ordered | Three changes → three rows `changedAt asc, id asc`; `POST /api/tickets` writes `null→NEW`; no PATCH/DELETE route exists for history; Requester reads own (200), other's (404) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-31 | API | BR-19 | Gate read inside the transaction | Action marked Planned in a parallel request while resolving: never ends Resolved with an open Action (repeated 20×) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-32 | API | BR-23 | Cancel with open Actions | Ticket with Planned Action → Cancelled succeeds; Action untouched and now read-only (409 on edit) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-33 | API | api-spec.md §3.5 | Detail adds `version`, `resolvedAt`, `resolutionGate` | Values match DB; `resolutionGate` equals what the status endpoint would decide | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-34 | API | AC-26, BR-29, BR-30 | Administrator parity | Admin: Queue 200, Detail 200, claim, reassign (incl. to an Admin), priority, status, comment, Internal Note, Action create/update all succeed | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-35 | API | BR-30, §11-15 | Assignable users list | `/api/staff/it-staff-users` returns active IT Staff and Administrators with `role`, name-ascending; excludes inactive and Requesters | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-56 | Authorization / Workflow | AC-21, BR-16, BR-29 | Administrator column of the matrix ("BR-16: an Administrator is refused …") | The 47 pairs IT Staff can't perform are 409 `INVALID_TRANSITION` for an Administrator too, with status, version, and history unchanged (the 17 permitted pairs are in API-20) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| API-57 | Authorization / Workflow | AC-22, BR-17 | Requester column of the matrix ("BR-17: a Requester is refused …") | All 64 pairs, including the 17 permitted ones, are 403 `FORBIDDEN` on the Requester's own Ticket, with status, version, and history unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |

**Requester dashboard** (`server/tests/lab-04/requester-dashboard.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-36 | API | AC-02, BR-31 | Ownership | Two Requesters with fixtures; each sees only own counts and list items; `?requesterId=<other>` ignored | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-37 | API | AC-32 | Wrong roles | 401 no session; 403 IT Staff; 403 Administrator | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-38 | API | BR-39, BR-41, BR-42, AC-28 | Metric values | Each equals an independent Prisma count on the fixture; 30-day window includes day −29 at 00:00 +07 and excludes 1 ms before | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-39 | API | BR-43, BR-44, AC-35 | Lists | ≤5 items; `updatedAt desc, id desc` / `resolvedAt desc, id desc`; Reopened Ticket absent from resolved list; only documented fields | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-40 | API | BR-40, AC-31 | Zero data | Requester with no Tickets: `hasAnyTickets: false`, all values `0`, lists `[]`; Requester with Tickets but none waiting: `waitingForYou.value: 0` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-41 | API | AC-30, BR-38 | Drill-down equals list | For each metric, calling `GET /api/tickets` with the `drillDown` query returns `totalCount` = metric value | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| API-42 | API | api-spec.md §4.2 | My Tickets new filters | `statusGroup=active`, `resolvedFrom`, `sortBy=updatedAt` filter/sort correctly; bad values 400 `INVALID_FILTER` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |

**Staff dashboard** (`server/tests/lab-04/staff-dashboard.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-43 | API | AC-32 | Wrong roles | 401 no session; 403 Requester | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-44 | API | AC-28, BR-45–BR-50 | Card values | Each of the six equals an independent Prisma query on the same DB state; "me" metrics differ correctly between two IT Staff callers | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-45 | API | BR-45, BR-48, BR-23 | Action metric edges | Open Action on a Cancelled/Resolved Ticket not counted; Cancelled Action with follow-up not counted; `ticketCount` counts distinct Tickets | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-46 | API | AC-29, BR-50, BR-34 | Resolved Today boundary | Fixture `resolvedAt` at 16:59:59.999Z (yesterday Bangkok) and 17:00:00.000Z (today Bangkok) with a faked clock: only the latter counts; Reopened-today Ticket not counted | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-47 | API | BR-51, BR-52 | Breakdowns | All 8 statuses and all 3 priorities always present, enum order, zeros included, values match DB | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-48 | API | BR-53, BR-54, AC-35 | Lists | ≤5 items each; documented order; description truncated to 80 chars with `…`; only documented fields | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-49 | API | AC-33, BR-55, FR-14 | Admin user counts | Admin: `userAccounts` matches DB per role/active; IT Staff: key absent | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-50 | API | AC-30, BR-38 | Drill-down equals list | Each ticket-count metric's `drillDown` query on `GET /api/staff/tickets` returns `totalCount` = value; BR-45 returns `ticketCount` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-51 | API | api-spec.md §4.1 | Queue new filters | `statusGroup`, `resolvedFrom`/`resolvedTo` (inclusive Bangkok dates), `followUp=pending`, `openActionAssigneeId`, `sortBy=resolvedAt` (nulls last); invalid values and `resolvedTo < resolvedFrom` → 400 | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-52 | API | AC-31, BR-37 | Zero metrics | Caller with no owned Tickets and no Actions: `myActiveTickets`, `myOpenActions` = 0, list `[]` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| API-58 | API | AC-31, BR-37, BR-38, BR-50 | Resolved Today zero ("Resolved Today is 0 with its drill-down intact …", in the API-52 block) | With the clock on a Bangkok day that has no resolutions, `resolvedToday` is `{ value: 0, drillDown }` and the drill-down's `totalCount` is 0 | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |

**Dashboard metric evidence** (`server/tests/lab-04/dashboard-metrics-evidence.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| EVID-01 | API / Evidence | AC-28, AC-02, AC-33, BR-39–BR-55 | Every dashboard value for seeded Sarah Johnson (IT Staff), Jennifer Anderson (Requester), and Alex Morgan (Administrator user counts) against raw SQL written from the BR definitions, with no shared code | All 33 values (cards, "across N tickets", 8 status and 3 priority breakdowns, list ids in order, 6 user counts, the 30-day window start) equal their SQL; the metric/SQL/expected/API table is printed and saved in `artifacts/lab-04/test-output/dashboard-metrics-evidence.txt` | `server/tests/lab-04/dashboard-metrics-evidence.test.ts` | Pass |

**Health and error envelope** (`server/tests/lab-04/health-and-errors.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-53 | API | AC-45, FR-22 | Health | 200 `database: ok` normally; with the DB probe mocked to throw, 503 `database: unreachable` and no error text; a probe that hangs past 2 s is also 503 | `server/tests/lab-04/health-and-errors.api.test.ts` | Pass (Issue #70 implemented FR-22, which no earlier issue had built; see §7.3) |
| API-54 | API | api-spec.md §0.2 | Safe 500 on new endpoints | A forced Prisma error in the Action create and both dashboard handlers returns 500 `INTERNAL_ERROR` with the generic message only | `server/tests/lab-04/health-and-errors.api.test.ts` | Pass |

**Route ids** (`server/tests/lab-04/route-ids.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-55 | API | BR-15, api-spec.md §0.2 | Route id past the Int4 range (`2147483648`) | Every Ticket, Attachment, and User route answers 404 `NOT_FOUND`, the same as any id that names no row, not a 500 | `server/tests/lab-04/route-ids.api.test.ts` | Pass |

### 2.3 Security / Authorization

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | Security | api-spec.md §6, FR-11, BR-12, BR-17, BR-29, AC-32 | Endpoint × role matrix | Every Lab 4 endpoint in api-spec.md §6 for every role: 401 unauthenticated; 403 each denied role; each allowed role reaches the handler. The Lab 1–3 rows, with Administrator now allowed on `/api/staff/*`, stay in `server/tests/lab-03/authorization-matrix.api.test.ts` | `server/tests/lab-04/authorization-matrix.api.test.ts` | Pass |
| SEC-02 | Security | BR-12, BR-31 | No existence leak | Requester GET actions/status-history on another Requester's Ticket → 404 body exactly `{error}` | `server/tests/lab-04/authorization-matrix.api.test.ts` | Pass |
| SEC-03 | Security | BR-12, AC-06 | Requester cannot write Actions by any path | POST/PATCH to staff and requester Action paths all non-2xx; DB row count unchanged | `server/tests/lab-04/authorization-matrix.api.test.ts` | Pass |
| SEC-04 | Security | Lab 3 BR-04 | Internal Notes still private | Requester detail, actions, history, and dashboard responses never contain a fixture Internal Note's text, while the staff detail does | `server/tests/lab-04/authorization-matrix.api.test.ts` | Pass |

### 2.4 Migration / Regression

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| MIG-01 | Migration | AC-38, §7.4 | Forward migration on Lab 3 data | Every Lab 1–3 row count and id preserved; `version = 1` everywhere; zero Actions; empty history | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-02 | Migration | AC-38, §7.4 step 3 | `resolvedAt` backfill | Equals `updatedAt` read as UTC for Resolved/Closed; `NULL` for the other six statuses; run once with session `TimeZone = 'Asia/Bangkok'` and the values are still identical (no 7-hour shift) | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-03 | Migration | §7.2 | Constraints | CHECKs reject follow-up without note, Done without result, blank description, version 0; FKs Restrict Ticket/User deletion with Actions/history; unique `(performedById, clientRequestId)` | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-04 | Migration | §7.3-4 | Indexes exist | Every index in §7.2 is present | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-05 | Migration | AC-39, §7.5 | Rollback and re-apply | Down script returns to the Lab 3 schema with every Lab 1–3 row intact (Lab 3 MIG checks pass); forward migration re-applies cleanly | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-06 | Migration | AC-40, §7.6 | Seed idempotency and coverage | Two runs, identical rows and ids; Tickets with 0, 1, many Actions; all Action statuses; ≥2 pending follow-ups; resolved-today Ticket; Emma has zero Tickets; Nattapong zero open Actions; history `fromStatus` is `null` only on `→ NEW` creation entries; seeded Resolved/Closed (except the legacy-style one) pass the gate; inactive assignee present | `server/tests/lab-04/schema-seed.integration.test.ts` | Pass |
| MIG-07 | Regression | AC-43, FR-23 | Lab 1–3 server suites | `server/tests/lab-01..03` pass, changed only per §6 | `server/tests/lab-01/`, `lab-02/`, `lab-03/` | Pass (§7) |
| MIG-08 | Regression | AC-43, FR-23 | Lab 1–3 client suites | `client/tests/lab-01..03` pass, changed only per §6 | `client/tests/lab-01/`, `lab-02/`, `lab-03/` | Pass (§7) |
| MIG-09 | Regression | AC-43, FR-23 | Lab 2–3 E2E suites | `e2e/lab-02`, `e2e/lab-03` pass, changed only per §6 | `e2e/lab-02/`, `e2e/lab-03/` | Pass (§7) |

### 2.5 Performance Smoke

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| PERF-01 | Performance | BR-35, §7.3-4 | Dashboard latency | With 2,000 extra Tickets and 6,000 Actions, `GET /api/dashboard/staff` and `/requester` median of 10 calls < 300 ms locally | `server/tests/lab-04/performance.smoke.test.ts` | Pass |
| PERF-02 | Performance | §7.3-4 | Gate and list latency | Status change to Resolved on a Ticket with 50 Actions < 200 ms; Queue with `followUp=pending&statusGroup=active` < 300 ms | `server/tests/lab-04/performance.smoke.test.ts` | Pass |
| PERF-03 | Performance | FR-15, §7.3-4 | Remaining drill-down lists | Same data set; median of 10 calls < 300 ms for the unfiltered Queue, My Tickets (default, `statusGroup=active`, `sortBy=updatedAt`), and the Actions Taken list on a Ticket with 50 Actions | `server/tests/lab-04/performance.smoke.test.ts` | Pass |

### 2.6 UI Component

**Staff dashboard** (`client/tests/lab-04/StaffDashboard.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | UI | FR-13, ui-spec.md §4 | Cards render | Six cards in order with exact labels and values from the stubbed response; "across N tickets" line | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |
| UI-02 | UI | FR-15, AC-30 | Drill-down links | Each card, breakdown row, list row, and "View all" `href` equals the response's `drillDown`/documented route; accessible name "<Label>: <value>. View tickets" | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |
| UI-03 | UI | AC-31, BR-37 | Zero and empty | Zero card shows `0` and helper text, link intact; empty lists show their messages | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |
| UI-04 | UI | AC-34 | Loading / failure / retry | Skeleton while pending; safe banner on 500 with Retry that recovers; no partial numbers | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |
| UI-05 | UI | AC-33 | Admin vs IT Staff | User Accounts card shown for Admin with role links; absent for IT Staff | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |
| UI-06 | UI | BR-35 | Refresh | Refresh refetches and updates "Updated" time | `client/tests/lab-04/StaffDashboard.test.tsx` | Pass |

**Requester dashboard** (`client/tests/lab-04/RequesterDashboard.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-07 | UI | FR-12, AC-02 | Cards and lists | Three cards with exact labels; both lists with Ticket links to `/tickets/:id` | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pass |
| UI-08 | UI | AC-31, BR-40 | No Tickets at all | Whole-dashboard empty state with Create Ticket link to `/tickets/new`; no cards | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pass |
| UI-09 | UI | AC-30 | Drill-down links | Card `href`s match documented routes | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pass |
| UI-10 | UI | AC-34 | Loading / failure | Skeleton; safe banner with Retry | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pass |

**Actions Taken** (`client/tests/lab-04/ActionsTaken.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-11 | UI | FR-02, BR-13 | List mode | Rows in server order; all columns; inactive assignee shows "Inactive" badge; Cancelled row has badge + strikethrough; empty state text | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-12 | UI | AC-01, FR-01 | Create | Opens panel, focus to heading; defaults (now, Planned, me); Save posts exact body incl. `clientRequestId`; row appears; "Action added." announced; focus returns to + Add Action | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-13 | UI | AC-04, BR-06 | Follow-up note | Hidden until checkbox; then required; error under the field; no request sent | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-14 | UI | AC-09, BR-08 | Result required for Done | Choosing Done marks Result required; empty Result blocks submit with field error | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-15 | UI | AC-05 | Server `INVALID_ASSIGNEE` | Error shown under Assigned To; input kept | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-16 | UI | BR-09, AC-11 | Edit Done Action | Description/Result read-only with reason; follow-up editable; PATCH sends `version` and only changed fields | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-17 | UI | BR-07 | Edit status options | Only permitted next statuses offered; Cancel asks inline confirmation | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-18 | UI | AC-08, AC-44, BR-26 | Stale update | 409 shows conflict banner with latest values; typed input kept; Reload latest refreshes form | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-19 | UI | AC-44, FR-20 | Network/500 failure | Safe banner inside panel; all entered values kept | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-20 | UI | BR-28, FR-21 | Double click | Two rapid clicks on Save send one request; retry after network error reuses the same `clientRequestId` | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-21 | UI | AC-12, BR-10 | Non-active Ticket | + Add Action and Edit hidden; helper "Reopen it to record more actions." | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-22 | UI | AC-07, BR-12 | Requester view | Requester Ticket Detail shows every field read-only; no Add/Edit buttons or form; uses `/api/tickets/:id/actions` | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| UI-23 | UI | AC-42 | Keyboard | Tab order through form; Esc cancels and returns focus to trigger | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |

**Ticket workflow** (`client/tests/lab-04/TicketWorkflow.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-24 | UI | AC-27, BR-16 | Status options | Only permitted transitions from each of the 8 statuses are offered | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-25 | UI | AC-27, BR-18 | Gate failing | "Resolved (blocked)" disabled; callout lists each reason with link to `#actions-taken`; `aria-describedby` set | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-26 | UI | AC-27, AC-19 | Successful change | PATCH carries `version`; header status badge, info card, and Status History update without reload | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-27 | UI | AC-16 | Server `RESOLUTION_BLOCKED` | Select reverts; callout from `details.reasons` | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-28 | UI | AC-23 | Server `STALE_UPDATE` on status/owner/priority | Select reverts; conflict banner with latest values; Reload latest | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-29 | UI | FR-09, BR-22 | Status History | Oldest-first entries with badges, name, role, Bangkok time; legacy empty message "No status changes recorded yet."; Show all toggle beyond 10 | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-30 | UI | AC-20 | Requester "appears resolved" | Badge on staff view; Resolved option state driven only by `resolutionGate` | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| UI-31 | UI | AC-26 | Administrator detail | Admin sees all controls incl. Actions Taken; Owner dropdown lists Admins with role suffix | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass for the workflow controls and Owner list; the Administrator recording an Action is covered by E2E-10 |

**Navigation and drill-down destinations** (`client/tests/lab-04/NavigationAndFilters.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-32 | UI | AC-36, FR-17 | Nav per role | Requester: Dashboard, My Tickets, Create Ticket; IT Staff: Dashboard, Ticket Queue; Admin: Dashboard, Ticket Queue, User Management; `aria-current` on active | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Pass |
| UI-33 | UI | AC-36, §11-8 | Landing | Login success and `/` redirect go to `/dashboard` for each role; correct dashboard variant renders | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Pass |
| UI-34 | UI | AC-47, FR-16 | Queue URL filters | `/staff/tickets?followUp=pending&statusGroup=active` requests those params and shows chips; removing a chip updates URL and request | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Pass |
| UI-35 | UI | AC-47 | My Tickets URL filters | `/tickets?statusGroup=active` and `resolvedFrom` applied with chips | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Pass |
| UI-36 | UI | AC-47 | User Management URL role | `/admin/users?role=IT_STAFF` applies role filter chip | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Pass |
| UI-37 | UI | ui-spec.md §2.5 | Invalid URL filter | 400 `INVALID_FILTER` shows safe banner with Clear filters | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Pass |
| UI-38 | UI | AC-37, FR-18, BR-33 | Bangkok times on screens | With `TZ=America/New_York` and an instant that is 6 Oct in New York but 7 Oct in Bangkok, every `<time>` on My Tickets, both Ticket Details, and both dashboards shows the Bangkok date or time | `client/tests/lab-04/BangkokTime.test.tsx` | Pass |

**Final hardening, Issue #69** (`client/tests/lab-04/Hardening.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-39 | UI | ui-spec.md §5 | Staff Ticket Detail section order | Ownership → Actions Taken → Public Comments → Internal Notes → Attachments → Status History | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-40 | UI | FR-19, AC-34, ui-spec.md §11 | Shared not-found and forbidden states | 404 shows "Ticket not found." as the `<h1>` with one way back; an API 403 on Ticket Detail or the Queue shows the forbidden state with an `<h1>` and no server text | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-41 | UI | ui-spec.md §2.5, FR-24 | Invalid drill-down filter | Only the banner's Clear filters is offered; the header Clear Filters is hidden | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-42 | UI | Lab 3 FR-02 | Password reset mid-session | A `403 PASSWORD_CHANGE_REQUIRED` from any call sends the user to Change Password | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-43 | UI | FR-20, FR-21, BR-28, AC-44 | Public Comment and Internal Note composers | Two clicks send one request; button shows "Posting…", `disabled`, `aria-busy`; after a 500 the safe message shows and the draft stays | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-44 | UI | FR-20, AC-44 | Requester comment, network failure | Safe message; draft kept | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-45 | UI | FR-20, FR-21, AC-44 | Admin Create User | Two clicks send one request; busy state; after a 500 name, email, and role stay | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-46 | UI | FR-20, AC-44 | Change Password, server failure | Safe message; typed passwords stay in their fields | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-47 | UI | AC-42, ui-spec.md §9 | Confirmation dialogs | Focus moves into the dialog, Tab stays inside, Esc closes it, focus returns to the trigger | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-48 | UI | ui-spec.md §12 | Status and priority badges | Every Ticket status and priority badge has a text label and an icon | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-49 | UI | ui-spec.md §11 | Obsolete badge name | Waiting for Requester uses `.zg-badge-status-waiting` | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-50 | UI | FR-20, FR-21, AC-44 | Remove Attachment and Problem Appears Resolved, request in flight then 500 | Cancel, Close, and Esc can't dismiss the dialog mid-request; after the failure the dialog shows the safe message and keeps the reason | `client/tests/lab-04/Hardening.test.tsx` | Pass |
| UI-51 | UI | FR-21, BR-28, AC-44 | Duplicate submit on the remaining busy-protected forms (Change Password, Admin edit user, Admin set new password) | Two clicks send one request; the button is busy and disabled; after a 500 the typed values stay | `client/tests/lab-04/Hardening.test.tsx` | Pass |

### 2.7 UI Style / Responsive / Accessibility

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| STYLE-01 | Visual/Responsive | AC-41, ui-spec.md §10, §13 | Staff and Requester dashboards | Desktop/tablet/mobile screenshots; `scrollWidth` ≤ viewport; card columns 3/2/1 | `e2e/lab-04/dashboards.spec.ts` (STYLE-01 cases); screenshots: `e2e/lab-04/capture-screenshots.ts` → `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard}/*.png` (Issue #71) | Pass (card columns and no horizontal scroll in `dashboards.spec.ts`; every screenshot asserts no horizontal scroll at 1440/768/375 before capture) |
| STYLE-02 | Visual/Responsive | AC-41 | Actions Taken (staff + requester) | Table on desktop/tablet, cards on mobile; create, locked-edit, validation, conflict, blocked-resolution states captured; no overflow with long unbroken text | `e2e/lab-04/hardening.spec.ts` (HARD-01 Ticket Detail cases), `e2e/lab-04/actions-taken-flow.spec.ts` (E2E-01 long-text check); screenshots: `e2e/lab-04/capture-screenshots.ts` → `artifacts/lab-04/screenshots/actions-taken/*.png` (Issue #71) | Pass (HARD-01 and E2E-01 as before; every screenshot asserts no horizontal scroll at 1440/768/375 before capture) |
| STYLE-03 | Visual/Responsive | AC-43 | Lab 2/3 screens still clean | Re-run Lab 3 screenshot specs; no new overflow | `e2e/lab-03/screenshots.spec.ts`, `e2e/lab-03/staff-and-admin-screenshots.spec.ts` (Lab 3 STYLE tests, unchanged) | Pass |
| A11Y-01 | Accessibility | AC-42, ui-spec.md §9 | Automated scan | `@axe-core/playwright` on both dashboards, both Ticket Detail screens (Actions open), Queue, My Tickets: zero serious/critical violations | `e2e/lab-04/hardening.spec.ts` (HARD-01 runs the scan on every screen, not only these) | Pass |
| A11Y-02 | Accessibility | AC-42 | Keyboard-only | Tab through staff dashboard reaches the six card links in ui-spec order, every stop has an accessible name and a visible ring; Enter on a card drills down; the Actions form opens by Enter with focus on its heading, Esc closes it with focus back on Add Action, and a keyboard-only save works | `e2e/lab-04/accessibility.spec.ts` | Pass |
| HARD-01 | Accessibility / Responsive | FR-19, FR-24, AC-34, AC-41, AC-43, ui-spec.md §11 | Every major screen per role (Requester, empty Requester, IT Staff, Administrator, password-change and inactive accounts) at 1440/768/375, including forbidden, not-found, invalid-filter, no-results, empty, validation, and dialog states | No console error or warning; no failed same-origin request other than the case's expected 4xx; `scrollWidth` ≤ viewport; zero serious/critical axe violations | `e2e/lab-04/hardening.spec.ts` | Pass |
| HARD-02 | Visual | AC-37, BR-33 | Bangkok time under a New York browser | Queue date and Ticket Detail date/time equal the Bangkok rendering of the API instant; Bangkok-time hint shown on Ticket Detail | `e2e/lab-04/hardening.spec.ts` | Pass |
| HARD-03 | Accessibility | AC-42, ui-spec.md §9 | Focus ring | Header link gets a white ring on the green header; page links get the Zen Green ring | `e2e/lab-04/hardening.spec.ts` | Pass |

### 2.8 End-to-End

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | E2E | AC-01, AC-14, AC-05, AC-11 | Actions Taken flow | IT Staff A owns Ticket; IT Staff B adds Planned Action assigned to A; Admin adds Done Action with follow-up; inactive assignee rejected; follow-up cleared; three performers visible; Owner still A | `e2e/lab-04/actions-taken-flow.spec.ts` | Pass |
| E2E-02 | E2E | AC-07, AC-06 | Requester sees Actions read-only | Requester opens own Ticket, sees every Action field, no Add/Edit controls | `e2e/lab-04/actions-taken-flow.spec.ts` | Pass |
| E2E-03 | E2E | AC-16, AC-17, AC-19, AC-27 | Resolution through the UI | Resolved blocked with reasons; finish/cancel Actions; Resolved enabled; resolve; badge and history update | `e2e/lab-04/ticket-resolution.spec.ts` | Pass (Actions recorded through the Actions Taken API, not the #65 UI) |
| E2E-04 | E2E | AC-16, BR-19 | Gate bypass attempt | `page.request.patch` straight to the status endpoint with a valid version on a gate-failing Ticket → 409; UI still shows old status after reload | `e2e/lab-04/ticket-resolution.spec.ts` | Pass |
| E2E-05 | E2E | AC-20 | Requester "appears resolved" stays advisory | Requester marks it; IT Staff view still blocked from Resolved until Actions qualify | `e2e/lab-04/ticket-resolution.spec.ts` | Pass |
| E2E-06 | E2E | AC-23 | Two browser contexts, stale update | Both open the Ticket; first changes status; second's change gets the conflict banner; Reload latest shows the first's status | `e2e/lab-04/ticket-resolution.spec.ts` | Pass |
| E2E-07 | E2E | AC-25 | Reopen | Resolved → Closed → Reopened; Resolved blocked again after adding a Planned Action | `e2e/lab-04/ticket-resolution.spec.ts` | Pass (the Planned Action is recorded through the Actions Taken API) |
| E2E-08 | E2E | AC-28, AC-30 | Staff dashboard drill-down | Each card's value equals the destination list's "Showing … of N" | `e2e/lab-04/dashboards.spec.ts` | Pass |
| E2E-09 | E2E | AC-02, AC-30, AC-31 | Requester dashboard | Jennifer sees own metrics and drill-down matches; Emma sees empty state and Create Ticket | `e2e/lab-04/dashboards.spec.ts` | Pass |
| E2E-10 | E2E | AC-33, AC-26 | Administrator | Admin lands on dashboard with User Accounts; drill to User Management filtered; opens the Queue from the navigation, claims a Ticket, changes its status, posts an Internal Note, and records an Action through the UI | `e2e/lab-04/dashboards.spec.ts` | Pass |
| E2E-11 | E2E | AC-36 | Landing per role | Each seeded role lands on `/dashboard` after login | `e2e/lab-04/dashboards.spec.ts` | Pass |
| E2E-12 | E2E | AC-43, FR-23, AC-14, AC-19, AC-02 | Cross-role regression journey | Requester logs in, creates a Ticket with an attachment, and finds it by search; IT Staff A claims it from the Queue, starts work, posts a Public Comment and an Internal Note, and records a Done Action; IT Staff B records a second Done Action and resolves it (Owner still A); the Requester sees the comment and both Actions but not the note, and the dashboard's Resolved (Last 30 Days) and Recently Resolved update; the Administrator deactivates a staff user (login refused) and reactivates them (login reaches the first-login password change); logout between roles; no console error other than the expected 401/403, no 5xx | `e2e/lab-04/regression.spec.ts` | Pass |
| E2E-13 | E2E | AC-37 | Time zone | Browser context `timezoneId: 'America/New_York'`: every `<time>` on the Requester dashboard, My Tickets, Requester Ticket Detail, staff dashboard, and staff Ticket Detail shows Bangkok date or time | `e2e/lab-04/regression.spec.ts` | Pass |

## 3. Acceptance-Criterion Traceability Matrix

Built forward from `specification.md` §9: each AC was read first, then the
tests that prove it were listed (and written where missing). Final is the
AC's result in the last full run: Pass only when every listed test passed.

| AC | Covered by | Final |
| --- | --- | --- |
| AC-01 | API-03, UI-12, E2E-01 | Pass |
| AC-02 | API-36, UI-07, E2E-09, EVID-01, E2E-12 | Pass |
| AC-03 | API-04 | Pass |
| AC-04 | UNIT-04, API-05, UI-13 | Pass |
| AC-05 | API-06, UI-15, E2E-01 | Pass |
| AC-06 | API-01, API-17, SEC-01, SEC-02, SEC-03, E2E-02 | Pass |
| AC-07 | API-17, UI-22, E2E-02, E2E-12 | Pass |
| AC-08 | API-11, UI-18 | Pass |
| AC-09 | UNIT-04, API-08, UI-14 | Pass |
| AC-10 | UNIT-03, API-09, API-10 | Pass |
| AC-11 | UNIT-03, API-10, UI-16, E2E-01 | Pass |
| AC-12 | API-13, UI-21 | Pass |
| AC-13 | API-14, UI-20 | Pass |
| AC-14 | API-15, E2E-01, E2E-12 | Pass |
| AC-15 | API-02 | Pass |
| AC-16 | UNIT-01, API-21, UI-27, E2E-03, E2E-04 | Pass |
| AC-17 | UNIT-01, API-22, E2E-03 | Pass |
| AC-18 | UNIT-01, API-23 | Pass |
| AC-19 | API-24, UI-26, E2E-03, E2E-12 | Pass |
| AC-20 | API-26, UI-30, E2E-05 | Pass |
| AC-21 | API-20, API-56, UNIT-08, UI-24 | Pass |
| AC-22 | API-27, API-57, SEC-01 | Pass |
| AC-23 | API-28, UI-28, E2E-06 | Pass |
| AC-24 | API-30 | Pass |
| AC-25 | UNIT-06, API-25, E2E-07 | Pass |
| AC-26 | API-34, UI-31, E2E-10 | Pass |
| AC-27 | UI-24, UI-25, UI-26, E2E-03 | Pass |
| AC-28 | API-38, API-44, EVID-01, E2E-08 | Pass |
| AC-29 | UNIT-05, API-46 | Pass |
| AC-30 | API-41, API-50, UI-02, UI-09, E2E-08, E2E-09 | Pass |
| AC-31 | API-40, API-52, API-58, UI-03, UI-08, E2E-09 | Pass |
| AC-32 | API-37, API-43, SEC-01 | Pass |
| AC-33 | API-49, UI-05, EVID-01, E2E-10 | Pass |
| AC-34 | UI-04, UI-10, UI-40, HARD-01 | Pass |
| AC-35 | API-39, API-48 | Pass |
| AC-36 | UI-32, UI-33, E2E-11 | Pass |
| AC-37 | UNIT-07, UI-38, HARD-02, E2E-13 | Pass |
| AC-38 | MIG-01, MIG-02 | Pass |
| AC-39 | MIG-05 | Pass |
| AC-40 | MIG-06 | Pass |
| AC-41 | STYLE-01, STYLE-02, HARD-01 | Pass |
| AC-42 | UI-23, UI-47, A11Y-01, A11Y-02, HARD-03 | Pass |
| AC-43 | MIG-07, MIG-08, MIG-09, STYLE-03, E2E-12, §9 | Pass |
| AC-44 | UI-18, UI-19, UI-43, UI-44, UI-45, UI-46, UI-50, UI-51 | Pass |
| AC-45 | API-53 | Pass |
| AC-46 | API-29 | Pass |
| AC-47 | UI-34, UI-35, UI-36 | Pass |

**47 of 47 ACs map to at least one test, and every one passed in the
last run. No AC is without a test.** AC-41's screenshot files were added
in Issue #71 (`artifacts/lab-04/screenshots/README.md`).

### 3.1 Requirement Traceability Matrix (FR / BR → Tests)

Every functional requirement and business rule maps to at least one test.
FR-25 (README) is a document requirement, checked by hand.

| Requirement | Covered by |
| --- | --- |
| FR-01 | API-03, UI-12, E2E-01, E2E-12 |
| FR-02 | API-02, UI-11 |
| FR-03 | API-09, API-10, UI-16, UI-17 |
| FR-04 | API-03, API-04 |
| FR-05 | API-17, UI-22, E2E-02, E2E-12 |
| FR-06 | API-14, UI-20 |
| FR-07 | UNIT-08, API-20, API-56, UI-24 |
| FR-08 | UNIT-01, API-21, API-22, API-23, UI-25, UI-27, E2E-03, E2E-04 |
| FR-09 | API-24, API-30, UI-26, UI-29, E2E-03 |
| FR-10 | API-11, API-28, API-29, UI-18, UI-28, E2E-06 |
| FR-11 | API-34, SEC-01, UI-31, E2E-10 |
| FR-12 | API-36–API-42, UI-07–UI-10, E2E-09, EVID-01 |
| FR-13 | API-43–API-52, API-58, UI-01–UI-06, E2E-08, EVID-01 |
| FR-14 | API-49, UI-05, E2E-10, EVID-01 |
| FR-15 | API-41, API-50, UI-02, UI-09, E2E-08, E2E-09, PERF-03 |
| FR-16 | API-42, API-51, UI-34–UI-37 |
| FR-17 | UI-32, UI-33, E2E-11 |
| FR-18 | UNIT-07, UI-38, HARD-02, E2E-13 |
| FR-19 | UI-04, UI-10, UI-37, UI-40, HARD-01 |
| FR-20 | UI-18, UI-19, UI-43–UI-46, UI-50, UI-51 |
| FR-21 | API-14, API-28, UI-20, UI-43, UI-45, UI-50, UI-51 |
| FR-22 | API-53 |
| FR-23 | MIG-07–MIG-09, STYLE-03, E2E-12, §9 |
| FR-24 | UI-41, UI-49, HARD-01 |
| FR-25 | Manual: the README test commands are the ones run for §7 (Issue #70) |
| BR-01 | API-03, API-19 |
| BR-02 | API-15, E2E-01, E2E-12 |
| BR-03 | API-04 |
| BR-04 | API-06, API-18, UI-15, E2E-01 |
| BR-05 | UNIT-04, API-07 |
| BR-06 | UNIT-04, API-05, UI-13 |
| BR-07 | UNIT-02, API-09, UI-17 |
| BR-08 | UNIT-04, API-08, UI-14 |
| BR-09 | UNIT-03, API-10, UI-16 |
| BR-10 | API-13, API-32, UI-21 |
| BR-11 | API-15, API-34 |
| BR-12 | API-01, API-17, SEC-01, SEC-02, SEC-03, UI-22 |
| BR-13 | API-02, UI-11 |
| BR-14 | API-14, UI-20 |
| BR-15 | API-42, API-51, EVID-01 |
| BR-16 | UNIT-08, API-20, API-56, UI-24 |
| BR-17 | API-27, API-57, SEC-01 |
| BR-18 | UNIT-01, API-21, API-22, API-23, UI-25, E2E-03 |
| BR-19 | API-21, API-31, E2E-04 |
| BR-20 | API-26, UI-30, E2E-05 |
| BR-21 | UNIT-06, API-24, API-25, E2E-07 |
| BR-22 | API-24, API-30, UI-29 |
| BR-23 | API-32, API-45 |
| BR-24 | API-28, API-29, UI-28 |
| BR-25 | API-11, API-12, API-16 |
| BR-26 | API-11, API-28, UI-18 |
| BR-27 | API-16 |
| BR-28 | UI-20, UI-43, UI-45, UI-51 |
| BR-29 | API-34, API-56, SEC-01, UI-31, E2E-10 |
| BR-30 | API-34, API-35, UI-31 |
| BR-31 | API-36, SEC-02, E2E-09 |
| BR-32 | UNIT-04, API-07 |
| BR-33 | UNIT-07, UI-38, HARD-02, E2E-13 |
| BR-34 | UNIT-05, API-38, API-46, API-51, API-58 |
| BR-35 | PERF-01, UI-06, EVID-01 |
| BR-36 | API-39, API-48 |
| BR-37 | API-40, API-52, API-58, UI-03 |
| BR-38 | API-41, API-50, API-58, E2E-08, E2E-09 |
| BR-39 | API-38, UI-07, EVID-01 |
| BR-40 | API-40, UI-08, E2E-09, EVID-01 |
| BR-41 | API-38, EVID-01 |
| BR-42 | API-38, EVID-01, E2E-12 |
| BR-43 | API-39, EVID-01 |
| BR-44 | API-39, EVID-01, E2E-12 |
| BR-45 | API-44, API-45, EVID-01 |
| BR-46 | API-44, EVID-01 |
| BR-47 | API-44, EVID-01 |
| BR-48 | API-44, API-45, EVID-01 |
| BR-49 | API-44, EVID-01 |
| BR-50 | API-44, API-46, API-58, EVID-01 |
| BR-51 | API-47, EVID-01 |
| BR-52 | API-47, EVID-01 |
| BR-53 | API-48, EVID-01 |
| BR-54 | API-48, EVID-01 |
| BR-55 | API-49, UI-05, EVID-01 |

## 4. Responsive and Visual Checklist

Mirrors `ui-spec.md` §12. Each item is ticked with its evidence (test ID
and screenshot path) in Issue #69/#70:

- [x] Zen Green consistency across dashboards and Ticket Detail screens
- [x] Metric cards readable, unclipped, value not color-only, at 3 viewports
- [x] Zero cards and empty lists show helper text
- [x] Editable vs. read-only vs. invalid vs. disabled Action fields
      consistent with Lab 2 §3
- [x] Validation placement directly under fields, no overlap
- [x] Cancelled Actions and inactive assignees distinguishable without color
- [x] Shared vs. private content distinct
- [x] Badges carry text and icon
- [x] Keyboard focus visible and logical; form focus return
- [x] No clipping, overlap, or horizontal scroll on any Lab 4 screen
- [x] Navigation per role with non-color active indication
- [x] Bangkok time shown under a non-Bangkok browser time zone

Each item's evidence is recorded beside it in `ui-spec.md` §12 (Issue #69).

## 5. Test Commands

Unchanged from Lab 3, run after `README.md` setup (`pnpm db:up`,
`pnpm prisma:generate`, `pnpm prisma:migrate`, `pnpm prisma:seed`):

```bash
pnpm --filter server test   # unit + API/integration/security/migration/perf smoke
pnpm --filter client test   # UI component
pnpm e2e                    # E2E, screenshots, accessibility
pnpm test                   # all three in sequence
```

The dashboard evidence table (EVID-01) prints when its file runs on its own:

```bash
pnpm --filter server exec vitest run tests/lab-04/dashboard-metrics-evidence.test.ts
```

## 6. Lab 3 Tests Changed by This Contract

These Lab 3 tests assert behavior this contract deliberately changes. Each
is updated in the issue that changes the behavior, and the reason is noted
in the test file header. Nothing else in Lab 1–3 may change.

| Lab 3 test | Superseding rule | Change |
| --- | --- | --- |
| API-20, API-22, API-81 (`authorization.api.test.ts`, `comments-notes.api.test.ts`) | BR-29 (§11-3) | Administrator on Queue, mutations, and staff comments: 403 → success |
| SEC-01 Administrator rows (`authorization-matrix.api.test.ts`) | BR-29 | Administrator moves from denied to allowed on every `/api/staff/*` route |
| API-60 (`staff-ticket-detail.api.test.ts`) | BR-30 (§11-15) | Assignable list includes Administrators with `role`; Administrator caller allowed |
| API-61–API-74 (`staff-ticket-detail.api.test.ts`) | BR-24 (§11-5) | Claim/owner/priority/status requests send `version` |
| API-71 (`staff-ticket-detail.api.test.ts`) | BR-18 | Fixtures for →Resolved transitions get a Done Action first |
| API-67 (`staff-ticket-detail.api.test.ts`) | BR-30 | An active Administrator becomes a valid owner; Requester, inactive, and nonexistent ids still 400 |
| UI-39 (`StaffTicketQueue.test.tsx`) | BR-29 | Administrator sees the Queue instead of the forbidden state |
| UI-02, UI-12 (`Login.test.tsx`, `ChangePassword.test.tsx`), UI-17, UI-18 (`AuthGuards.test.tsx`), UI-52 (`UserManagement.test.tsx`) | FR-17, §11-8 | Landing path is `/dashboard`; navigation item lists gain Dashboard (and Ticket Queue for Administrator) |
| UI-32–UI-36 (`StaffTicketDetail.test.tsx`) | BR-24 | Stubbed responses include `version`; request bodies assert it |
| E2E-01, E2E-02 (`e2e/lab-03/authentication.spec.ts`) | FR-17 | Expect `/dashboard` landing and the new navigation sets |
| Requester sign-in landing in `e2e/lab-03/requester-comments-and-resolved.spec.ts` and the `loginViaUi` default in `e2e/lab-02/helpers.ts` | FR-17, §11-8 | A Requester lands on `/dashboard` instead of My Tickets |
| E2E-09 (`e2e/lab-03/staff-ticket-flow.spec.ts`) | BR-18 | If the flow resolves the Ticket, it records a Done Action first |
| Seeded-owner check in "spreads tickets across owners…" (`server/tests/lab-03/schema-seed.integration.test.ts`) | BR-30 | A seeded Ticket owner may be an active Administrator as well as active IT Staff (the §7.6 seed makes Alex Morgan an owner) |
| UI-14 (`client/tests/lab-02/RequesterTicketDetail.test.tsx`) | FR-09 | The new read-only "Status History" section matches the old `queryByLabelText(/^status/i)` check, so it now asserts no status combobox instead; same intent |
| Fixture cleanup in the Lab 2/3 API tests that create Tickets through the API or change status, and `server/scripts/clean-e2e-fixtures.ts` | BR-22, §7.3-5 | History and Action rows are FK Restrict, so `afterAll` deletes them before the Tickets; no assertion changed |
| "Login forgot-password link" (`client/tests/lab-03/Login.test.tsx`) | FR-24 | Lab 3 ui-spec §2 allowed an inert "Forgot your password?" control "if shown at all". Issue #69 removes it as an unfinished control, so the test asserts it is absent |
| "returns ok status" (`server/tests/lab-01/health-check.test.ts`) | FR-22, api-spec.md §1.1 | The 200 body gains `database: "ok"` (Issue #70). `status` and `service` are unchanged; the exact-match assertion includes the new field |

No Lab 1–3 test failed for any other reason in the Issue #70 runs, so no
regression was found. The Lab 3 Administrator Queue test (UI-39 above) was
also changed in Issue #70, for flakiness only; see §7.2.

## 7. Final Results

### 7.1 Last Run

Run on 22 Oct 2026 at commit `3ee1418` (branch
`lab4/feat/10-test-coverage`, from `lab4-staging` `fd02fd2`), against the
seeded Docker database. The full output is saved in
`artifacts/lab-04/test-output/`, one file per suite, each headed by its
date, commit, and command. Issue #71 re-runs it on `main`.

| Suite | Command | Lab 1 | Lab 2 | Lab 3 | Lab 4 | Total | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Server unit + API/integration | `pnpm --filter server test` | 2 | 74 | 297 | 471 | 844 in 41 files | 844 passed, 0 failed, 0 skipped |
| Client unit + UI component | `pnpm --filter client test` | 6 | 48 | 72 | 152 | 278 in 26 files | 278 passed, 0 failed, 0 skipped |
| E2E (Playwright) | `pnpm e2e` | – | 3 | 26 | 38 | 67 | 67 passed, 0 failed, 0 flaky |
| Dashboard evidence (EVID-01) | see §5 | – | – | – | 6 | 33 values | 33 of 33 match |

No test is skipped, disabled, `.only`-filtered, or commented out.

Flakiness check: the full suite (server, client, E2E) ran three times in a
row at commit `5f8a2e6`, and three more times at `3ee1418` after the last
fix below. All six runs passed with the counts above.

Release check (Issue #71): the same three commands ran on 29 Oct 2026 on
`lab4/feat/11-release-integration` (from `lab4-staging` `db60408`), on
Linux against a freshly migrated and seeded database: 844, 278, and 67
passed, 0 failed, 0 skipped, matching the table.

### 7.2 Flakiness Fixes

None of these weakens an assertion.

| Test | Cause | Fix |
| --- | --- | --- |
| Random server API tests (seen as a stray `401` in `actions-taken.api.test.ts`, about 1 run in 5) | `request(app)` made supertest listen on port 0 of every interface and dial `127.0.0.1`. macOS sometimes handed out a port another local program held on 127.0.0.1 alone, so the request reached that program | `server/tests/helpers/loopback-supertest.ts` (Vitest setup file) sends `request(app)` to one app server bound to 127.0.0.1. 12,000 probe requests failed 0 times after the change, against several failures before |
| Lab 3 UI-39, "shows the Queue, not the forbidden state, for an Administrator" (`StaffTicketQueue.test.tsx`) | The stub answered the Queue request with 403, so the test passed only when it checked the page before that response landed | The stub returns a Queue page, and the test also waits for the row |
| API-46, "a Ticket resolved and closed today counts; one reopened today does not" (`staff-dashboard.api.test.ts`), which then failed API-51 through the leftover fixture | The status history query had no `orderBy`, so Postgres could return the rows in any order | Ordered by `changedAt`, then `id` (BR-22) |

### 7.3 Bugs Found

- **FR-22 / AC-45 was not implemented.** `GET /api/health` returned
  `{ status, service }` without probing the database and had no 503 path.
  Issue #70 added the `SELECT 1` probe with a 2-second timeout
  (`server/src/app.ts`, api-spec.md §1.1), API-53 tests it, and the Lab 1
  health test now expects `database: "ok"` (§6).
- No other test exposed an application bug.

### 7.4 Coverage Tooling

The project has no coverage tool installed, so no line-coverage summary is
produced (§8).

## 8. Known Limitations or Deferred Tests

- Global staff metrics (Unassigned, Follow-Ups Pending, High Priority, the
  Tickets-by-Status breakdown) can't reach 0 at the API level without
  emptying the shared seeded database. Their zero rendering is UI-03, the
  caller-scoped metrics' zero is API-52, Resolved Today's zero is API-58,
  and every Requester metric's zero is API-40.
- The project has no coverage tool (no `@vitest/coverage-*` package), and
  Issue #70 doesn't add one. Coverage is argued through the matrices in §3
  instead of a line-coverage number.
- The screenshot script (`e2e/lab-04/capture-screenshots.ts`) runs on
  demand (`pnpm screenshots`), not in `pnpm e2e`, so it isn't counted in
  §7.1. Its no-horizontal-scroll assertions duplicate HARD-01's.
- EVID-01 compares the API with SQL run a moment later. At the instant of
  a Bangkok midnight the two could straddle the day boundary; the
  boundary itself is proven by UNIT-05 and API-46 with a fixed clock.
- PERF-01–03 thresholds are smoke checks on a developer machine, not load
  tests. They catch a missing index or an N+1 query, not production
  capacity (handout §4.2 excludes production-scale operations).
- The Lab 3 limitation on AC-26 (a truly empty system-wide Ticket table
  tested only at the mocked UI layer) still applies. The Lab 4 Requester
  empty state (BR-40) has no such limit, because it is per-Requester and
  Emma Watson has zero Tickets in the shared database.

## 9. Labs 1–3 Regression Map

The Lab 1–3 suites run unchanged against the Lab 4 schema and seed (except
the §6 rows), so each earlier requirement keeps the test that proved it.
Lab 2 IDs refer to `docs/lab-02/tests.md`, Lab 3 IDs to
`docs/lab-03/tests.md`. E2E-12 crosses the same features in one Lab 4
journey.

| Earlier behavior | Tests (lab: ID) | Files |
| --- | --- | --- |
| Lab 1 health check | Lab 1 health test; Lab 4 API-53 | `server/tests/lab-01/health-check.test.ts`, `client/tests/lab-01/app-check-system-*.test.tsx` |
| Create Ticket with validation | Lab 2: API-01–API-04, UI-05–UI-08, E2E-01; Lab 3: API-27–API-30 | `server/tests/lab-02/create-ticket.api.test.ts`, `client/tests/lab-02/CreateTicket.test.tsx`, `e2e/lab-02/requester-ticket-flow.spec.ts` |
| Attachment type, size, and count limits | Lab 2: API-15–API-18, API-23, UI-09, UI-16, UNIT-02 | `server/tests/lab-02/attachments.api.test.ts`, `client/tests/lab-02/AttachmentSection.test.tsx` |
| Soft-removed attachment behavior | Lab 2: API-20, API-21, UI-15, E2E-03, SCHEMA-06; Lab 3: SEC-03, SEC-04 | `server/tests/lab-02/attachments.api.test.ts`, `e2e/lab-02/requester-ticket-flow.spec.ts` |
| My Tickets search, filter, sort, pagination | Lab 2: API-07–API-12, UI-10–UI-13; Lab 4: API-42 | `server/tests/lab-02/my-tickets.api.test.ts`, `client/tests/lab-02/MyTickets.test.tsx` |
| Ticket Detail ownership | Lab 2: API-13, API-14, E2E-02; Lab 3: API-34, SEC-02 | `server/tests/lab-02/ticket-detail.api.test.ts`, `server/tests/lab-03/requester-tickets.api.test.ts` |
| Login: valid, invalid, inactive | Lab 3: API-01, API-05, API-06, UI-02, UI-04, UI-05 | `server/tests/lab-03/auth.api.test.ts`, `client/tests/lab-03/Login.test.tsx`, `e2e/lab-03/authentication.spec.ts` |
| Mandatory password change | Lab 3: API-15, API-25, UI-07, UI-12; Lab 4: UI-42 | `server/tests/lab-03/auth.api.test.ts`, `client/tests/lab-03/ChangePassword.test.tsx` |
| Logout | Lab 3: API-13, UI-20; Lab 4: E2E-12 | `server/tests/lab-03/auth.api.test.ts`, `client/tests/lab-03/AuthGuards.test.tsx` |
| Role navigation | Lab 3: UI-16–UI-19; Lab 4: UI-32, E2E-11 | `client/tests/lab-03/AuthGuards.test.tsx` |
| Direct API authorization | Lab 3: SEC-01, API-19–API-26, API-82; Lab 4: SEC-01 | `server/tests/lab-03/authorization-matrix.api.test.ts`, `server/tests/lab-03/authorization.api.test.ts` |
| IT Staff Queue | Lab 3: API-46–API-56 and the Queue UI tests | `server/tests/lab-03/staff-queue.api.test.ts`, `client/tests/lab-03/StaffTicketQueue.test.tsx` |
| Claim and reassign | Lab 3: API-61–API-68; Lab 4: API-29, API-34 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` |
| IT Priority | Lab 3: API-69, API-70 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` |
| Public Comments vs Internal Notes | Lab 3: API-36–API-41, API-75–API-81, SEC-05; Lab 4: SEC-04, E2E-12 | `server/tests/lab-03/comments-notes.api.test.ts`, `e2e/lab-03/staff-ticket-flow.spec.ts` |
| Admin: create user, duplicate email | Lab 3: API-87, API-88, API-95 | `server/tests/lab-03/users-admin.api.test.ts`, `e2e/lab-03/user-administration.spec.ts` |
| Admin: edit, one role, activate/deactivate | Lab 3: API-89, API-93, API-94; Lab 4: E2E-12 (deactivate, then reactivate) | `server/tests/lab-03/users-admin.api.test.ts`, `e2e/lab-04/regression.spec.ts` |
| Admin: new initial password | Lab 3: API-99, API-100 | `server/tests/lab-03/users-admin.api.test.ts` |
| Admin: self-deactivation and last-active-Administrator blocks | Lab 3: API-97, API-98 | `server/tests/lab-03/users-admin.api.test.ts`, `e2e/lab-03/user-administration.spec.ts` |
| Non-Administrator forbidden from User Management | Lab 3: API-82, UI-19 | `server/tests/lab-03/users-admin.api.test.ts` |

