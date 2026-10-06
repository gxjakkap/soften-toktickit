# Lab 4 API Contract

All endpoints are relative to the existing Express app (`server/src/app.ts`).
This document is normative for `tests.md`'s API-level tests; anything that
disagrees with `specification.md` is a bug in one of the two documents and
must be flagged rather than resolved silently. It extends
`docs/lab-03/api-spec.md`, which stays normative for every endpoint not
listed here.

## 0. Conventions

### 0.1 Authentication and authorization

Unchanged from Lab 3 §0.1: the `tik_session` httpOnly cookie, resolved
once per request by `requireAuth` (`server/src/lib/authorization.ts`), then
`requireRole(...)`. Identity always comes from `req.user`, never from the
request body or query.

- **Role rule**: wrong role → `403 FORBIDDEN`.
- **Ownership rule** (Requester endpoints only): a Ticket the caller does
  not own is indistinguishable from a nonexistent one → `404 NOT_FOUND`.
- **Staff endpoints** (`/api/staff/*`) accept `IT_STAFF` **and**
  `ADMINISTRATOR` in Lab 4 (specification.md BR-29). This supersedes Lab 3
  §4's "`IT_STAFF` only, except §4.2".
- The password-change gate (Lab 3 §1.5) still applies to every endpoint
  below.

### 0.2 Error envelope (extended)

```json
{
  "error": {
    "code": "STALE_UPDATE",
    "message": "This ticket was changed by someone else. Reload to see the latest version.",
    "field": "version",
    "details": { "current": { "id": 101, "version": 4, "currentStatus": "WAITING_FOR_REQUESTER" } }
  }
}
```

`field` and `details` are optional. `details` is new in Lab 4 and is used
only by `STALE_UPDATE` (`details.current`) and `RESOLUTION_BLOCKED`
(`details.reasons`). `message` is always safe to display. A `500` response
is always `{ "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again." } }`
with no stack trace, SQL, or Prisma detail.

### 0.3 Status codes added or reused in Lab 4

| Status | Lab 4 meaning |
| --- | --- |
| 200 | Retrieval; update; idempotent replay of a create (BR-14). |
| 201 | Action Taken created. |
| 400 | `VALIDATION_ERROR` (including missing `version`), `INVALID_ASSIGNEE`, `INVALID_FILTER`. |
| 403 | Wrong role. |
| 404 | Ticket or Action not found, or Ticket not owned (Requester endpoints), or Action not on that Ticket. |
| 409 | `STALE_UPDATE`, `INVALID_TRANSITION`, `RESOLUTION_BLOCKED`, `INVALID_ACTION_TRANSITION`, `ACTION_LOCKED`, `TICKET_NOT_ACTIONABLE`, plus Lab 3's `ALREADY_OWNED`. |
| 503 | Health check: database unreachable. |

### 0.4 Check order

Every write handler validates in this order and stops at the first failure,
so a test can reach each case deterministically:

1. `401` / `403` (guards)
2. `400` body validation that needs no database read
3. `404` resource lookup
4. Action create only: `clientRequestId` replay. If this caller already
   created an Action with the same key, return it with `200` and stop
   (specification.md BR-14). This comes before every state rule, so a retry
   whose first attempt was saved never gets a `409`, even if the Ticket was
   resolved in between.
5. `409 STALE_UPDATE` (version)
6. `409` state rules (`TICKET_NOT_ACTIONABLE`, `ACTION_LOCKED`,
   `INVALID_ACTION_TRANSITION`, `INVALID_TRANSITION`, `RESOLUTION_BLOCKED`)
7. `400` validation that needs database state (`INVALID_ASSIGNEE`, Action
   Date/Time not before the Ticket's creation minute, Result required for
   Done)

Steps 3–7 and the write run inside one `withSerializableRetry`
transaction.

### 0.5 Shared shapes

**ActionTaken**:

