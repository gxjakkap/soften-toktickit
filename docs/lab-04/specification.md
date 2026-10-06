# Lab 4 Sprint Engineering Specification

Status: **Draft — engineering contract for Issue #61, written before any
Lab 4 implementation.** It extends `docs/lab-03/specification.md`; every
Lab 1–3 requirement stays in force unless a rule below explicitly
supersedes it (each supersession is listed in
[§11 Assumptions and Decisions](#11-assumptions-and-decisions)).

Requirement IDs restart for this lab. A Lab 3 rule is cited as
"Lab 3 BR-nn"; an unqualified ID always means this document.

## 1. Sprint Goal

Complete the TokTickIT service-desk workflow. IT Staff and Administrators
record Actions Taken under each Ticket: planned or completed work, who it is
assigned to, what happened, and whether follow-up is needed. Moving a Ticket
to Resolved is gated on that work being finished. Every status change is
recorded in an append-only history and protected against stale concurrent
edits. Requesters and IT Staff each get a concise dashboard, calculated by
the backend, that links into the existing detailed screens. All Lab 1–3
behavior keeps working under one consistent Zen Green application.

## 2. Stakeholder Request

The service desk can take in Tickets and talk to Requesters, but it has no
record of the work itself. The stakeholder wants each Ticket to carry its
own log of Actions Taken: when the action happened, what was done, what
came of it, who did it (filled in by the system, not typed), whether
someone still needs to follow up and why, and a pointer to any supporting
files. The Ticket Owner stays the single person responsible for the Ticket
as a whole. The hands-on work can be spread across other IT Staff, and the
log should show who did what.

A Requester saying "this looks fixed" is useful information, but it doesn't
close anything. Only IT Staff can formally resolve a Ticket, after checking
the work. The system should refuse a resolution the recorded work doesn't
support, even if someone calls the API directly instead of using the screen.

Both audiences want a starting screen that answers "what needs my attention
right now?" in a few numbers and short lists, with every number leading to
the detailed list behind it, not a reporting tool. Last, the stakeholder
wants the whole product finished: earlier features still work, every screen
looks like the same Zen Green application, and nothing half-built is left
on screen.

## 3. Scope

### Included

- `ActionTaken` records under a Ticket: Action Date/Time, Action
  Description, Result, Performed By (automatic), Assigned To, Action Status,
  Follow-Up Required, Follow-Up Note, Attachment Notes
- Create, list, and update of Actions Taken by IT Staff and Administrators;
  read-only Actions Taken for the Requester on their own Tickets
- The final Ticket status transition matrix with authorized roles, a
  backend-enforced resolution gate, and an append-only status history
- Optimistic concurrency (`version`) on every Ticket and Action Taken write,
  and idempotent Action Taken creation for retried submissions
- Administrator parity with IT Staff for every Ticket operation (Queue,
  Ticket Detail, ownership, priority, status, comments, notes, Actions
  Taken), in addition to User Management
- Requester Dashboard and IT Staff Dashboard (the Administrator uses the IT
  Staff Dashboard plus user-account counts), with backend-calculated
  metrics, short recent lists, and drill-down links into filtered Queue, My
  Tickets, User Management, or Ticket Detail views
- URL-driven filters on My Tickets, Ticket Queue, and User Management so
  drill-down links open a pre-filtered list
- Explicit Asia/Bangkok display of every date/time and Asia/Bangkok day
  boundaries for dashboard calculations
- Prisma migration, documented rollback script, backfill, and idempotent
  seed for the above
- Final hardening: regression of all Lab 1–3 behavior, consistent feedback
  states, duplicate-submission safety, form-data preservation on
  recoverable failures, removal of obsolete UI, health check with a
  database probe, current README

### Explicitly Excluded

From handout §4.2:

- Automatic SLA clocks, escalation engines, on-call scheduling, and breach
  notifications
- Email, SMS, LINE, push, or other external notification services
- Inventory consumption, spare-parts management, purchasing, or cost
  accounting for services
- Time-sheet billing, payroll, or detailed labor-cost calculation
- Multi-level approval workflows and electronic signatures
- Advanced business-intelligence tools, custom report builders, or export
  warehouses
- Multi-tenant organizations and production-scale cloud operations
- New product features not approved in this engineering contract

Also excluded by this contract:

- Deleting an Action Taken (an Action is cancelled instead, BR-13)
- File upload on an Action Taken (Attachment Notes is a text pointer to
  files already attached to the Ticket, BR-05)
- Any Requester-initiated status change, including cancel or reopen (BR-17)
- Editing or deleting status history entries, Public Comments, or Internal
  Notes
- Dashboard charts, date-range pickers, exports, or user-configurable cards
- Real-time push updates (dashboards and detail screens refresh on load and
  after the user's own writes)
- Everything Lab 3 §3 already excluded (MFA, SSO, self-registration,
  login throttling, user deletion, and the rest)

## 4. Functional Requirements

| ID | Requirement |
| --- | --- |
| FR-01 | The system shall let an IT Staff user or Administrator create an Action Taken under a Ticket whose status is active (BR-10). |
| FR-02 | The system shall let an IT Staff user or Administrator list every Action Taken on any Ticket, in a stable order (BR-13). |
| FR-03 | The system shall let an IT Staff user or Administrator update an Action Taken's editable fields, Action Status, and Assigned To, subject to BR-04–BR-10. |
| FR-04 | The system shall record Performed By on every Action Taken from the authenticated session, never from the request. |
| FR-05 | The system shall let a Requester view, read-only, every Action Taken on a Ticket they own, and nothing on any other Ticket. |
| FR-06 | The system shall treat a repeated Action Taken creation carrying the same client request id as one creation, not two. |
| FR-07 | The system shall let an IT Staff user or Administrator change a Ticket's Current Status only along the transition matrix in BR-16. |
| FR-08 | The system shall refuse a transition to Resolved unless the resolution gate (BR-18) is satisfied, and report which conditions failed. |
| FR-09 | The system shall append one status history entry for every Current Status change, including Ticket creation, and show the history on both Ticket Detail screens. |
| FR-10 | The system shall reject a Ticket or Action Taken update based on a stale version with a conflict response that carries the current state, instead of overwriting another user's change. |
| FR-11 | The system shall give the Administrator every IT Staff Ticket capability (Queue, Ticket Detail, claim, reassign, IT Priority, status, Public Comments, Internal Notes, Actions Taken, IT Staff Dashboard) in addition to User Management. |
| FR-12 | The system shall provide a Requester Dashboard calculated by the backend from the authenticated Requester's own Tickets only. |
| FR-13 | The system shall provide an IT Staff Dashboard calculated by the backend from all Tickets and Actions Taken, personalized to the caller where a metric says "my". |
| FR-14 | The system shall add user-account counts by role and active state to the dashboard when the caller is an Administrator. |
| FR-15 | The system shall let every dashboard card, breakdown entry, and list item open the matching filtered My Tickets, Ticket Queue, User Management, or Ticket Detail view. |
| FR-16 | My Tickets, Ticket Queue, and User Management shall read their filters from, and write them to, the URL query string, so a link reproduces a filtered view. |
| FR-17 | The system shall show a Dashboard navigation item to every role and make the Dashboard each role's landing screen after login. |
| FR-18 | The system shall display every date/time in the Asia/Bangkok time zone regardless of the browser's own time zone. |
| FR-19 | The system shall show consistent loading, validation, success, empty/no-results, forbidden, conflict, not-found, and safe failure feedback on every screen that calls the API. |
| FR-20 | The system shall keep the user's entered form data after a recoverable failure (validation, conflict, network, or server error). |
| FR-21 | The system shall prevent duplicate writes caused by repeated clicks or network retries (disabled-while-busy controls, FR-06 for creation, version checks for updates). |
| FR-22 | The health endpoint shall report API and database status, returning 503 without internal details when the database is unreachable. |
| FR-23 | Every Lab 1–3 screen and endpoint shall remain available to the roles permitted by this contract, and every Lab 1–3 acceptance criterion not explicitly superseded in §11 shall still pass. |
| FR-24 | The release shall remove temporary, duplicate, placeholder, or unfinished UI, except screens an earlier lab's acceptance criteria still require (§11-14). |
| FR-25 | `README.md` shall document current setup, migration, rollback, seed, test, and demonstration steps for the Lab 4 increment. |

## 5. Business Rules

### 5.1 Actions Taken

| BR ID | Business Rule |
| --- | --- |
| BR-01 | An Action Taken belongs to exactly one Ticket. The Ticket is fixed at creation from the request path and can never change. |
| BR-02 | The Ticket Owner coordinates the Ticket, but an Action Taken may be performed by, or assigned to, a different IT Staff member or Administrator. Creating or updating an Action Taken never changes the Ticket Owner. |
| BR-03 | Performed By is set once, at creation, to the authenticated user. Any `performedBy`/`performedById` value in a request body is ignored, and no endpoint can change it afterward. |
| BR-04 | Assigned To must reference an active user whose role is IT Staff or Administrator. It defaults to the creator when omitted on creation. An inactive, Requester, or nonexistent user is rejected with `400 INVALID_ASSIGNEE`. An update that does not send `assignedToId` keeps the current assignee, even if that user has since been deactivated. |
| BR-05 | Field limits, after trimming: Action Description is required, 1–2000 characters. Result is optional, 0–2000 characters, stored as `null` when empty. Follow-Up Note is 1–1000 characters when required (BR-06). Attachment Notes is optional, 0–500 characters: free text naming files already attached to the Ticket or stored elsewhere (no file is uploaded with an Action). Action Date/Time is a required ISO 8601 timestamp. |
| BR-06 | When Follow-Up Required is true, Follow-Up Note is required (`400 VALIDATION_ERROR`, `field: "followUpNote"`, nothing saved). When Follow-Up Required is false, the server stores Follow-Up Note as `null` regardless of what was sent. |
| BR-07 | Action Status is one of Planned, In Progress, Done, Cancelled; a new Action defaults to Planned. Permitted changes: Planned → In Progress, Done, or Cancelled; In Progress → Planned, Done, or Cancelled. Done and Cancelled are final. Any other change returns `409 INVALID_ACTION_TRANSITION`. |
| BR-08 | An Action can be set to Done only when its Result is non-empty (`400 VALIDATION_ERROR`, `field: "result"`), and only when its Action Date/Time is not more than 5 minutes in the future (`400 VALIDATION_ERROR`, `field: "actionAt"`). Planned and In Progress Actions may carry a future Action Date/Time (scheduled work). |
| BR-09 | Which fields can be edited depends on Action Status. Planned and In Progress: every field except Ticket and Performed By. Done: only Follow-Up Required, Follow-Up Note, and Attachment Notes, so a follow-up can be recorded as handled without reopening finished work. Cancelled: nothing. A request that changes a locked field returns `409 ACTION_LOCKED` with `field` naming it. A Done or Cancelled Action may be resent with an unchanged value without error. |
| BR-10 | Actions can be created or updated only while the Ticket's Current Status is active (BR-15). On a Resolved, Closed, or Cancelled Ticket, every Action write returns `409 TICKET_NOT_ACTIONABLE`. To record more work after resolution, IT Staff reopen the Ticket first. |
| BR-11 | Any active IT Staff user or Administrator may create or update an Action on any Ticket. Action writes are not limited to the Ticket Owner, Performed By user, or assignee, consistent with the shared-queue rule (Lab 3 BR-31). |
| BR-12 | A Requester may read the Actions Taken, with every field, on a Ticket they own, and may never create or update one. Staff Action endpoints return `403 FORBIDDEN` to a Requester. A Requester reading Actions on a Ticket they don't own receives the same `404 NOT_FOUND` as for a nonexistent Ticket (Lab 3 BR-16). |
| BR-13 | Actions Taken are never deleted. An Action that should not count is set to Cancelled and stays visible. Every list orders Actions by Action Date/Time ascending, then id ascending, so the order is stable across reloads and ties. |
| BR-14 | Action creation accepts an optional `clientRequestId` (UUID). A second creation with the same `clientRequestId` by the same user returns the first Action (`200`) instead of creating another. Without `clientRequestId`, every request creates a new Action. |

### 5.2 Ticket Status Workflow

| BR ID | Business Rule |
| --- | --- |
| BR-15 | Ticket statuses remain New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, and Cancelled (Lab 3 BR-23). **Active** statuses are New, Open, In Progress, Waiting for Requester, and Reopened. Resolved, Closed, and Cancelled are not active. Every dashboard metric and filter that says "active" uses this exact set. |
| BR-16 | Current Status may change only along the matrix below. Every other pair, including a status to itself, returns `409 INVALID_TRANSITION` with the status unchanged. The matrix is unchanged from Lab 3 §7; Lab 4 adds the role column, the gate on Resolved, and the history entry. |
| BR-17 | Only IT Staff and Administrators may change Current Status. A Requester never changes Current Status, directly or indirectly: a Requester call to the status endpoint returns `403 FORBIDDEN`. Ticket creation by a Requester sets the initial New status (Lab 3 BR-17). |
| BR-18 | **Resolution gate.** A transition to Resolved is permitted only when all three hold for that Ticket: (a) at least one Action Taken has status Done; (b) no Action Taken has status Planned or In Progress; (c) no non-Cancelled Action Taken has Follow-Up Required set to true. Otherwise the request returns `409 RESOLUTION_BLOCKED` listing each failed condition as `NO_DONE_ACTION`, `OPEN_ACTIONS`, or `PENDING_FOLLOW_UPS`, and the status is unchanged. |
| BR-19 | The resolution gate, the transition check, and the version check are evaluated by the backend, inside the same Serializable transaction as the status write. The gate applies to every caller and every client, including direct API calls. A gate result the client computed or received earlier is never trusted. |
| BR-20 | The Requester's "Problem Appears Resolved" action (Lab 3 BR-24, BR-25) stays advisory. It records `requesterConfirmedResolvedAt` only. It never changes Current Status, never sets `resolvedAt`, and never satisfies any condition of the resolution gate. |
| BR-21 | `resolvedAt` is set to the transition time whenever a Ticket enters Resolved. It is kept when the Ticket moves Resolved → Closed and cleared to `null` when the Ticket moves to Reopened. A Reopened Ticket must pass the gate again to be resolved again. |
| BR-22 | Every Current Status change, including the initial New at Ticket creation, appends exactly one status history entry (from status, to status, changed by, changed at) in the same transaction as the change. History entries are never updated or deleted, no endpoint offers either, and they are listed by changed-at ascending, then id ascending. Tickets created before Lab 4 have no entries for earlier changes, and the UI says so (§7.4). |
| BR-23 | Cancelling a Ticket is allowed regardless of its Actions Taken. Planned or In Progress Actions on a Cancelled Ticket stay as they are, read-only through BR-10, and drop out of every dashboard metric because those metrics count active Tickets only. |

**Transition matrix** (✓ = permitted; every permitted transition may be
performed by **IT Staff** or **Administrator**; **Requester** may perform
none):

| From \ To | Open | In Progress | Waiting for Requester | Resolved | Closed | Reopened | Cancelled |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **New** | ✓ | ✓ | | | | | ✓ |
| **Open** | | ✓ | ✓ | | | | ✓ |
| **In Progress** | | | ✓ | ✓ (gate) | | | ✓ |
| **Waiting for Requester** | | ✓ | | ✓ (gate) | | | ✓ |
| **Resolved** | | | | | ✓ | ✓ | |
| **Closed** | | | | | | ✓ | |
| **Reopened** | ✓ | ✓ | | | | | |
| **Cancelled** | *(final; no further transitions)* | | | | | | |

"(gate)" marks the two transitions BR-18 additionally guards. The
17 permitted transitions are the same as Lab 3's.

### 5.3 Concurrency and Duplicate Submission

| BR ID | Business Rule |
| --- | --- |
| BR-24 | Every Ticket carries an integer `version`, starting at 1. Every write to the Ticket's own workflow fields (claim, reassign, IT Priority, Current Status) must send the `version` the client last read. If it doesn't match the stored value, the write returns `409 STALE_UPDATE` and changes nothing. A successful write increments `version` by exactly 1 and returns the new value. A missing or non-integer `version` returns `400 VALIDATION_ERROR`, `field: "version"`. |
| BR-25 | Every Action Taken carries its own integer `version` with the same rules as BR-24 for updates. Creating an Action does not require or change the Ticket's `version`, so recording work never makes a colleague's pending status change stale. The resolution gate (BR-19) still reads the latest Actions inside the status transaction. |
| BR-26 | A `409 STALE_UPDATE` response includes the current server copy of the record in `error.details.current`, so the client can show what changed and let the user retry from fresh data without losing their input. |
| BR-27 | Creating or updating an Action Taken, and posting a Public Comment or Internal Note, set the Ticket's `updatedAt` to the time of that write without changing its `version`. "Recently updated" lists therefore reflect all Ticket activity. |
| BR-28 | Every submit control is disabled from the moment a request is sent until it settles. Action creation sends a fresh `clientRequestId` per form, reused on retry of the same form (BR-14). An update retried after it already succeeded fails the version check (BR-24/BR-25) instead of applying twice. |

### 5.4 Roles

| BR ID | Business Rule |
| --- | --- |
| BR-29 | The Administrator has every IT Staff Ticket capability: Ticket Queue, IT Staff Ticket Detail, claim, reassign, IT Priority, Current Status, Public Comments, Internal Notes, Actions Taken, and the IT Staff Dashboard. Administrators keep User Management, which IT Staff still cannot use. This supersedes Lab 3 BR-40 and Lab 3 §12-7. |
| BR-30 | A Ticket Owner (claim or reassign) and an Action assignee may be any active user with the IT Staff or Administrator role. This widens Lab 3 BR-20's IT-Staff-only target list. |
| BR-31 | Requester ownership rules are unchanged: every Requester endpoint is scoped to Tickets whose Requester is the authenticated user, and anything else returns `404 NOT_FOUND` (Lab 3 BR-16). |

### 5.5 Dates and Times

| BR ID | Business Rule |
| --- | --- |
| BR-32 | Every timestamp is generated or validated by the server and stored as a UTC instant. A client-supplied Action Date/Time must carry an explicit offset or `Z`; a value without one returns `400 VALIDATION_ERROR`. |
| BR-33 | Every date/time shown in the UI is rendered in the Asia/Bangkok time zone (UTC+07:00, no daylight saving) through one shared client formatter, regardless of the browser's time zone. Date and time: `6 Oct 2026, 14:05`; date only: `6 Oct 2026`. The Action Date/Time input is entered as Asia/Bangkok wall-clock time and converted to UTC before sending. |
| BR-34 | A dashboard "day" is the Asia/Bangkok calendar day, the half-open interval [00:00, 24:00) +07:00, which is [17:00 UTC of the previous day, 17:00 UTC). "Today" is the Asia/Bangkok day containing the server's current time. A date-only filter value `YYYY-MM-DD` means that Asia/Bangkok day. |

### 5.6 Dashboards

General rules:

| BR ID | Business Rule |
| --- | --- |
| BR-35 | Every dashboard value is computed by the backend at request time from the authoritative tables, with no cache and no client-side calculation. Each response carries `generatedAt`. |
| BR-36 | Dashboard responses are concise: counts plus lists of at most 5 items each. They never return full Ticket or Action collections. |
| BR-37 | A metric whose value is 0 is still returned and shown as `0` with its drill-down link intact. An empty list is returned as `[]` and shown with a one-line empty message. The dashboard as a whole has one additional empty state: a Requester with no Tickets at all (BR-40). |
| BR-38 | Every count metric whose drill-down is a filtered list must equal that list's `totalCount` when the link is followed against the same data. The one documented exception is BR-45, which counts Actions but drills down to Tickets. |

**Requester Dashboard** (`GET /api/dashboard/requester`): every metric is
limited to Tickets whose `requesterId` is the caller (BR-31).

| BR ID | Metric (exact UI label) | Calculation | Empty behavior | Drill-down destination |
| --- | --- | --- | --- | --- |
| BR-39 | **Open Tickets** | Count of the caller's Tickets with Current Status in the active set (BR-15). | `0`, helper "No open tickets." | `/tickets?statusGroup=active` |
| BR-40 | *(dashboard empty state)* | `hasAnyTickets` = the caller has at least one Ticket of any status. | When false, the whole dashboard shows "You haven't submitted any tickets yet." with a Create Ticket action in place of the cards and lists. | `/tickets/new` |
| BR-41 | **Waiting for You** | Count of the caller's Tickets with Current Status = Waiting for Requester. | `0`, helper "Nothing needs your reply." | `/tickets?status=WAITING_FOR_REQUESTER` |
| BR-42 | **Resolved (Last 30 Days)** | Count of the caller's Tickets with `resolvedAt` not null and `resolvedAt` ≥ the start of the Asia/Bangkok day 29 days before today (a 30-day window including today, BR-34). Includes Tickets since Closed; excludes Reopened ones because Reopened clears `resolvedAt` (BR-21). | `0`, helper "No tickets resolved in the last 30 days." | `/tickets?resolvedFrom=<YYYY-MM-DD of the window start>` |
| BR-43 | **Recently Updated** (list) | The caller's 5 Tickets with the greatest `updatedAt`, ties broken by id descending, any status. Each item: Ticket Number, Summary, status, `updatedAt`. | `[]`, "No recent updates." | Each item → `/tickets/:id`; "View all" → `/tickets?sortBy=updatedAt&sortDir=desc` |
| BR-44 | **Recently Resolved** (list) | The caller's 5 Tickets with the greatest non-null `resolvedAt`, ties broken by id descending. Each item: Ticket Number, Summary, status, `resolvedAt`. | `[]`, "No resolved tickets yet." | Each item → `/tickets/:id` |

**IT Staff Dashboard** (`GET /api/dashboard/staff`, IT Staff and
Administrator): "me" means the authenticated caller.

| BR ID | Metric (exact UI label) | Calculation | Empty behavior | Drill-down destination |
| --- | --- | --- | --- | --- |
| BR-45 | **My Open Actions** | Count of Actions Taken with `assignedToId` = me, Action Status Planned or In Progress, on Tickets in the active set. The card also shows "across N tickets", the count of distinct Tickets among them. | `0`, helper "No open actions assigned to you." | `/staff/tickets?openActionAssigneeId=<my id>&statusGroup=active`. The list shows the N Tickets; this is the one count-vs-list exception to BR-38. |
| BR-46 | **Unassigned** | Count of Tickets with `ownerId` null and Current Status active. | `0`, helper "Every active ticket has an owner." | `/staff/tickets?ownerId=unassigned&statusGroup=active` |
| BR-47 | **My Active Tickets** | Count of Tickets with `ownerId` = me and Current Status active. | `0`, helper "You don't own any active tickets." | `/staff/tickets?ownerId=<my id>&statusGroup=active` |
| BR-48 | **Follow-Ups Pending** | Count of distinct Tickets with Current Status active that have at least one non-Cancelled Action with Follow-Up Required = true. | `0`, helper "No pending follow-ups." | `/staff/tickets?followUp=pending&statusGroup=active` |
| BR-49 | **High Priority** | Count of Tickets with IT Priority = High and Current Status active. | `0`, helper "No active high-priority tickets." | `/staff/tickets?itPriority=HIGH&statusGroup=active` |
| BR-50 | **Resolved Today** | Count of Tickets with `resolvedAt` inside today's Asia/Bangkok day (BR-34), regardless of current status (a Ticket resolved then closed today still counts; one reopened today does not, BR-21). | `0`, helper "Nothing resolved yet today." | `/staff/tickets?resolvedFrom=<today>&resolvedTo=<today>` |
| BR-51 | **Tickets by Status** (breakdown) | Count of all Tickets per Current Status, all eight statuses always present (0 when none). | Each `0` entry shown, not hidden. | Each entry → `/staff/tickets?status=<STATUS>` |
| BR-52 | **Active Tickets by IT Priority** (breakdown) | Count of active Tickets per IT Priority; Low, Medium, and High always present. | Each `0` entry shown. | Each entry → `/staff/tickets?itPriority=<P>&statusGroup=active` |
| BR-53 | **My Open Actions** (list) | The 5 open Actions behind BR-45, ordered by Action Date/Time ascending, then id ascending (oldest first). Each item: Ticket Number, Action Description (truncated to 80 characters), Action Status, Action Date/Time. | `[]`, "No open actions assigned to you." | Each item → `/staff/tickets/:ticketId#actions-taken` |
| BR-54 | **Recently Updated** (list) | The 5 Tickets, any status, with the greatest `updatedAt`, ties broken by id descending. Each item: Ticket Number, Summary, status, owner name or "Unassigned", `updatedAt`. | `[]`, "No tickets yet." | Each item → `/staff/tickets/:id`; "View all" → `/staff/tickets?sortBy=updatedAt&sortDir=desc` |
| BR-55 | **User Accounts** (Administrator only) | For each role (Requester, IT Staff, Administrator), the count of active and of inactive users. Present only when the caller is an Administrator; absent (not `null`) for IT Staff. | Each `0` shown. | Each role → `/admin/users?role=<ROLE>` |

## 6. UI Specification Summary

Full detail is in [`ui-spec.md`](./ui-spec.md). Summary:

- **Screens**: new Requester Dashboard and IT Staff Dashboard, both at
  `/dashboard` and chosen by role (the Administrator sees the IT Staff
  Dashboard with an extra User Accounts card). An Actions Taken section and
  a Status History section are added to IT Staff Ticket Detail; read-only
  versions of both are added to Requester Ticket Detail. My Tickets, Ticket
  Queue, and User Management gain URL-driven filters and the new filter
  chips (Active, Resolved date, Follow-up pending, Open actions for).
- **Modes**: the Actions Taken section has list (view) mode, a create panel,
  and an edit panel that shows locked fields read-only (BR-09). Requester
  views are view-only. Dashboards are view-only with drill-down links.
- **Controls**: the Status control lists only permitted transitions
  (BR-16). Resolved is shown disabled, with the failed gate conditions
  spelled out, whenever the gate fails (BR-18). The server stays the
  authority.
- **Feedback**: every Lab 3 state convention, plus a conflict state for
  `409 STALE_UPDATE` that keeps the user's input and offers "Reload latest".
- **Role behavior**: navigation is Requester: Dashboard, My Tickets, Create
  Ticket; IT Staff: Dashboard, Ticket Queue; Administrator: Dashboard,
  Ticket Queue, User Management. The Dashboard is every role's landing
  screen.
- **Responsive**: Lab 2/3 breakpoints unchanged. Metric cards sit in 3
  columns on desktop, 2 on tablet, and 1 on mobile. The Actions Taken table
  becomes stacked cards on mobile. No horizontal page scroll at any width.

## 7. Data Changes

This section is the target design. It is applied to
`server/prisma/schema.prisma` by Issue #62, not by this specification.

### 7.1 Relationships

- One `Ticket` has many `ActionTaken` rows (1:N). Each `ActionTaken` has
  exactly one `Ticket` (BR-01).
- Each `ActionTaken` references two `User`s: `performedBy` (creator, BR-03)
  and `assignedTo` (BR-04).
- One `Ticket` has many `TicketStatusHistory` rows (1:N). Each row
  references the `User` who made the change.
- All Lab 1–3 tables keep every row and column. The only change to existing
  tables is two additive columns on `Ticket`.

### 7.2 Target Prisma Schema (additions and changes only)

```prisma
enum ActionStatus {
  PLANNED
  IN_PROGRESS
  DONE
  CANCELLED
}

// BR-01..14. Never deleted (BR-13); cancelled instead.
model ActionTaken {
  id               Int          @id @default(autoincrement())
  ticketId         Int
  ticket           Ticket       @relation(fields: [ticketId], references: [id], onDelete: Restrict)
  performedById    Int
  performedBy      User         @relation("ActionPerformedBy", fields: [performedById], references: [id], onDelete: Restrict)
  assignedToId     Int
  assignedTo       User         @relation("ActionAssignedTo", fields: [assignedToId], references: [id], onDelete: Restrict)
  actionAt         DateTime     @db.Timestamptz(3)
  description      String       @db.VarChar(2000)
  result           String?      @db.VarChar(2000)
  status           ActionStatus @default(PLANNED)
  followUpRequired Boolean      @default(false)
  followUpNote     String?      @db.VarChar(1000)
  attachmentNotes  String?      @db.VarChar(500)
  clientRequestId  String?      @db.Uuid
  version          Int          @default(1)
  createdAt        DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime     @updatedAt @db.Timestamptz(3)

  @@unique([performedById, clientRequestId])
  @@index([ticketId, actionAt, id])
  @@index([assignedToId, status])
  @@index([ticketId, status, followUpRequired])
}

// BR-22: append-only; no update or delete path exists.
model TicketStatusHistory {
  id          Int           @id @default(autoincrement())
  ticketId    Int
  ticket      Ticket        @relation(fields: [ticketId], references: [id], onDelete: Restrict)
  fromStatus  TicketStatus?
  toStatus    TicketStatus
  changedById Int
  changedBy   User          @relation(fields: [changedById], references: [id], onDelete: Restrict)
  changedAt   DateTime      @default(now()) @db.Timestamptz(3)

  @@index([ticketId, changedAt, id])
}

model Ticket {
  // ...every Lab 3 field unchanged, plus:
  version    Int       @default(1)       // BR-24
  resolvedAt DateTime? @db.Timestamptz(3) // BR-21

  actionsTaken  ActionTaken[]
  statusHistory TicketStatusHistory[]

  // Lab 3 indexes kept; added for dashboard queries:
  @@index([currentStatus, ownerId])
  @@index([currentStatus, itPriority])
  @@index([resolvedAt])
  @@index([requesterId, currentStatus])
  @@index([updatedAt])
}

model User {
  // ...every Lab 3 field unchanged, plus back-relations:
  actionsPerformed ActionTaken[]         @relation("ActionPerformedBy")
  actionsAssigned  ActionTaken[]         @relation("ActionAssignedTo")
  statusChanges    TicketStatusHistory[]
}
```

Database `CHECK` constraints added in raw SQL in the same migration (Prisma
cannot express them):

- `"followUpRequired" = false OR ("followUpNote" IS NOT NULL AND length(btrim("followUpNote")) > 0)` (BR-06)
- `"status" <> 'DONE' OR ("result" IS NOT NULL AND length(btrim("result")) > 0)` (BR-08)
- `length(btrim("description")) > 0` (BR-05)
- `"version" >= 1` on both `Ticket` and `ActionTaken`

Lab 3 timestamp columns stay `timestamp(3)` (UTC by convention). New
columns use `timestamptz(3)`. Both store a UTC instant, so comparisons
between them are exact.

### 7.3 Design Decisions and Justification

1. **Action Status is a Postgres enum, not a reference table.** The four
   values are fixed by BR-07, the resolution gate (BR-18) depends on them
   by name, and nobody edits them at run time. An enum keeps every gate and
   dashboard query a direct column comparison, with no join, and the
   database rejects any other value. This matches how `TicketStatus`,
   `UserRole`, and `CommentVisibility` are already modeled. A reference
   table would add a join to every gate check and a row an Administrator
   could edit into an inconsistent state, for no requirement in this lab.
2. **`resolvedAt` is a column on `Ticket`, not derived from status
   history.** "Resolved Today" (BR-50) and "Resolved (Last 30 Days)" (BR-42)
   need "when did this Ticket last become Resolved". Deriving that from
   `TicketStatusHistory` would take a per-Ticket "latest RESOLVED entry"
   subquery, and it would give no answer for legacy Tickets, which have no
   history (§7.4). One nullable indexed column, written in the same
   transaction as the status change (BR-21), turns both metrics into a
   simple range scan on `@@index([resolvedAt])` and can be backfilled for
   legacy data.
3. **An integer `version` column, not an `updatedAt` comparison, for
   optimistic concurrency.** `updatedAt` changes on activity that is not a
   conflicting edit (BR-27: an Action or comment refreshes it so dashboards
   see the activity). Using it as the concurrency token would make every
   comment invalidate every open status form. Millisecond timestamps can
   also collide, and they round-trip through JSON with time zone and
   precision risk. An integer that only workflow writes increment is exact
   and makes the BR-24/BR-25 meaning testable. The write is a conditional
   `UPDATE ... WHERE id = ? AND version = ?` checked for one affected row,
   inside the existing `withSerializableRetry` pattern.
4. **Composite and partial-purpose indexes match dashboard predicates.**
   Every staff metric filters on `currentStatus IN (active)` plus one other
   column (`ownerId`, `itPriority`), so `(currentStatus, ownerId)` and
   `(currentStatus, itPriority)` serve BR-46, BR-47, BR-49, and BR-52
   directly. `(assignedToId, status)` serves BR-45/BR-53.
   `(ticketId, status, followUpRequired)` serves both the gate (BR-18,
   always scoped to one Ticket) and BR-48. `(requesterId, currentStatus)`
   serves every Requester metric. `(ticketId, actionAt, id)` matches the
   BR-13 list order exactly, so listing needs no sort step.
5. **`onDelete: Restrict` on every new foreign key.** Actions Taken and
   status history are audit records, so deleting a Ticket or User must not
   silently delete them. Lab 3 already never deletes Users (deactivation
   only) or Tickets. Restrict turns an accidental delete into an error
   instead of a cascade. Test fixtures delete children first, as
   `server/AGENTS.md` already requires.
6. **Idempotency key scoped per user** (`@@unique([performedById,
   clientRequestId])`). This makes BR-14 a database guarantee rather than a
   read-then-insert race. Postgres treats `NULL`s as distinct in a unique
   index, so callers that send no key are unaffected.

### 7.4 Migration and Backfill

One forward migration, `server/prisma/migrations/<timestamp>_actions_taken_workflow/`,
generated by `pnpm prisma:migrate` and hand-extended with the raw SQL
below. It is purely additive, and no existing row is rewritten except by
the two backfills.

1. Create enum `ActionStatus`.
2. Add `Ticket.version INTEGER NOT NULL DEFAULT 1`. Every existing Ticket
   gets `version = 1` with no data rewrite needed.
3. Add `Ticket.resolvedAt TIMESTAMPTZ(3) NULL`. **Backfill:** for every
   Ticket whose `currentStatus` is `RESOLVED` or `CLOSED`, set `resolvedAt =
   "updatedAt"`. Lab 3 never recorded the resolution time, and `updatedAt`
   is the latest workflow write, which for these statuses is the closest
   available upper bound. Every other Ticket stays `NULL`. This is recorded
   as an approximation in §11-9.
4. Create `ActionTaken` and `TicketStatusHistory` with their foreign keys,
   indexes, and `CHECK` constraints (§7.2).
5. **No history backfill.** Lab 3 kept no record of past transitions, and
   inventing entries would put fabricated data in an append-only log. Legacy
   Tickets start with an empty history, and their next status change writes
   their first entry. The UI shows "History is recorded from
   6 Oct 2026 onward." when a Ticket has no entries (ui-spec.md §5.4).

**Legacy Tickets with zero Actions Taken:**

- They stay valid and visible everywhere. The Actions Taken section shows
  its empty state.
- Their current status is never changed by the migration. A legacy Ticket
  that is already Resolved or Closed stays that way. The gate (BR-18)
  applies only to a new transition into Resolved, so it is not applied
  retroactively.
- A legacy active Ticket must gain a Done Action before it can be resolved,
  like any other Ticket.
- Dashboards: legacy Tickets count in every Ticket-based metric under the
  same rules as new ones. They contribute nothing to Action-based metrics
  (BR-45, BR-48). A legacy Resolved or Closed Ticket counts in BR-42/BR-50
  according to its backfilled `resolvedAt`.

### 7.5 Rollback and Recovery

Prisma Migrate has no down migrations, so recovery is documented and
tested explicitly:

1. **Before migrating** any database that holds data worth keeping, take a
   dump: `pg_dump --format=custom` of the database (exact command in
   `README.md`). This is the recovery point for any failure.
2. **Failed forward migration**: the migration runs in one transaction, so a
   failure leaves the Lab 3 schema intact. Fix the cause, run
   `prisma migrate resolve --rolled-back <name>`, and re-run.
3. **Rollback after a successful migration**: run the committed script
   `server/prisma/rollback/<timestamp>_actions_taken_workflow.down.sql`.
   It drops `TicketStatusHistory`, `ActionTaken`, enum `ActionStatus`,
   `Ticket.resolvedAt`, `Ticket.version`, and the five new indexes, then
   deletes the migration's row from `_prisma_migrations`. Lab 1–3 rows and
   columns are not touched. Actions Taken and status history recorded after
   the migration are lost by design, so take a dump first (step 1) if they
   matter.
4. **Restore from dump** (`pg_restore --clean`) is the fallback if the
   rollback script cannot be applied.
5. The migration test (`server/tests/lab-04/migration.integration.test.ts`)
   proves, on a scratch database seeded with Lab 3-shaped rows: forward
   migration preserves every row, the backfill rules hold, the rollback
   script returns to a schema that Lab 3's migration test accepts with
   every Lab 3 row intact, and the forward migration re-applies cleanly
   afterward.

### 7.6 Seed Plan

`server/prisma/seed.ts` stays idempotent: every insert is an upsert or an
existence check, and running it twice produces identical rows and ids
(tested). Additions:

- **Actions Taken**, keyed for idempotency on (Ticket Number, description)
  and given a fixed `clientRequestId` per seed row:
  - At least 3 Tickets with **zero** Actions (including one active, one
    New, and the legacy-style case of a Closed Ticket whose `resolvedAt`
    is set but which has no Actions).
  - At least 3 Tickets with exactly **one** Action.
  - At least 3 Tickets with **several** Actions, performed by and assigned
    to different IT Staff on the same Ticket (BR-02 demo), mixing all four
    Action Statuses.
  - Every seeded Resolved or Closed Ticket (other than the legacy-style
    one above) has at least one Done Action and no open Action or pending
    follow-up, so the seed never contradicts the gate.
  - At least 2 active Tickets with a pending follow-up (BR-48 non-zero),
    and at least 1 active Ticket whose only Action is Planned (gate demo:
    `OPEN_ACTIONS`).
  - At least 1 Action assigned to the inactive IT Staff user (Linda Park),
    to show how an inactive assignee is displayed and that an edit not
    touching the assignee still saves (BR-04).
- **Ticket fields**: every Ticket gets `version = 1` on create (an update on
  rerun does not reset a version a demo has advanced). Resolved/Closed
  Tickets get `resolvedAt` relative to seed time, with at least one inside
  today's Asia/Bangkok day (BR-50 non-zero) and others spread over the past
  45 days, so BR-42's 30-day window both includes and excludes some.
- **Status history**: each seeded Ticket gets one entry
  (`fromStatus = null` → its seeded status, changed by its Owner or
  Requester) so the History section has content to demo. It is keyed on
  (ticket, toStatus, fromStatus) for idempotency.
- **Zero metrics**: Emma Watson (Requester, zero Tickets) shows the
  Requester empty state. Nattapong Srisuk (active IT Staff) owns Tickets
  but has no open assigned Actions, so his My Open Actions is `0`. Every
  status keeps at least one Ticket except where noted, so the BR-51
  breakdown shows non-zero values.
- **Administrator**: Alex Morgan owns at least one active Ticket and is
  assigned at least one Action (BR-29/BR-30 demo).
- All existing Lab 3 seed users, Tickets, and comments keep their content.

## 8. API Contract

Full detail is in [`api-spec.md`](./api-spec.md). New and changed endpoints:

| Method | Path | Purpose | Roles |
| --- | --- | --- | --- |
| GET | `/api/health` | API and database status (changed: adds DB probe, 503 on failure) | public |
| GET | `/api/staff/tickets/:id/actions` | List Actions Taken on a Ticket | IT Staff, Admin |
| POST | `/api/staff/tickets/:id/actions` | Create an Action Taken (idempotent with `clientRequestId`) | IT Staff, Admin |
| PATCH | `/api/staff/tickets/:id/actions/:actionId` | Update an Action Taken (`version` required) | IT Staff, Admin |
| GET | `/api/tickets/:id/actions` | Read Actions Taken on an owned Ticket | Requester |
| GET | `/api/tickets/:id/status-history` | Read status history of an owned Ticket | Requester |
| GET | `/api/staff/tickets/:id/status-history` | Read status history of any Ticket | IT Staff, Admin |
| GET | `/api/dashboard/requester` | Requester Dashboard | Requester |
| GET | `/api/dashboard/staff` | IT Staff Dashboard (+ user counts for Admin) | IT Staff, Admin |
| PATCH | `/api/staff/tickets/:id/status` | Changed: requires `version`; resolution gate; history; `resolvedAt` | IT Staff, Admin |
| PATCH | `/api/staff/tickets/:id/claim`, `/owner`, `/priority` | Changed: require `version`; Admin allowed; Admin may be Owner | IT Staff, Admin |
| GET | `/api/staff/tickets`, `/api/staff/tickets/:id`, `/api/staff/it-staff-users`, `POST /api/staff/tickets/:id/comments` | Changed: Admin allowed. Queue gains filters `statusGroup`, `resolvedFrom`, `resolvedTo`, `followUp`, `openActionAssigneeId`. Detail gains `version`, `resolvedAt`, `resolutionGate`. Assignable-user list includes Administrators. | IT Staff, Admin |
| GET | `/api/tickets` | Changed: gains `statusGroup`, `resolvedFrom` filters and `updatedAt` sort | Requester |
| POST | `/api/tickets` | Changed: also writes the initial status history entry | Requester |

New error codes: `STALE_UPDATE` (409), `RESOLUTION_BLOCKED` (409),
`INVALID_ACTION_TRANSITION` (409), `ACTION_LOCKED` (409),
`TICKET_NOT_ACTIONABLE` (409), `INVALID_ASSIGNEE` (400). The error envelope
gains an optional `details` object. Every other Lab 2/3 endpoint is
unchanged.

## 9. Acceptance Criteria

| ID | Criterion |
| --- | --- |
| AC-01 | Given a permitted IT Staff user or Administrator and valid data, when an Action Taken is created, then it is saved under the correct Ticket with Performed By set to the authenticated creator and Assigned To set to the approved active assignee (or the creator when none is given). |
| AC-02 | Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent Tickets owned by that Requester are returned. |
| AC-03 | Given a create or update request whose body names a different `performedById`, when it is processed, then Performed By is still the authenticated creator and never changes. |
| AC-04 | Given Follow-Up Required is true and Follow-Up Note is empty or whitespace, when the Action is saved, then it is rejected with a field-level error on Follow-Up Note and nothing is saved. |
| AC-05 | Given an assignee who is inactive, a Requester, or nonexistent, when an Action is created or reassigned to them, then the request is rejected with `INVALID_ASSIGNEE` and nothing changes. |
| AC-06 | Given a Requester, when they call any Action create or update endpoint, then the request is rejected as forbidden; and when they read Actions on a Ticket they don't own, then the response is not found. |
| AC-07 | Given a Requester viewing their own Ticket, when the detail loads, then every Action Taken with all fields is shown read-only and no create or edit control exists. |
| AC-08 | Given two users who loaded the same Action, when the second saves after the first with the old version, then the second save is rejected with `STALE_UPDATE`, the first user's values remain, and the second user's input stays in the form. |
| AC-09 | Given an Action with an empty Result, when it is set to Done, then the request is rejected with a field-level error on Result. |
| AC-10 | Given a Cancelled Action, when any field change is submitted, then it is rejected with `ACTION_LOCKED` and the Action is unchanged. |
| AC-11 | Given a Done Action with a pending follow-up, when Follow-Up Required is set to false, then the change is saved; and when its Description is changed, then it is rejected with `ACTION_LOCKED`. |
| AC-12 | Given a Ticket that is Resolved, Closed, or Cancelled, when an Action create or update is attempted, then it is rejected with `TICKET_NOT_ACTIONABLE`. |
| AC-13 | Given the same create request sent twice with one `clientRequestId`, when both are processed, then exactly one Action exists and both responses carry its id. |
| AC-14 | Given a Ticket owned by IT Staff member A, when member B and an Administrator each record an Action on it, then the Ticket shows Actions performed by different people and the Ticket Owner is still A. |
| AC-15 | Given Actions with equal and unequal Action Date/Times, when the list is retrieved repeatedly, then it is ordered by Action Date/Time ascending, then id ascending, every time. |
| AC-16 | Given an In Progress Ticket with no Actions, when an IT Staff user, using the UI or calling the API directly, sets it to Resolved, then it is rejected with `RESOLUTION_BLOCKED` reason `NO_DONE_ACTION` and the status is unchanged. |
| AC-17 | Given a Ticket with one Done Action and one Planned Action, when it is set to Resolved, then it is rejected with reason `OPEN_ACTIONS`. |
| AC-18 | Given a Ticket whose only Done Action has Follow-Up Required true, when it is set to Resolved, then it is rejected with reason `PENDING_FOLLOW_UPS`. |
| AC-19 | Given a Ticket that satisfies the resolution gate, when it is set to Resolved, then the status changes, `resolvedAt` is set, `version` increments, and one status history entry is appended. |
| AC-20 | Given a Requester who marks "Problem Appears Resolved", when the Ticket is read, then its Current Status is unchanged and the resolution gate result is unchanged. |
| AC-21 | Given each of the 64 status pairs, when IT Staff requests the transition, then exactly the 17 matrix transitions are permitted (Resolved only when the gate passes) and every other pair is rejected with the status unchanged. |
| AC-22 | Given a Requester, when they call the status endpoint for any Ticket, then it is rejected as forbidden. |
| AC-23 | Given two IT Staff users holding the same Ticket version, when both change its status, then the first succeeds and the second receives `STALE_UPDATE` with the current status, and the first change is preserved. |
| AC-24 | Given a Ticket that changes status several times, when its history is read, then it holds exactly one entry per change in changed-at order, and no endpoint can edit or delete an entry. |
| AC-25 | Given a Resolved Ticket, when it is Reopened, then `resolvedAt` is cleared, and resolving it again requires the gate to pass again. |
| AC-26 | Given an Administrator, when they use the Ticket Queue, claim a Ticket, change its status, post a note, and record an Action, then every operation succeeds as it would for IT Staff. |
| AC-27 | Given the IT Staff Ticket Detail, when the Status control is opened, then only permitted transitions are offered; Resolved is disabled with the failed gate conditions listed when the gate fails; and after a successful change the Ticket summary status badge and history refresh without a page reload. |
| AC-28 | Given the seeded database, when the IT Staff Dashboard is retrieved, then every metric equals the result of its BR-45–BR-55 definition run directly against the database. |
| AC-29 | Given Tickets resolved at 16:59:59 UTC and 17:00:00 UTC on the same UTC date, when "Resolved Today" is calculated, then they fall on different Asia/Bangkok days. |
| AC-30 | Given a dashboard card, when its drill-down link is followed, then the destination list opens with the documented filters applied and its total matches the card value (except BR-45, whose list counts Tickets). |
| AC-31 | Given a metric with no matching records, when the dashboard renders, then the card shows `0` with its empty helper text; and given a Requester with no Tickets at all, then the dashboard shows the empty state with a Create Ticket action. |
| AC-32 | Given a Requester calling the staff dashboard, or an IT Staff user calling the Requester dashboard, when the request is made, then it is rejected as forbidden and no metric is returned. |
| AC-33 | Given an Administrator, when the staff dashboard is retrieved, then it includes user-account counts by role and active state; given IT Staff, then that section is absent. |
| AC-34 | Given a dashboard that is loading, fails, or is reached by the wrong role, when it renders, then the skeleton, safe error with Retry, or forbidden state is shown respectively. |
| AC-35 | Given any dashboard response, when it is inspected, then it contains only counts and lists of at most 5 items, not full collections. |
| AC-36 | Given each role, when the user logs in, then they land on the Dashboard, the navigation shows that role's permitted items including Dashboard, and the active page is indicated without relying on color alone. |
| AC-37 | Given a browser set to a non-Bangkok time zone, when any date/time is displayed, then it shows the Asia/Bangkok time. |
| AC-38 | Given a Lab 3 database, when the Lab 4 migration runs, then every Lab 1–3 row is preserved, every Ticket has `version` 1 and zero Actions, and `resolvedAt` is backfilled only for Resolved and Closed Tickets. |
| AC-39 | Given a migrated database, when the rollback script runs and the migration is re-applied, then every Lab 1–3 row survives both steps. |
| AC-40 | Given the seed is run twice, when the data is inspected, then there are no duplicates, and Tickets with zero, one, and multiple Actions plus zero and non-zero dashboard metrics exist. |
| AC-41 | Given desktop, tablet, and mobile viewports, when both dashboards and both Ticket Detail screens with Actions Taken are shown, then there is no horizontal scrolling, clipping, or overlapping control. |
| AC-42 | Given keyboard-only use, when a user tabs through a dashboard and the Actions Taken panel, then every drill-down link and control is reachable with a visible focus and an accessible name, focus moves into the Actions Taken form when it opens, and focus returns to its trigger when it closes. |
| AC-43 | Given the complete Lab 1–3 automated suites, when they run against the Lab 4 build, then they pass, changed only where this contract explicitly supersedes an earlier rule (§11). |
| AC-44 | Given an Action or status form, when the save fails with a validation error, conflict, network error, or server error, then the user's entered values remain in the form. |
| AC-45 | Given the database is unreachable, when `/api/health` is called, then it returns 503 with a safe body and no internal error detail; given it is reachable, then it returns 200 with database status ok. |
| AC-46 | Given a Ticket workflow write (claim, reassign, priority, status) without a `version`, when it is sent, then it is rejected with a field-level `version` error and nothing changes. |
| AC-47 | Given a Requester on My Tickets or IT Staff on the Ticket Queue, when the page is opened from a URL carrying filters, then those filters are applied and shown as chips, and changing a filter updates the URL. |

## 10. Definition of Done

### Product Completion

The coding agent checks this list for every Lab 4 issue that touches the
product, and the release PR checks all of it.

- [ ] All scoped screens implemented: Requester Dashboard, IT Staff
      Dashboard (with Administrator user counts), Actions Taken and Status
      History on IT Staff Ticket Detail, read-only Actions Taken and Status
      History on Requester Ticket Detail, URL-driven filters on My Tickets,
      Ticket Queue, and User Management, updated navigation and landing
- [ ] Every acceptance criterion AC-01–AC-47 has passing, traceable
      automated test evidence in `tests.md`, with its final status set
- [ ] No required test is skipped, disabled, `.only`-filtered, or
      commented out
- [ ] Every Lab 1–3 automated test passes against the Lab 4 build; each
      Lab 3 test changed because of a §11 supersession is listed in
      `tests.md` with the rule that changed it
- [ ] Every write endpoint has a direct API test for each role that must
      be rejected, independent of the UI
- [ ] The resolution gate is proven by direct API calls that bypass the UI,
      one per failure reason and one for success
- [ ] All 64 status pairs are covered: the 17 permitted transitions pass
      (with the gate satisfied where needed) and the other 47 are rejected
- [ ] Stale-update handling is proven for Ticket status, ownership,
      priority, and Action update, and duplicate creation is proven safe
- [ ] Every dashboard metric has a test comparing it to a direct database
      query on the same fixture data, including a zero case and an Asia/Bangkok
      day-boundary case
- [ ] Every drill-down link is tested to produce the documented URL, and
      the destination screen applies those filters
- [ ] Implemented screens and APIs match `ui-spec.md` and `api-spec.md`;
      any deviation is recorded in this document's §11 before merge
- [ ] Zen Green tokens and components are reused. New styles are added
      to `client/src/zen-green.css` as `.zg-*` rules, with no inline color
      values
- [ ] Loading, validation, success, empty, no-results, forbidden,
      conflict, not-found, and safe-failure states are implemented and
      tested on every screen that calls the API
- [ ] Desktop, tablet, and mobile screenshots exist for every major Lab 4
      screen under `artifacts/lab-04/screenshots/`, each backed by an
      automated no-horizontal-scroll assertion
- [ ] Keyboard focus is visible, every control has an accessible name,
      status and priority are never conveyed by color alone, and the
      Actions Taken form moves focus in on open and back to its trigger on
      close
- [ ] No console errors or warnings during the E2E suite; no broken
      links, placeholder text, or unfinished controls remain
- [ ] The migration runs cleanly on a Lab 3 database; the rollback script
      and re-apply are tested; the seed is idempotent and tested
- [ ] Every date/time in the UI goes through the shared Asia/Bangkok
      formatter, and none is formatted with the browser's default zone
- [ ] `pnpm exec oxlint --deny-warnings` and `oxfmt` are clean
- [ ] `README.md` setup, migration, rollback, seed, test, and demo
      instructions are current, re-verified against a fresh clone
- [ ] All required tests pass from documented commands on the final `main`
      branch

### Course Delivery Requirements (checked separately from Product Completion)

- [ ] Work delivered via GitHub Issues and feature branches into
      `lab4-staging`, then one release Pull Request into `main`
- [ ] Every Issue on the project board is in Done
- [ ] Peer review completed and recorded in `reviewer.md` for every Pull
      Request, with comments, responses, and approvals
- [ ] Required repository documents present in `docs/lab-04/`:
      `specification.md`, `tests.md`, `ui-spec.md`, `api-spec.md`,
      `reviewer.md`, `ai-use.md`
- [ ] This contract merged into `lab4-staging` before any implementation PR

## 11. Assumptions and Decisions

Each item is a choice the handout left open. **(structural)** items shape the
schema or API and are costly to change after Issue #62 starts;
**(reversible)** items are cheap to change.

1. **(structural) Actions Taken carry an assignee and a four-value status.**
   The stakeholder's field list has neither, but handout AC-01 requires an
   "approved assignee" and grading Part 6 demonstrates assign, complete,
   cancel, and inactive-assignee rejection. Assigned To (BR-04) and
   Planned/In Progress/Done/Cancelled (BR-07) are the smallest additions
   that make those observable. Performed By stays the automatic creator
   field the stakeholder asked for. Confirmed with the product owner on
   6 Oct 2026.
2. **(structural) Resolution gate = at least one Done Action, no open
   Action, no pending follow-up** (BR-18). A gate that only checked "at
   least one non-cancelled Action" would let a Ticket be resolved while
   its only Action is still Planned. Confirmed with the product owner.
3. **(structural) Administrator has full IT Staff Ticket parity**
   (BR-29, BR-30). Handout §4.3 says the Administrator "performs IT Staff
   behavior". This supersedes Lab 3 BR-40 and §12-7, where the
   Administrator could only read Ticket Detail through the API. Lab 3
   AC-37 (Administrator rejected from the Queue and Ticket mutations) is
   **superseded**. The Lab 3 tests that asserted it (API-20, API-22,
   API-81, UI-39, and the Administrator rows of SEC-01) are rewritten to
   assert access, as listed in `tests.md` §6. Confirmed with the product
   owner.
4. **(structural) Only IT Staff and Administrators change status.** The
   Requester gets no cancel or reopen action, so the Lab 3 matrix is kept
   and only the roles and the gate are added. Confirmed with the product
   owner.
5. **(structural) Optimistic concurrency on every Ticket workflow write and
   every Action update** (BR-24, BR-25), using an integer `version` (§7.3-3).
   Claim, reassign, and priority changes, which were last-write-wins in
   Lab 3, now also require `version`. The Lab 3 tests that call them
   without one are updated to send it. Confirmed with the product owner.
6. **(reversible) Requesters see every Action field**, including Follow-Up
   Note and Attachment Notes, per handout §8.3 ("Requesters will see all
   Actions Taken items"). Staff-only text belongs in Internal Notes, and the
   Actions Taken form says so (ui-spec.md §5.2). Confirmed with the product
   owner.
7. **(reversible) The IT Staff Dashboard has six cards, two breakdowns, and
   two lists** (BR-45–BR-54), covering the handout §4.6 examples plus
   grading Part 5's "current-user Actions Taken" and "recent or urgent
   Tickets". "Urgent" means active High IT Priority (BR-49), since the
   product has no SLA concept (handout §4.2). Confirmed with the product
   owner.
8. **(reversible) The Dashboard becomes every role's landing screen and has
   one route, `/dashboard`, that renders by role.** Lab 3 ui-spec §2 landed
   Requesters on My Tickets, IT Staff on the Queue, and Administrators on
   User Management. The Lab 3 tests that assert the landing path or the
   navigation item list (UI-02, UI-12, UI-17, UI-18, UI-52, E2E-01,
   E2E-02) are updated to expect `/dashboard` and the new item sets
   (`tests.md` §6).
9. **(reversible) Legacy `resolvedAt` is backfilled from `updatedAt`** for
   Tickets already Resolved or Closed (§7.4). It is an approximation, as
   the true resolution time was never stored. It matters only to the
   time-windowed metrics BR-42/BR-50 and only for pre-Lab-4 rows.
10. **(reversible) Activity refreshes `Ticket.updatedAt` without bumping
    `version`** (BR-27). Without this, a Ticket with a new Action or comment
    would not appear in "Recently Updated". Lab 3 comment posting did not
    touch `updatedAt`. This changes when `updatedAt` moves, not any Lab 3
    response shape.
11. **(reversible) Actions on non-active Tickets are read-only** (BR-10). A
    Resolved Ticket gaining a new Planned Action would contradict the gate
    that allowed the resolution. Reopening first keeps the history honest.
12. **(reversible) Done Actions keep their follow-up fields editable**
    (BR-09). Otherwise a Done Action with a follow-up would block the gate
    forever. Recording that the follow-up was handled is a new fact, not a
    rewrite of finished work.
13. **(reversible) Drill-down uses new URL query filters** (`statusGroup`,
    `resolvedFrom`, `resolvedTo`, `followUp`, `openActionAssigneeId`) on
    the existing list endpoints, not dashboard-specific list endpoints. Each
    destination stays the screen users already know, and BR-38 can be
    tested by comparing the card value with the list's `totalCount`. Lab 3
    screens kept filters in component state only, so FR-16 moves them into
    the URL.
14. **(reversible) The Lab 1 `/system-check` screen and `CategoryList`
    component are kept.** They look like leftovers but are required by Lab 1
    acceptance tests (`client/tests/lab-01/*`). They stay off the navigation,
    as they are today. FR-24 applies to everything else.
15. **(reversible) `GET /api/staff/it-staff-users` keeps its path** but now
    returns active IT Staff and Administrators, each with `role`, because
    Owner and assignee may be either role (BR-30). Renaming the path would
    break Lab 3 clients for no functional gain.
16. **(reversible) Status history is visible to the Requester** on their
    own Ticket, with the changer's name and role. It holds only status
    values and names, nothing staff-private, and grading Part 7 asks for
    role-appropriate visibility of the workflow.
17. **(reversible) Action Date/Time may be in the future only while the
    Action is Planned or In Progress** (BR-08), so planned work can be
    scheduled. A Done Action must have happened. The 5-minute tolerance
    absorbs clock skew between client and server.
18. **(reversible) Dashboards refresh only on load and on an explicit
    Refresh button.** There is no polling or push (§3 Excluded). Each
    response carries `generatedAt`, shown as "Updated 14:05".
19. **(reversible) Lab 4 adds an automated accessibility scan**
    (`@axe-core/playwright`, a dev dependency of the E2E suite only). Lab 2
    and Lab 3 relied on label queries alone, but the handout's final
    hardening and grading Part 9 ask for accessibility evidence across
    every major screen. A scan per screen is the cheapest repeatable proof.
