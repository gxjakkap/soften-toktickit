# Lab 4 Test Plan and Results

This is the first pass of the Lab 4 test plan, written with the engineering
contract (Issue #61) and before any implementation. It is derived from
`specification.md` (FR-01–25, BR-01–55, AC-01–47, §7 data changes) and
`api-spec.md`. Every row's Final status is **Planned**. Each implementation
issue moves its rows to Pass (or records why not), and Issue #70 does the
gap analysis and final reconciliation.

Earlier labs' acceptance criteria stay in force. `docs/lab-02/tests.md` and
`docs/lab-03/tests.md` still apply. Lab 3 tests that change because this
contract supersedes a Lab 3 rule are listed in §6, with the rule that
changed them.

Test IDs restart for Lab 4. Each test file opens with a comment naming its
`API-nn`/`UI-nn`/… IDs and the ACs it covers (repository convention,
`CLAUDE.md`).

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

## 2. Planned Tests

### 2.1 Unit

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-01 | Unit | BR-18, AC-16, AC-17, AC-18 | `evaluateResolutionGate(actions)` | Returns `canResolve` and reasons in fixed order for: no Actions; only Cancelled; one Done; Done + Planned; Done + In Progress; Done with follow-up; Cancelled with follow-up (ignored); all three failing | `server/tests/lab-04/resolution-gate.unit.test.ts` | Planned |
| UNIT-02 | Unit | BR-07 | `canTransitionAction(from, to)` | Exactly the 6 permitted pairs are true; all 10 others (incl. from Done/Cancelled and same-status) false | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-03 | Unit | BR-09 | `lockedFieldChanged(action, patch)` | Planned/In Progress: none locked; Done: only follow-up fields and attachment notes editable; Cancelled: all locked; unchanged values never count as changes | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-04 | Unit | BR-06, BR-05, BR-08 | Action payload validation | Trims; enforces lengths; follow-up note required iff follow-up; note nulled when follow-up false; Result required for Done; future `actionAt` rejected only for Done; offset-less timestamp rejected | `server/tests/lab-04/action-rules.unit.test.ts` | Pass |
| UNIT-05 | Unit | BR-34, AC-29 | `startOfBangkokDay`, `bangkokDateString` | `2026-10-06T16:59:59.999Z` → `2026-10-06`; `2026-10-06T17:00:00.000Z` → `2026-10-07`; start of `2026-10-07` = `2026-10-06T17:00:00Z`; 30-day window start | `server/tests/lab-04/bangkok-time.unit.test.ts` | Planned |
| UNIT-06 | Unit | BR-21 | `nextResolvedAt(from, to, now, current)` | Set on →Resolved; kept on Resolved→Closed; cleared on →Reopened; unchanged otherwise | `server/tests/lab-04/ticket-workflow.unit.test.ts` | Planned |
| UNIT-07 | Unit | BR-33, AC-37 | Client `formatDateTime` / `formatDate` | With `TZ=America/New_York`, renders `2026-10-06T07:05:00Z` as `6 Oct 2026, 14:05`; date-only form; `<time dateTime>` value is the ISO input | `client/tests/lab-04/datetime.test.ts` | Planned |
| UNIT-08 | Unit | BR-16 | Client and server matrices agree | `client/src/lib/ticket-status.ts` and `server/src/lib/ticket-status.ts` yield identical permitted sets for all 8 statuses | `client/tests/lab-04/ticket-status-parity.test.ts` | Planned |

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
| API-20 | API | AC-21, BR-16 | All 64 status pairs | 17 permitted succeed (gate satisfied by fixture for →Resolved); 47 others incl. 8 same-status → 409 `INVALID_TRANSITION`, status and version unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-21 | API | AC-16, BR-18, BR-19 | Gate: no Actions | Direct API call In Progress→Resolved → 409 `RESOLUTION_BLOCKED`, `reasons: [NO_DONE_ACTION]`; also from Waiting for Requester | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-22 | API | AC-17, BR-18 | Gate: open Actions | Done + Planned → `[OPEN_ACTIONS]`; Done + In Progress → same; only-Cancelled → `[NO_DONE_ACTION]` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-23 | API | AC-18, BR-18 | Gate: pending follow-up | Done with follow-up → `[PENDING_FOLLOW_UPS]`; follow-up on a Cancelled Action ignored; all three failing → all three reasons in order | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-24 | API | AC-19, BR-21, BR-22 | Successful resolve | 200 `TicketWorkflowState`; `resolvedAt` set; version +1; exactly one history row `IN_PROGRESS→RESOLVED` by caller | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-25 | API | AC-25, BR-21 | Reopen clears `resolvedAt` | Resolved→Closed keeps it; Closed→Reopened clears it; Reopened→In Progress→Resolved needs the gate again (blocked after a new Planned Action) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-26 | API | AC-20, BR-20 | Advisory "appears resolved" | `PATCH /api/tickets/:id/resolved` leaves `currentStatus`, `resolvedAt`, `version`, history, and `resolutionGate` unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-27 | API | AC-22, BR-17 | Requester status change | 403 on `PATCH /api/staff/tickets/:id/status` for own and other Tickets; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-28 | API | AC-23, BR-24, BR-26 | Concurrent status change | Two requests with the same version (sequential and `Promise.all`): exactly one 200; other 409 `STALE_UPDATE` with `details.current.currentStatus` = winner's; one history row | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-29 | API | AC-46, BR-24 | Version required on every workflow write | claim/owner/priority/status without `version` → 400 `field: version`; stale version → 409 for each; success returns version +1; no-op claim doesn't bump | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-30 | API | AC-24, BR-22 | History append-only and ordered | Three changes → three rows `changedAt asc, id asc`; `POST /api/tickets` writes `null→NEW`; no PATCH/DELETE route exists for history; Requester reads own (200), other's (404) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-31 | API | BR-19 | Gate read inside the transaction | Action marked Planned in a parallel request while resolving: never ends Resolved with an open Action (repeated 20×) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-32 | API | BR-23 | Cancel with open Actions | Ticket with Planned Action → Cancelled succeeds; Action untouched and now read-only (409 on edit) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-33 | API | api-spec.md §3.5 | Detail adds `version`, `resolvedAt`, `resolutionGate` | Values match DB; `resolutionGate` equals what the status endpoint would decide | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-34 | API | AC-26, BR-29, BR-30 | Administrator parity | Admin: Queue 200, Detail 200, claim, reassign (incl. to an Admin), priority, status, comment, Internal Note, Action create/update all succeed | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |
| API-35 | API | BR-30, §11-15 | Assignable users list | `/api/staff/it-staff-users` returns active IT Staff and Administrators with `role`, name-ascending; excludes inactive and Requesters | `server/tests/lab-04/ticket-workflow.api.test.ts` | Planned |

**Requester dashboard** (`server/tests/lab-04/requester-dashboard.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-36 | API | AC-02, BR-31 | Ownership | Two Requesters with fixtures; each sees only own counts and list items; `?requesterId=<other>` ignored | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-37 | API | AC-32 | Wrong roles | 401 no session; 403 IT Staff; 403 Administrator | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-38 | API | BR-39, BR-41, BR-42, AC-28 | Metric values | Each equals an independent Prisma count on the fixture; 30-day window includes day −29 at 00:00 +07 and excludes 1 ms before | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-39 | API | BR-43, BR-44, AC-35 | Lists | ≤5 items; `updatedAt desc, id desc` / `resolvedAt desc, id desc`; Reopened Ticket absent from resolved list; only documented fields | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-40 | API | BR-40, AC-31 | Zero data | Requester with no Tickets: `hasAnyTickets: false`, all values `0`, lists `[]`; Requester with Tickets but none waiting: `waitingForYou.value: 0` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-41 | API | AC-30, BR-38 | Drill-down equals list | For each metric, calling `GET /api/tickets` with the `drillDown` query returns `totalCount` = metric value | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |
| API-42 | API | api-spec.md §4.2 | My Tickets new filters | `statusGroup=active`, `resolvedFrom`, `sortBy=updatedAt` filter/sort correctly; bad values 400 `INVALID_FILTER` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Planned |

**Staff dashboard** (`server/tests/lab-04/staff-dashboard.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-43 | API | AC-32 | Wrong roles | 401 no session; 403 Requester | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-44 | API | AC-28, BR-45–BR-50 | Card values | Each of the six equals an independent Prisma query on the same DB state; "me" metrics differ correctly between two IT Staff callers | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-45 | API | BR-45, BR-48, BR-23 | Action metric edges | Open Action on a Cancelled/Resolved Ticket not counted; Cancelled Action with follow-up not counted; `ticketCount` counts distinct Tickets | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-46 | API | AC-29, BR-50, BR-34 | Resolved Today boundary | Fixture `resolvedAt` at 16:59:59.999Z (yesterday Bangkok) and 17:00:00.000Z (today Bangkok) with a faked clock: only the latter counts; Reopened-today Ticket not counted | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-47 | API | BR-51, BR-52 | Breakdowns | All 8 statuses and all 3 priorities always present, enum order, zeros included, values match DB | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-48 | API | BR-53, BR-54, AC-35 | Lists | ≤5 items each; documented order; description truncated to 80 chars with `…`; only documented fields | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-49 | API | AC-33, BR-55, FR-14 | Admin user counts | Admin: `userAccounts` matches DB per role/active; IT Staff: key absent | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-50 | API | AC-30, BR-38 | Drill-down equals list | Each ticket-count metric's `drillDown` query on `GET /api/staff/tickets` returns `totalCount` = value; BR-45 returns `ticketCount` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-51 | API | api-spec.md §4.1 | Queue new filters | `statusGroup`, `resolvedFrom`/`resolvedTo` (inclusive Bangkok dates), `followUp=pending`, `openActionAssigneeId`, `sortBy=resolvedAt` (nulls last); invalid values and `resolvedTo < resolvedFrom` → 400 | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |
| API-52 | API | AC-31, BR-37 | Zero metrics | Caller with no owned Tickets and no Actions: `myActiveTickets`, `myOpenActions` = 0, list `[]` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Planned |

**Health and error envelope** (`server/tests/lab-04/health-and-errors.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-53 | API | AC-45, FR-22 | Health | 200 `database: ok` normally; with the DB probe mocked to throw, 503 `database: unreachable` and no error text | `server/tests/lab-04/health-and-errors.api.test.ts` | Planned |
| API-54 | API | api-spec.md §0.2 | Safe 500 on new endpoints | A forced Prisma error in the Action create and dashboard handlers returns 500 `INTERNAL_ERROR` with the generic message only | `server/tests/lab-04/health-and-errors.api.test.ts` | Planned |

### 2.3 Security / Authorization

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | Security | api-spec.md §6, FR-11, BR-12, BR-17, BR-29 | Endpoint × role matrix | Every row of api-spec.md §6 for every role: 401 unauthenticated; 403 each denied role; each allowed role reaches the handler | `server/tests/lab-04/authorization-matrix.api.test.ts` | Planned |
| SEC-02 | Security | BR-12, BR-31 | No existence leak | Requester GET actions/status-history on another Requester's Ticket → 404 body exactly `{error}` | `server/tests/lab-04/authorization-matrix.api.test.ts` | Planned |
| SEC-03 | Security | BR-12, AC-06 | Requester cannot write Actions by any path | POST/PATCH to staff and requester Action paths all non-2xx; DB row count unchanged | `server/tests/lab-04/authorization-matrix.api.test.ts` | Planned |
| SEC-04 | Security | Lab 3 BR-04 | Internal Notes still private | Requester detail, actions, history, and dashboard responses never contain a seeded Internal Note's text | `server/tests/lab-04/authorization-matrix.api.test.ts` | Planned |

### 2.4 Migration / Regression

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| MIG-01 | Migration | AC-38, §7.4 | Forward migration on Lab 3 data | Every Lab 1–3 row count and id preserved; `version = 1` everywhere; zero Actions; empty history | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-02 | Migration | AC-38, §7.4 step 3 | `resolvedAt` backfill | Equals `updatedAt` read as UTC for Resolved/Closed; `NULL` for the other six statuses; run once with session `TimeZone = 'Asia/Bangkok'` and the values are still identical (no 7-hour shift) | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-03 | Migration | §7.2 | Constraints | CHECKs reject follow-up without note, Done without result, blank description, version 0; FKs Restrict Ticket/User deletion with Actions/history; unique `(performedById, clientRequestId)` | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-04 | Migration | §7.3-4 | Indexes exist | Every index in §7.2 is present | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-05 | Migration | AC-39, §7.5 | Rollback and re-apply | Down script returns to the Lab 3 schema with every Lab 1–3 row intact (Lab 3 MIG checks pass); forward migration re-applies cleanly | `server/tests/lab-04/migration.integration.test.ts` | Pass |
| MIG-06 | Migration | AC-40, §7.6 | Seed idempotency and coverage | Two runs, identical rows and ids; Tickets with 0, 1, many Actions; all Action statuses; ≥2 pending follow-ups; resolved-today Ticket; Emma has zero Tickets; Nattapong zero open Actions; history `fromStatus` is `null` only on `→ NEW` creation entries; seeded Resolved/Closed (except the legacy-style one) pass the gate; inactive assignee present | `server/tests/lab-04/schema-seed.integration.test.ts` | Pass |
| MIG-07 | Regression | AC-43, FR-23 | Lab 1–3 server suites | `server/tests/lab-01..03` pass, changed only per §6 | `server/tests/lab-01/`, `lab-02/`, `lab-03/` | Planned |
| MIG-08 | Regression | AC-43, FR-23 | Lab 1–3 client suites | `client/tests/lab-01..03` pass, changed only per §6 | `client/tests/lab-01/`, `lab-02/`, `lab-03/` | Planned |
| MIG-09 | Regression | AC-43, FR-23 | Lab 2–3 E2E suites | `e2e/lab-02`, `e2e/lab-03` pass, changed only per §6 | `e2e/lab-02/`, `e2e/lab-03/` | Planned |

### 2.5 Performance Smoke

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| PERF-01 | Performance | BR-35, §7.3-4 | Dashboard latency | With 2,000 extra Tickets and 6,000 Actions, `GET /api/dashboard/staff` and `/requester` median of 10 calls < 300 ms locally | `server/tests/lab-04/performance.smoke.test.ts` | Planned |
| PERF-02 | Performance | §7.3-4 | Gate and list latency | Status change to Resolved on a Ticket with 50 Actions < 200 ms; Queue with `followUp=pending&statusGroup=active` < 300 ms | `server/tests/lab-04/performance.smoke.test.ts` | Planned |

### 2.6 UI Component

**Staff dashboard** (`client/tests/lab-04/StaffDashboard.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | UI | FR-13, ui-spec.md §4 | Cards render | Six cards in order with exact labels and values from the stubbed response; "across N tickets" line | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-02 | UI | FR-15, AC-30 | Drill-down links | Each card, breakdown row, list row, and "View all" `href` equals the response's `drillDown`/documented route; accessible name "<Label>: <value>. View tickets" | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-03 | UI | AC-31, BR-37 | Zero and empty | Zero card shows `0` and helper text, link intact; empty lists show their messages | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-04 | UI | AC-34 | Loading / failure / retry | Skeleton while pending; safe banner on 500 with Retry that recovers; no partial numbers | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-05 | UI | AC-33 | Admin vs IT Staff | User Accounts card shown for Admin with role links; absent for IT Staff | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |
| UI-06 | UI | BR-35 | Refresh | Refresh refetches and updates "Updated" time | `client/tests/lab-04/StaffDashboard.test.tsx` | Planned |

**Requester dashboard** (`client/tests/lab-04/RequesterDashboard.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-07 | UI | FR-12, AC-02 | Cards and lists | Three cards with exact labels; both lists with Ticket links to `/tickets/:id` | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-08 | UI | AC-31, BR-40 | No Tickets at all | Whole-dashboard empty state with Create Ticket link to `/tickets/new`; no cards | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-09 | UI | AC-30 | Drill-down links | Card `href`s match documented routes | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |
| UI-10 | UI | AC-34 | Loading / failure | Skeleton; safe banner with Retry | `client/tests/lab-04/RequesterDashboard.test.tsx` | Planned |

**Actions Taken** (`client/tests/lab-04/ActionsTaken.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-11 | UI | FR-02, BR-13 | List mode | Rows in server order; all columns; inactive assignee shows "Inactive" badge; Cancelled row has badge + strikethrough; empty state text | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-12 | UI | AC-01, FR-01 | Create | Opens panel, focus to heading; defaults (now, Planned, me); Save posts exact body incl. `clientRequestId`; row appears; "Action added." announced; focus returns to + Add Action | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-13 | UI | AC-04, BR-06 | Follow-up note | Hidden until checkbox; then required; error under the field; no request sent | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-14 | UI | AC-09, BR-08 | Result required for Done | Choosing Done marks Result required; empty Result blocks submit with field error | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-15 | UI | AC-05 | Server `INVALID_ASSIGNEE` | Error shown under Assigned To; input kept | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-16 | UI | BR-09, AC-11 | Edit Done Action | Description/Result read-only with reason; follow-up editable; PATCH sends `version` and only changed fields | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-17 | UI | BR-07 | Edit status options | Only permitted next statuses offered; Cancel asks inline confirmation | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-18 | UI | AC-08, AC-44, BR-26 | Stale update | 409 shows conflict banner with latest values; typed input kept; Reload latest refreshes form | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-19 | UI | AC-44, FR-20 | Network/500 failure | Safe banner inside panel; all entered values kept | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-20 | UI | BR-28, FR-21 | Double click | Two rapid clicks on Save send one request; retry after network error reuses the same `clientRequestId` | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-21 | UI | AC-12, BR-10 | Non-active Ticket | + Add Action and Edit hidden; helper "Reopen it to record more actions." | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-22 | UI | AC-07, BR-12 | Requester view | Requester Ticket Detail shows every field read-only; no Add/Edit buttons or form; uses `/api/tickets/:id/actions` | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |
| UI-23 | UI | AC-42 | Keyboard | Tab order through form; Esc cancels and returns focus to trigger | `client/tests/lab-04/ActionsTaken.test.tsx` | Planned |

**Ticket workflow** (`client/tests/lab-04/TicketWorkflow.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-24 | UI | AC-27, BR-16 | Status options | Only permitted transitions from each of the 8 statuses are offered | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-25 | UI | AC-27, BR-18 | Gate failing | "Resolved (blocked)" disabled; callout lists each reason with link to `#actions-taken`; `aria-describedby` set | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-26 | UI | AC-27, AC-19 | Successful change | PATCH carries `version`; header status badge, info card, and Status History update without reload | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-27 | UI | AC-16 | Server `RESOLUTION_BLOCKED` | Select reverts; callout from `details.reasons` | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-28 | UI | AC-23 | Server `STALE_UPDATE` on status/owner/priority | Select reverts; conflict banner with latest values; Reload latest | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-29 | UI | FR-09, BR-22 | Status History | Oldest-first entries with badges, name, role, Bangkok time; legacy empty message "No status changes recorded yet."; Show all toggle beyond 10 | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-30 | UI | AC-20 | Requester "appears resolved" | Badge on staff view; Resolved option state driven only by `resolutionGate` | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |
| UI-31 | UI | AC-26 | Administrator detail | Admin sees all controls incl. Actions Taken; Owner dropdown lists Admins with role suffix | `client/tests/lab-04/TicketWorkflow.test.tsx` | Planned |

**Navigation and drill-down destinations** (`client/tests/lab-04/NavigationAndFilters.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-32 | UI | AC-36, FR-17 | Nav per role | Requester: Dashboard, My Tickets, Create Ticket; IT Staff: Dashboard, Ticket Queue; Admin: Dashboard, Ticket Queue, User Management; `aria-current` on active | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Planned |
| UI-33 | UI | AC-36, §11-8 | Landing | Login success and `/` redirect go to `/dashboard` for each role; correct dashboard variant renders | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Planned |
| UI-34 | UI | AC-47, FR-16 | Queue URL filters | `/staff/tickets?followUp=pending&statusGroup=active` requests those params and shows chips; removing a chip updates URL and request | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Planned |
| UI-35 | UI | AC-47 | My Tickets URL filters | `/tickets?statusGroup=active` and `resolvedFrom` applied with chips | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Planned |
| UI-36 | UI | AC-47 | User Management URL role | `/admin/users?role=IT_STAFF` applies role filter chip | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Planned |
| UI-37 | UI | ui-spec.md §2.5 | Invalid URL filter | 400 `INVALID_FILTER` shows safe banner with Clear filters | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Planned |
| UI-38 | UI | AC-37 | Bangkok times on screens | With `TZ` ≠ Bangkok, My Tickets, both Ticket Details, and dashboards render Bangkok times | `client/tests/lab-04/NavigationAndFilters.test.tsx` | Planned |

### 2.7 UI Style / Responsive / Accessibility

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| STYLE-01 | Visual/Responsive | AC-41, ui-spec.md §10, §13 | Staff and Requester dashboards | Desktop/tablet/mobile screenshots; `scrollWidth` ≤ viewport; card columns 3/2/1 | `e2e/lab-04/screenshots.spec.ts` → `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard}/*.png` | Planned |
| STYLE-02 | Visual/Responsive | AC-41 | Actions Taken (staff + requester) | Table on desktop/tablet, cards on mobile; create, locked-edit, validation, conflict, blocked-resolution states captured; no overflow with long unbroken text | `e2e/lab-04/screenshots.spec.ts` → `artifacts/lab-04/screenshots/actions-taken/*.png` | Planned |
| STYLE-03 | Visual/Responsive | AC-43 | Lab 2/3 screens still clean | Re-run Lab 3 screenshot specs; no new overflow | `e2e/lab-03/screenshots.spec.ts`, `e2e/lab-03/staff-and-admin-screenshots.spec.ts` | Planned |
| A11Y-01 | Accessibility | AC-42, ui-spec.md §9 | Automated scan | `@axe-core/playwright` on both dashboards, both Ticket Detail screens (Actions open), Queue, My Tickets: zero serious/critical violations | `e2e/lab-04/accessibility.spec.ts` | Planned |
| A11Y-02 | Accessibility | AC-42 | Keyboard-only | Tab through staff dashboard reaches every card link in order with visible focus; Enter on a card drills down; Actions form opens/closes by keyboard with focus return | `e2e/lab-04/accessibility.spec.ts` | Planned |

### 2.8 End-to-End

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | E2E | AC-01, AC-14, AC-05, AC-11 | Actions Taken flow | IT Staff A owns Ticket; IT Staff B adds Planned Action assigned to A; Admin adds Done Action with follow-up; inactive assignee rejected; follow-up cleared; three performers visible; Owner still A | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-02 | E2E | AC-07, AC-06 | Requester sees Actions read-only | Requester opens own Ticket, sees every Action field, no Add/Edit controls | `e2e/lab-04/actions-taken-flow.spec.ts` | Planned |
| E2E-03 | E2E | AC-16, AC-17, AC-19, AC-27 | Resolution through the UI | Resolved blocked with reasons; finish/cancel Actions; Resolved enabled; resolve; badge and history update | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-04 | E2E | AC-16, BR-19 | Gate bypass attempt | `page.request.patch` straight to the status endpoint with a valid version on a gate-failing Ticket → 409; UI still shows old status after reload | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-05 | E2E | AC-20 | Requester "appears resolved" stays advisory | Requester marks it; IT Staff view still blocked from Resolved until Actions qualify | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-06 | E2E | AC-23 | Two browser contexts, stale update | Both open the Ticket; first changes status; second's change gets the conflict banner; Reload latest shows the first's status | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-07 | E2E | AC-25 | Reopen | Resolved → Closed → Reopened; Resolved blocked again after adding a Planned Action | `e2e/lab-04/ticket-resolution.spec.ts` | Planned |
| E2E-08 | E2E | AC-28, AC-30 | Staff dashboard drill-down | Each card's value equals the destination list's "Showing … of N" | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-09 | E2E | AC-02, AC-30, AC-31 | Requester dashboard | Jennifer sees own metrics and drill-down matches; Emma sees empty state and Create Ticket | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-10 | E2E | AC-33, AC-26 | Administrator | Admin lands on dashboard with User Accounts; drill to User Management filtered; opens Queue and records an Action | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-11 | E2E | AC-36 | Landing per role | Each seeded role lands on `/dashboard` after login | `e2e/lab-04/dashboards.spec.ts` | Planned |
| E2E-12 | E2E | AC-43, FR-23 | Cross-role regression tour | Login/logout, first-login password change, Create Ticket with attachment, My Tickets search, Public Comment, Internal Note privacy, claim/reassign, User Management create/deactivate, all in one run with no console errors | `e2e/lab-04/regression.spec.ts` | Planned |
| E2E-13 | E2E | AC-37 | Time zone | Browser context `timezoneId: 'America/New_York'` shows Bangkok times on Ticket Detail and dashboards | `e2e/lab-04/regression.spec.ts` | Planned |

## 3. Acceptance-Criterion Traceability Matrix

| AC | Covered by |
| --- | --- |
| AC-01 | API-03, UI-12, E2E-01 |
| AC-02 | API-36, UI-07, E2E-09 |
| AC-03 | API-04 |
| AC-04 | UNIT-04, API-05, UI-13 |
| AC-05 | API-06, UI-15, E2E-01 |
| AC-06 | API-01, API-17, SEC-03, E2E-02 |
| AC-07 | API-17, UI-22, E2E-02 |
| AC-08 | API-11, UI-18 |
| AC-09 | UNIT-04, API-08, UI-14 |
| AC-10 | UNIT-03, API-09, API-10 |
| AC-11 | UNIT-03, API-10, UI-16, E2E-01 |
| AC-12 | API-13, UI-21 |
| AC-13 | API-14 |
| AC-14 | API-15, E2E-01 |
| AC-15 | API-02 |
| AC-16 | UNIT-01, API-21, UI-27, E2E-03, E2E-04 |
| AC-17 | UNIT-01, API-22, E2E-03 |
| AC-18 | UNIT-01, API-23 |
| AC-19 | API-24, UI-26, E2E-03 |
| AC-20 | API-26, UI-30, E2E-05 |
| AC-21 | API-20, UNIT-08 |
| AC-22 | API-27, SEC-01 |
| AC-23 | API-28, UI-28, E2E-06 |
| AC-24 | API-30 |
| AC-25 | UNIT-06, API-25, E2E-07 |
| AC-26 | API-34, UI-31, E2E-10 |
| AC-27 | UI-24, UI-25, UI-26, E2E-03 |
| AC-28 | API-38, API-44, E2E-08 |
| AC-29 | UNIT-05, API-46 |
| AC-30 | API-41, API-50, UI-02, UI-09, E2E-08, E2E-09 |
| AC-31 | API-40, API-52, UI-03, UI-08, E2E-09 |
| AC-32 | API-37, API-43, SEC-01 |
| AC-33 | API-49, UI-05, E2E-10 |
| AC-34 | UI-04, UI-10 |
| AC-35 | API-39, API-48 |
| AC-36 | UI-32, UI-33, E2E-11 |
| AC-37 | UNIT-07, UI-38, E2E-13 |
| AC-38 | MIG-01, MIG-02 |
| AC-39 | MIG-05 |
| AC-40 | MIG-06 |
| AC-41 | STYLE-01, STYLE-02 |
| AC-42 | UI-23, A11Y-01, A11Y-02 |
| AC-43 | MIG-07, MIG-08, MIG-09, STYLE-03, E2E-12 |
| AC-44 | UI-18, UI-19 |
| AC-45 | API-53 |
| AC-46 | API-29 |
| AC-47 | UI-34, UI-35, UI-36 |

Every AC-01–AC-47 maps to at least one planned test.

## 4. Responsive and Visual Checklist

Mirrors `ui-spec.md` §12. Each item is ticked with its evidence (test ID
and screenshot path) in Issue #69/#70:

- [ ] Zen Green consistency across dashboards and Ticket Detail screens
- [ ] Metric cards readable, unclipped, value not color-only, at 3 viewports
- [ ] Zero cards and empty lists show helper text
- [ ] Editable vs. read-only vs. invalid vs. disabled Action fields
      consistent with Lab 2 §3
- [ ] Validation placement directly under fields, no overlap
- [ ] Cancelled Actions and inactive assignees distinguishable without color
- [ ] Shared vs. private content distinct
- [ ] Badges carry text and icon
- [ ] Keyboard focus visible and logical; form focus return
- [ ] No clipping, overlap, or horizontal scroll on any Lab 4 screen
- [ ] Navigation per role with non-color active indication
- [ ] Bangkok time shown under a non-Bangkok browser time zone

## 5. Test Commands

Unchanged from Lab 3, run after `README.md` setup (`pnpm db:up`,
`pnpm prisma:generate`, `pnpm prisma:migrate`, `pnpm prisma:seed`):

```bash
pnpm --filter server test   # unit + API/integration/security/migration/perf smoke
pnpm --filter client test   # UI component
pnpm e2e                    # E2E, screenshots, accessibility
pnpm test                   # all three in sequence
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
| E2E-09 (`e2e/lab-03/staff-ticket-flow.spec.ts`) | BR-18 | If the flow resolves the Ticket, it records a Done Action first |
| Seeded-owner check in "spreads tickets across owners…" (`server/tests/lab-03/schema-seed.integration.test.ts`) | BR-30 | A seeded Ticket owner may be an active Administrator as well as active IT Staff (the §7.6 seed makes Alex Morgan an owner) |

## 7. Final Results

Not yet run. Issue #70 records the final server/client/E2E counts and any
gaps found here.

## 8. Known Limitations or Deferred Tests

- PERF-01/02 thresholds are smoke checks on a developer machine, not load
  tests. They catch a missing index or an N+1 query, not production
  capacity (handout §4.2 excludes production-scale operations).
- The Lab 3 limitation on AC-26 (a truly empty system-wide Ticket table
  tested only at the mocked UI layer) still applies. The Lab 4 Requester
  empty state (BR-40) has no such limit, because it is per-Requester and
  Emma Watson has zero Tickets in the shared database.