```json
{
  "id": 5001,
  "ticketId": 101,
  "actionAt": "2026-10-06T03:30:00.000Z",
  "description": "Replaced the laptop battery with a vendor-supplied unit.",
  "result": "Battery holds charge for 6+ hours under normal load.",
  "status": "DONE",
  "performedBy": { "id": 3, "name": "Sarah Johnson", "role": "IT_STAFF" },
  "assignedTo": { "id": 9, "name": "Ahmed Hassan", "role": "IT_STAFF", "isActive": true },
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": "See battery-diagnostic.pdf in the Ticket attachments.",
  "version": 3,
  "createdAt": "2026-10-06T03:31:12.000Z",
  "updatedAt": "2026-10-06T04:02:40.000Z"
}
```

`clientRequestId` is never returned. `assignedTo.isActive` lets the UI mark
an inactive assignee (specification.md BR-04).

**StatusHistoryEntry**:

```json
{
  "id": 7001,
  "fromStatus": "IN_PROGRESS",
  "toStatus": "RESOLVED",
  "changedBy": { "id": 3, "name": "Sarah Johnson", "role": "IT_STAFF" },
  "changedAt": "2026-10-06T04:05:00.000Z"
}
```

`fromStatus` is `null` only on the creation entry, whose `toStatus` is
always `NEW`. Seeded history follows the same rule (specification.md §7.6).

**TicketWorkflowState**, returned by every Ticket workflow write and in
`details.current` of a Ticket `STALE_UPDATE`:

```json
{
  "id": 101,
  "version": 5,
  "currentStatus": "RESOLVED",
  "resolvedAt": "2026-10-06T04:05:00.000Z",
  "ownerId": 3,
  "ownerName": "Sarah Johnson",
  "itPriority": "HIGH",
  "updatedAt": "2026-10-06T04:05:00.000Z"
}
```

All timestamps are ISO 8601 UTC with `Z` (BR-32).

---

## 1. Health

### 1.1 `GET /api/health` (changed)

Public, no session. It now probes the database with `SELECT 1` and a
2-second timeout (FR-22).

**200**: `{ "status": "ok", "service": "TokTickIT API", "database": "ok" }`

**503**: `{ "status": "degraded", "service": "TokTickIT API", "database": "unreachable" }`

No error text from the driver is included. The Lab 1 health test's
assertions on `status` and `service` still hold for the 200 case.

---

## 2. Actions Taken

### 2.1 `GET /api/staff/tickets/:id/actions`

`IT_STAFF`, `ADMINISTRATOR`. Lists every Action on the Ticket, Cancelled
ones included (BR-13).

**200**: `{ "data": [ActionTaken, ...] }`, ordered `actionAt asc, id asc`.
An empty Ticket returns `{ "data": [] }`.

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller is a Requester. |
| 404 | `NOT_FOUND` | Ticket id doesn't exist or isn't an integer. |

### 2.2 `POST /api/staff/tickets/:id/actions`

`IT_STAFF`, `ADMINISTRATOR`. Creates an Action (FR-01, BR-01–BR-11, BR-14).

**Request body:**

```json
{
  "clientRequestId": "6f1c2a8e-3b7d-4f4e-9a51-2c0d7b9e8f10",
  "actionAt": "2026-10-06T03:30:00.000Z",
  "description": "Replaced the laptop battery with a vendor-supplied unit.",
  "result": "",
  "status": "PLANNED",
  "assignedToId": 9,
  "followUpRequired": false,
  "followUpNote": null,
  "attachmentNotes": ""
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `clientRequestId` | no | UUID string; idempotency key (BR-14). Non-UUID → `400`. |
| `actionAt` | yes | ISO 8601 with offset or `Z` (BR-32); not before the Ticket's `createdAt` truncated to the minute (BR-05), so a Ticket created at 10:00:30 accepts 10:00:00 and rejects 09:59:59; if `status` is `DONE`, not more than 5 minutes after server time (BR-08). |
| `description` | yes | 1–2000 chars after trim. |
| `result` | no | 0–2000 chars after trim; required (non-empty) when `status` is `DONE`. |
| `status` | no | `PLANNED` (default), `IN_PROGRESS`, or `DONE`. `CANCELLED` is not accepted on create (`400`). |
| `assignedToId` | no | Active `IT_STAFF`/`ADMINISTRATOR` user id; defaults to the caller (BR-04). |
| `followUpRequired` | no | boolean, default `false`. |
| `followUpNote` | conditional | 1–1000 chars after trim when `followUpRequired` is `true`; ignored and stored `null` otherwise (BR-06). |
| `attachmentNotes` | no | 0–500 chars after trim. |
| `performedById`, `performedBy`, `ticketId`, `version` | — | Ignored if sent (BR-01, BR-03). |

**201**: the created `ActionTaken`. The Ticket's `updatedAt` is set to now;
its `version` is unchanged (BR-25, BR-27).

**200** (idempotent replay): if this caller already created an Action with
the same `clientRequestId`, that Action is returned unchanged. The new body
is not re-validated or applied, and no state rule runs (§0.4 step 4), so
the replay succeeds even if the Ticket is no longer active. If the earlier Action belongs to a different
Ticket than `:id`, the response is `400 VALIDATION_ERROR`,
`field: "clientRequestId"` ("This request id was already used for another
ticket.").

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller is a Requester. |
| 400 | `VALIDATION_ERROR` | Any field rule above; `field` names it. |
| 404 | `NOT_FOUND` | Ticket doesn't exist. |
| 409 | `TICKET_NOT_ACTIONABLE` | Ticket status is `RESOLVED`, `CLOSED`, or `CANCELLED` (BR-10). |
| 400 | `INVALID_ASSIGNEE` | `assignedToId` is not an active `IT_STAFF`/`ADMINISTRATOR` user. `field: "assignedToId"`. |

### 2.3 `PATCH /api/staff/tickets/:id/actions/:actionId`

`IT_STAFF`, `ADMINISTRATOR`. Updates an Action (FR-03, BR-04–BR-11,
BR-25).

**Request body:** `version` plus any subset of `actionAt`, `description`,
`result`, `status`, `assignedToId`, `followUpRequired`, `followUpNote`,
`attachmentNotes`. Field rules match §2.2, applied to the resulting
record. For example, setting `status: "DONE"` requires the stored or sent
`result` to be non-empty.

```json
{ "version": 2, "status": "DONE", "result": "Battery holds charge for 6+ hours." }
```

Only supplied fields change. A body with `version` alone, or one whose
values all equal the stored ones, is a no-op: it still checks `version`,
does not increment it, and returns `200` with the current record.

**Editable fields by current Action status** (BR-09):

| Current status | Editable |
| --- | --- |
| `PLANNED`, `IN_PROGRESS` | all listed fields |
| `DONE` | `followUpRequired`, `followUpNote`, `attachmentNotes` |
| `CANCELLED` | none |

Sending a locked field with a value equal to the stored one is not an
error. Sending it with a different value is `409 ACTION_LOCKED`.

**Status changes** (BR-07): `PLANNED → IN_PROGRESS | DONE | CANCELLED`,
`IN_PROGRESS → PLANNED | DONE | CANCELLED`. `DONE` and `CANCELLED` are
final.

**200**: the updated `ActionTaken` with `version` incremented by 1. The
Ticket's `updatedAt` is set to now; its `version` is unchanged.

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller is a Requester. |
| 400 | `VALIDATION_ERROR` | Missing/non-integer `version`, or a field rule; `field` names it. |
| 404 | `NOT_FOUND` | Ticket or Action doesn't exist, or the Action belongs to a different Ticket. |
| 409 | `STALE_UPDATE` | `version` ≠ stored; `details.current` is the stored `ActionTaken`. |
| 409 | `TICKET_NOT_ACTIONABLE` | Ticket status is not active (BR-10). |
| 409 | `ACTION_LOCKED` | A locked field would change (BR-09); `field` names the first one. |
| 409 | `INVALID_ACTION_TRANSITION` | Status change not permitted (BR-07). |
| 400 | `INVALID_ASSIGNEE` | New `assignedToId` not an active `IT_STAFF`/`ADMINISTRATOR`. |

No `DELETE` endpoint exists (BR-13).

### 2.4 `GET /api/tickets/:id/actions`

`REQUESTER` only. Read-only Actions on an owned Ticket (FR-05, BR-12).

**200**: `{ "data": [ActionTaken, ...] }`, same shape and order as §2.1,
with every field present (specification.md §11-6).

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller is not a Requester. |
| 404 | `NOT_FOUND` | Ticket doesn't exist or isn't owned by the caller. |

No `POST`/`PATCH` exists under `/api/tickets/:id/actions`. Express answers
those with `404`, and the authorization matrix test asserts that the
Requester cannot write by any path.

---

## 3. Ticket Workflow (changed Lab 3 endpoints)

Each endpoint in this section now:

- accepts `IT_STAFF` and `ADMINISTRATOR`;
- requires `version` in the body (BR-24; missing → `400 VALIDATION_ERROR`,
  `field: "version"`);
- returns `409 STALE_UPDATE` with `details.current` = `TicketWorkflowState`
  on mismatch;
- returns `TicketWorkflowState` on success, with `version` incremented.
  Lab 3's narrower `200` shapes (`{id, ownerId, ownerName}` and the rest)
  are a subset of it, so Lab 3 field assertions still hold.

### 3.1 `PATCH /api/staff/tickets/:id/claim`

**Body:** `{ "version": 3 }`. Rules unchanged from Lab 3 §4.3 (BR-19
`ALREADY_OWNED`). The caller may be an Administrator (BR-30). A no-op claim
(already owned by the caller) still checks `version` but does **not**
increment it.

### 3.2 `PATCH /api/staff/tickets/:id/owner`

**Body:** `{ "version": 3, "ownerId": 9 }`. `ownerId` is any active
`IT_STAFF` or `ADMINISTRATOR` id, or `null` (BR-30). Otherwise
`400 INVALID_OWNER` as in Lab 3.

### 3.3 `PATCH /api/staff/tickets/:id/priority`

**Body:** `{ "version": 3, "itPriority": "HIGH" }`. Rules unchanged from
Lab 3 §4.5.

### 3.4 `PATCH /api/staff/tickets/:id/status`

**Body:** `{ "version": 3, "status": "RESOLVED" }`

In one Serializable transaction (BR-19):

1. Load the Ticket → `404` if missing.
2. Compare `version` → `409 STALE_UPDATE`.
3. `canTransition(from, to)` (`server/src/lib/ticket-status.ts`, matrix
   unchanged) → `409 INVALID_TRANSITION`.
4. If `to` is `RESOLVED`, evaluate the gate (BR-18) over the Ticket's
   Actions → `409 RESOLUTION_BLOCKED`.
5. Update `currentStatus`, `version + 1`, and `resolvedAt` (set on
   `RESOLVED`, kept on `CLOSED`, cleared on `REOPENED`, BR-21).
6. Insert one `TicketStatusHistory` row (`fromStatus`, `toStatus`,
   `changedById` = caller).

**200**: `TicketWorkflowState`.

**409 `RESOLUTION_BLOCKED`:**

```json
{
  "error": {
    "code": "RESOLUTION_BLOCKED",
    "message": "This ticket can't be resolved yet: it has open actions and a pending follow-up.",
    "details": { "reasons": ["OPEN_ACTIONS", "PENDING_FOLLOW_UPS"] }
  }
}
```

`reasons` lists every failed condition in the fixed order `NO_DONE_ACTION`,
`OPEN_ACTIONS`, `PENDING_FOLLOW_UPS`.

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller is a Requester (BR-17). |
| 400 | `VALIDATION_ERROR` | `status` unrecognized, or `version` missing/non-integer. |
| 404 | `NOT_FOUND` | Ticket doesn't exist. |
| 409 | `STALE_UPDATE` | Version mismatch. |
| 409 | `INVALID_TRANSITION` | Not in the matrix, including same-status. |
| 409 | `RESOLUTION_BLOCKED` | Gate failed. |

### 3.5 `GET /api/staff/tickets/:id` (changed)

Admin allowed (unchanged from Lab 3). The response adds:

```json
{
  "version": 3,
  "resolvedAt": null,
  "resolutionGate": { "canResolve": false, "reasons": ["NO_DONE_ACTION"] }
}
```

`resolutionGate` is computed with the same function the status endpoint
uses. It is advisory for the UI only, since the status endpoint re-checks
it (BR-19). Actions and history are **not** embedded. The client loads
them through §2.1 and §3.6.

### 3.6 Status history

- `GET /api/staff/tickets/:id/status-history`: `IT_STAFF`,
  `ADMINISTRATOR`; any Ticket.
- `GET /api/tickets/:id/status-history`: `REQUESTER`; owned Ticket only
  (`404` otherwise).

**200**: `{ "data": [StatusHistoryEntry, ...] }`, ordered
`changedAt asc, id asc`. A legacy Ticket returns `{ "data": [] }`.

No write endpoint exists for history (BR-22).

### 3.7 `POST /api/tickets` (changed)

Unchanged request and response (Lab 3 §3.1). The Ticket insert and one
`TicketStatusHistory` row (`fromStatus: null`, `toStatus: NEW`,
`changedById` = the Requester) are written in the same transaction, and
the new Ticket has `version: 1`.

### 3.8 Comments (changed side effect only)

`POST /api/tickets/:id/comments` and `POST /api/staff/tickets/:id/comments`
keep their Lab 3 contracts. The staff endpoint now also accepts
`ADMINISTRATOR`. Both now set the Ticket's `updatedAt` to now without
changing `version` (BR-27).

### 3.9 `GET /api/staff/it-staff-users` (changed)

Admin allowed. Returns active `IT_STAFF` **and** `ADMINISTRATOR` users,
name ascending, each with `role`:
`[{ "id": 3, "name": "Sarah Johnson", "role": "IT_STAFF" }, ...]`.
This list feeds both the Owner dropdown and the Action Assigned To dropdown
(specification.md §11-15).

---

## 4. List Filters for Drill-Down (changed Lab 2/3 endpoints)

New query params. Every existing param, default, and validation rule is
unchanged. Unrecognized values → `400 INVALID_FILTER` with `field`. All
filters combine with AND.

### 4.1 `GET /api/staff/tickets` (Ticket Queue)

Now `IT_STAFF` and `ADMINISTRATOR`.

| Param | Values | Meaning |
| --- | --- | --- |
| `statusGroup` | `active` | `currentStatus IN (NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED)` (BR-15). Combined with `status`, both apply (AND). |
| `resolvedFrom` | `YYYY-MM-DD` | `resolvedAt` ≥ 00:00 Asia/Bangkok of that date (BR-34). |
| `resolvedTo` | `YYYY-MM-DD` | `resolvedAt` < 00:00 Asia/Bangkok of the **next** date, so the date is inclusive. `resolvedTo` earlier than `resolvedFrom` → `400`. |
| `followUp` | `pending` | Ticket has ≥1 non-Cancelled Action with `followUpRequired = true`. |
| `openActionAssigneeId` | integer | Ticket has ≥1 Action with `assignedToId` = value and status `PLANNED`/`IN_PROGRESS`. A non-integer is `400`; an unknown id returns an empty list, not an error. |
| `sortBy` | adds `resolvedAt` | Nulls last in both directions. |

### 4.2 `GET /api/tickets` (My Tickets)

| Param | Values | Meaning |
| --- | --- | --- |
| `statusGroup` | `active` | As §4.1. |
| `resolvedFrom` | `YYYY-MM-DD` | As §4.1. |
| `sortBy` | adds `updatedAt` | For the "View all" link from Recently Updated (BR-43). |

### 4.3 `GET /api/admin/users`

No API change. `role` already exists. FR-16 only makes the screen read it
from the URL.

---

## 5. Dashboards

Both endpoints are read-only, uncached, and computed at request time
(BR-35). Every count is a JSON integer, never `null`. Lists hold at most
5 items (BR-36). `generatedAt` is the server time of calculation.

### 5.1 `GET /api/dashboard/requester`

`REQUESTER` only. Every value is scoped to `requesterId = caller` (BR-31).
No query params are accepted; any `requesterId` param is ignored (AC-02).

**200:**

```json
{
  "generatedAt": "2026-10-06T07:05:00.000Z",
  "hasAnyTickets": true,
  "metrics": {
    "openTickets": {
      "value": 6,
      "drillDown": "/tickets?statusGroup=active"
    },
    "waitingForYou": {
      "value": 1,
      "drillDown": "/tickets?status=WAITING_FOR_REQUESTER"
    },
    "resolvedLast30Days": {
      "value": 2,
      "windowStart": "2026-09-07",
      "drillDown": "/tickets?resolvedFrom=2026-09-07"
    }
  },
  "recentlyUpdated": [
    {
      "id": 101,
      "ticketNumber": "TKT-2026-000101",
      "summary": "Laptop battery drains quickly",
      "currentStatus": "IN_PROGRESS",
      "updatedAt": "2026-10-06T04:02:40.000Z"
    }
  ],
  "recentlyResolved": [
    {
      "id": 97,
      "ticketNumber": "TKT-2026-000097",
      "summary": "VPN disconnects every hour",
      "currentStatus": "CLOSED",
      "resolvedAt": "2026-10-05T09:00:00.000Z"
    }
  ]
}
```

Calculations: `openTickets` BR-39, `hasAnyTickets` BR-40, `waitingForYou`
BR-41, `resolvedLast30Days` BR-42, `recentlyUpdated` BR-43,
`recentlyResolved` BR-44. `drillDown` is a client route, and the client
uses it as given, so link targets are defined in one place. When
`hasAnyTickets` is `false`, every value is `0` and both lists are `[]`.

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller is not a Requester (AC-32). |

### 5.2 `GET /api/dashboard/staff`

`IT_STAFF`, `ADMINISTRATOR`. "me" = caller.

**200:**

```json
{
  "generatedAt": "2026-10-06T07:05:00.000Z",
  "today": "2026-10-06",
  "metrics": {
    "myOpenActions": {
      "value": 4,
      "ticketCount": 3,
      "drillDown": "/staff/tickets?openActionAssigneeId=3&statusGroup=active"
    },
    "unassigned": { "value": 5, "drillDown": "/staff/tickets?ownerId=unassigned&statusGroup=active" },
    "myActiveTickets": { "value": 7, "drillDown": "/staff/tickets?ownerId=3&statusGroup=active" },
    "followUpsPending": { "value": 2, "drillDown": "/staff/tickets?followUp=pending&statusGroup=active" },
    "highPriority": { "value": 4, "drillDown": "/staff/tickets?itPriority=HIGH&statusGroup=active" },
    "resolvedToday": {
      "value": 1,
      "drillDown": "/staff/tickets?resolvedFrom=2026-10-06&resolvedTo=2026-10-06"
    }
  },
  "byStatus": [
    { "status": "NEW", "value": 3, "drillDown": "/staff/tickets?status=NEW" },
    { "status": "OPEN", "value": 4, "drillDown": "/staff/tickets?status=OPEN" }
  ],
  "activeByItPriority": [
    { "itPriority": "LOW", "value": 6, "drillDown": "/staff/tickets?itPriority=LOW&statusGroup=active" },
    { "itPriority": "MEDIUM", "value": 7, "drillDown": "/staff/tickets?itPriority=MEDIUM&statusGroup=active" },
    { "itPriority": "HIGH", "value": 4, "drillDown": "/staff/tickets?itPriority=HIGH&statusGroup=active" }
  ],
  "myOpenActionList": [
    {
      "actionId": 5003,
      "ticketId": 101,
      "ticketNumber": "TKT-2026-000101",
      "description": "Order replacement battery from vendor",
      "status": "PLANNED",
      "actionAt": "2026-10-07T02:00:00.000Z",
      "drillDown": "/staff/tickets/101#actions-taken"
    }
  ],
  "recentlyUpdated": [
    {
      "id": 101,
      "ticketNumber": "TKT-2026-000101",
      "summary": "Laptop battery drains quickly",
      "currentStatus": "IN_PROGRESS",
      "ownerName": "Sarah Johnson",
      "updatedAt": "2026-10-06T04:02:40.000Z"
    }
  ],
  "userAccounts": {
    "REQUESTER": { "active": 5, "inactive": 1, "drillDown": "/admin/users?role=REQUESTER" },
    "IT_STAFF": { "active": 3, "inactive": 1, "drillDown": "/admin/users?role=IT_STAFF" },
    "ADMINISTRATOR": { "active": 1, "inactive": 0, "drillDown": "/admin/users?role=ADMINISTRATOR" }
  }
}
```

`byStatus` always has all eight statuses in the `TicketStatus` enum order.
`activeByItPriority` always has Low, Medium, and High. `description` in
`myOpenActionList` is truncated to 80 characters with `…`.
`userAccounts` is present only for an Administrator; for IT Staff the key
is omitted (AC-33).

Calculations: BR-45 (`myOpenActions`), BR-46 (`unassigned`), BR-47
(`myActiveTickets`), BR-48 (`followUpsPending`), BR-49 (`highPriority`),
BR-50 (`resolvedToday`, `today` = Asia/Bangkok date), BR-51 (`byStatus`),
BR-52 (`activeByItPriority`), BR-53 (`myOpenActionList`), BR-54
(`recentlyUpdated`), BR-55 (`userAccounts`).

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller is a Requester (AC-32). |

### 5.3 Time zone implementation note

Day boundaries are computed in one server helper
(`server/src/lib/bangkok-time.ts`): `startOfBangkokDay(date)` returns the
UTC instant of 00:00 +07:00, and `bangkokDateString(instant)` returns
`YYYY-MM-DD`. Asia/Bangkok has a fixed +07:00 offset with no daylight
saving, so a constant offset is exact. The helper is unit-tested at the
16:59:59Z / 17:00:00Z boundary (AC-29).

---

## 6. Endpoint × Role Matrix (Lab 4 state)

✓ = allowed, ✗ = `403`, own = Requester ownership-scoped (`404` if not
owned).

| Endpoint | Requester | IT Staff | Administrator |
| --- | --- | --- | --- |
| `GET /api/health` | public | public | public |
| `/api/auth/*` | ✓ | ✓ | ✓ |
| `GET /api/categories`, `/api/related-systems` | ✓ | ✓ | ✓ |
| `POST /api/tickets`, `GET /api/tickets` | ✓ | ✗ | ✗ |
| `GET /api/tickets/:id`, attachments, comments, `PATCH .../resolved` | own | ✗ | ✗ |
| `GET /api/tickets/:id/actions`, `/status-history` | own | ✗ | ✗ |
| `GET /api/dashboard/requester` | ✓ | ✗ | ✗ |
| `GET /api/dashboard/staff` | ✗ | ✓ | ✓ (+ `userAccounts`) |
| `GET /api/staff/tickets`, `/:id`, `/it-staff-users` | ✗ | ✓ | ✓ |
| `PATCH /api/staff/tickets/:id/{claim,owner,priority,status}` | ✗ | ✓ | ✓ |
| `POST /api/staff/tickets/:id/comments` | ✗ | ✓ | ✓ |
| `GET/POST /api/staff/tickets/:id/actions`, `PATCH .../actions/:actionId` | ✗ | ✓ | ✓ |
| `GET /api/staff/tickets/:id/status-history` | ✗ | ✓ | ✓ |
| `/api/admin/*` | ✗ | ✗ | ✓ |

`server/tests/lab-04/authorization-matrix.api.test.ts` asserts every cell,
both the denials and that each allowed role reaches the handler.

## 7. Traceability

Every endpoint and error case above maps to at least one row in
`tests.md` §2. The AC-to-test matrix is in `tests.md` §3.
