# Lab 3 API Contract

All endpoints are relative to the existing Express app (`server/src/app.ts`).
This document is normative for `tests.md`'s API-level tests; anything that
disagrees with `specification.md` is a bug in one of the two documents,
please flag it. It extends, and does not replace, `docs/lab-02/api-spec.md`
— every Lab 2 endpoint listed there still exists; only its identification
mechanism changes (§0.1).

## 0. Conventions Used Throughout

### 0.1 Authentication (specification.md §12-1)

Lab 3 replaces the Lab 2 client-supplied `requesterId` with a real
server-side session:

- `POST /api/auth/login` issues a session and sets an httpOnly, `Secure`
  (production only), `SameSite=Lax` cookie named `tik_session` containing
  an opaque, cryptographically random token. The token itself is never
  readable from client-side JavaScript.
- The server stores only a SHA-256 hash of the token (`Session.tokenHash`),
  never the raw value, so a database compromise doesn't directly yield
  usable session tokens.
- Every request to a protected endpoint carries the cookie automatically
  (browser default); no client code attaches it manually.
- The server resolves "who is asking" once per request, in one backend
  helper (`resolveAuthenticatedUser(req)`), exactly as Lab 2 centralized
  Requester resolution in `requester-context.ts`. No route reads the cookie
  or looks up the session directly.
- A session is valid only if its token hash matches a non-expired `Session`
  row whose `User` is active. An expired session, a session for a
  deactivated user, or no cookie at all all resolve to "unauthenticated."
- Sessions expire 12 hours after creation (BR-13); there is no sliding
  renewal in Lab 3.

**Ownership rule** (Requester-scoped endpoints), applied identically to
every one of them: a Ticket, Attachment, or Comment not owned by the
authenticated Requester is treated exactly like a nonexistent one — the
response is `404`, never `403`, preserving Lab 2's anti-enumeration
guarantee (BR-16, carried over from Lab 2 BR-15).

**Role rule** (role-gated endpoints): a caller authenticated as the wrong
role for an endpoint receives `403 FORBIDDEN` — not `404` — since the
resource genuinely exists and the caller's identity is known; there is
nothing to hide by pretending otherwise.

### 0.2 Standard error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Content must be between 1 and 2000 characters.",
    "field": "content"
  }
}
```

`field` is present only for a single-field validation failure. `code` is a
stable machine-readable string (see per-endpoint tables); `message` is safe
to show directly to the caller.

### 0.3 Status codes used in this contract

| Status | Meaning here |
| --- | --- |
| 200 | Successful retrieval, or a mutation that doesn't create a new resource. |
| 201 | Resource created (Ticket, Attachment, User, Comment/Note). |
| 204 | Successful logout — no response body. |
| 400 | Invalid input: missing/malformed field, invalid enum value, unknown filter value, weak password. |
| 401 | No valid session — missing cookie, unknown/expired token, or the session's user is no longer active. |
| 403 | Authenticated, but the caller's role (or a specific safety rule — self-deactivation, last Administrator) does not permit this action. |
| 404 | Resource not found, or found but not owned by the authenticated Requester (ownership-scoped endpoints only). |
| 409 | Valid request, rejected due to current resource state (duplicate email, disallowed status transition, 5-active-attachment limit, last-Administrator rule). |
| 410 | Resource exists and is owned by the caller, but has been soft-removed (download of a removed Attachment). |
| 413 | Uploaded file exceeds the 5 MB limit. |
| 415 | Uploaded file's type is not one of JPG/JPEG/PNG/WEBP/PDF. |
| 500 | Unexpected server error. Standard error envelope, `code: "INTERNAL_ERROR"`, generic message — no stack traces or internals exposed. |

---

## 1. Authentication

### 1.1 `POST /api/auth/login`

**Request body:**

```json
{ "email": "jennifer.anderson@example.com", "password": "DevPass123!" }
```

**200 response:**

```json
{
  "id": 1,
  "name": "Jennifer Anderson",
  "email": "jennifer.anderson@example.com",
  "role": "REQUESTER",
  "mustChangePassword": false
}
```

Sets the `tik_session` cookie. `passwordHash` and every other internal
column are never included in this or any response.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing `email` or `password`. `field` identifies which. |
| 401 | `INVALID_CREDENTIALS` | Email doesn't match any user, or the password is wrong (BR-06 — identical response either way). |
| 403 | `INACTIVE_ACCOUNT` | Email and password are correct, but the account is inactive (BR-07). |
| 500 | `INTERNAL_ERROR` | Unexpected error; no session is created. |

### 1.2 `POST /api/auth/logout`

Deletes the current session row and clears the cookie (BR-12).

**Request body:** none.

**204 response:** no body.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session to log out of. |

### 1.3 `GET /api/auth/me`

Returns the authenticated user's identity (BR-14, FR-03). Used on app load
to drive role-based navigation and the first-login gate.

**200 response:** same shape as §1.1's 200 response.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |

### 1.4 `POST /api/auth/change-password`

Satisfies the mandatory first-login password change (FR-02, BR-02, BR-11).
Requires an authenticated session — a user with `mustChangePassword: true`
is authenticated (has a valid session) but is blocked from every other
protected endpoint until this call succeeds.

**Request body:**

```json
{ "currentPassword": "DevPass123!", "newPassword": "N3w!Passw0rd" }
```

**200 response:**

```json
{
  "id": 1,
  "name": "Jennifer Anderson",
  "email": "jennifer.anderson@example.com",
  "role": "REQUESTER",
  "mustChangePassword": false
}
```

The server issues a fresh session token and invalidates the one used to
call this endpoint (defends against a leaked pre-change token remaining
valid indefinitely).

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 400 | `VALIDATION_ERROR` | `currentPassword` or `newPassword` missing. |
| 401 | `INVALID_CREDENTIALS` | `currentPassword` does not match the stored hash. |
| 400 | `WEAK_PASSWORD` | `newPassword` fails the complexity rule, or equals `currentPassword` (BR-10). |
| 500 | `INTERNAL_ERROR` | Unexpected error; the old password remains valid. |

### 1.5 Non-endpoint behavior: the password-change gate

Every protected endpoint other than `/api/auth/*` rejects a request from a
user whose `mustChangePassword` is `true` with:

```json
{ "error": { "code": "PASSWORD_CHANGE_REQUIRED", "message": "You must change your password before continuing." } }
```

`403 PASSWORD_CHANGE_REQUIRED`. The client treats this identically for
every such endpoint: redirect to Change Password (AC-02).

---

## 2. Reference Data

Identical response shape to `docs/lab-02/api-spec.md` §2–3; the only change
is that both now require an authenticated session (specification.md §12-12).

### 2.1 `GET /api/categories`

**200 response:** `[{ "id": 1, "name": "Account and Access" }, ...]`

### 2.2 `GET /api/related-systems`

**200 response:** `[{ "id": 1, "name": "Email" }, ...]`

**Failure cases (both):**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |

---

## 3. Requester Ticket Endpoints

Identification changes from Lab 2 (`requesterId` in the query/body) to the
authenticated session (BR-03, BR-16). Every request/response shape below is
otherwise identical to `docs/lab-02/api-spec.md` §4–9 except where noted.

### 3.1 `POST /api/tickets`

**Request body:** identical to Lab 2's §4, minus `requesterId` (taken from
the session instead).

```json
{
  "categoryId": 2,
  "relatedSystemId": 5,
  "requestedPriority": "MEDIUM",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle."
}
```

**201 response:** same shape as Lab 2's §4, plus `ownerId: null` and
`itPriority` (copied from `requestedPriority` at creation — BR-21).

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Authenticated, but caller's role is not `REQUESTER` (BR-17). |
| 400 | `VALIDATION_ERROR` | Same field rules as Lab 2 (summary, description, requestedPriority). |
| 400 | `INVALID_REFERENCE` | `categoryId`/`relatedSystemId` not active. |
| 500 | `INTERNAL_ERROR` | Unexpected error; no Ticket persisted. |

### 3.2 `GET /api/tickets`

Same query params, filters, sorting, and pagination as Lab 2's §5, minus
`requesterId` (implicit from session). Same response shape, with each row
additionally carrying `itPriority` and `ownerName` (the Ticket Owner's
name, or `null` if unassigned).

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `REQUESTER`. |
| 400 | `INVALID_FILTER` | Unrecognized filter/sort value (same rules as Lab 2). |

### 3.3 `GET /api/tickets/:id`

Same shape as Lab 2's §6, plus `ownerName` (or `null`), `itPriority`,
`requesterConfirmedResolvedAt` (or `null`), and a `comments` array
containing only `visibility: "PUBLIC"` entries (BR-04):

```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000101",
  "requester": { "id": 1, "name": "Jennifer Anderson" },
  "ownerName": "Michael Brown",
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 5, "name": "Corporate Laptop" },
  "requestedPriority": "MEDIUM",
  "itPriority": "MEDIUM",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle.",
  "currentStatus": "IN_PROGRESS",
  "requesterConfirmedResolvedAt": null,
  "createdAt": "2026-09-01T09:14:00.000Z",
  "updatedAt": "2026-09-01T09:14:00.000Z",
  "attachments": [ { "...": "unchanged from Lab 2 §6" } ],
  "comments": [
    {
      "id": 9001,
      "authorName": "Jennifer Anderson",
      "authorRole": "REQUESTER",
      "content": "Thank you for the update.",
      "createdAt": "2026-09-01T10:00:00.000Z"
    }
  ]
}
```

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `REQUESTER`. |
| 404 | `NOT_FOUND` | Ticket doesn't exist, or isn't owned by the authenticated Requester (BR-16/AC-03). |

### 3.4–3.6 Attachments

`POST /api/tickets/:id/attachments`, `GET /api/attachments/:id/download`,
`PATCH /api/attachments/:id/remove` are unchanged from Lab 2's §7–9 except
`requesterId` is no longer accepted from the client (session-derived
instead); response shapes, status codes, and business rules (BR-24–29 in
`docs/lab-02/specification.md`) are otherwise identical.

### 3.7 `POST /api/tickets/:id/comments`

Post a Public Comment on an owned Ticket (FR-10).

**Request body:**

```json
{ "content": "Please let me know if you need any additional information." }
```

`visibility` is not accepted from a Requester caller — it is always forced
to `PUBLIC` server-side.

**201 response:**

```json
{
  "id": 9002,
  "ticketId": 101,
  "authorName": "Jennifer Anderson",
  "authorRole": "REQUESTER",
  "visibility": "PUBLIC",
  "content": "Please let me know if you need any additional information.",
  "createdAt": "2026-09-01T11:00:00.000Z"
}
```

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `REQUESTER`. |
| 404 | `NOT_FOUND` | Ticket doesn't exist or isn't owned by the caller. |
| 400 | `VALIDATION_ERROR` | `content` empty, whitespace-only, or outside 1–2000 characters (BR-26). |

### 3.8 `PATCH /api/tickets/:id/resolved`

Mark "Problem Appears Resolved" (FR-11, BR-24, BR-25).

**Request body:** none.

**200 response:**

```json
{ "id": 101, "requesterConfirmedResolvedAt": "2026-09-01T11:05:00.000Z" }
```

Calling this again simply updates the timestamp (BR-24 — idempotent, not an
error).

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `REQUESTER`. |
| 404 | `NOT_FOUND` | Ticket doesn't exist or isn't owned by the caller. |
| 409 | `TICKET_CLOSED` | Ticket's `currentStatus` is `CLOSED` or `CANCELLED` (BR-25). |

---

## 4. IT Staff Ticket Endpoints

All endpoints under `/api/staff/*` require an authenticated session with
role `IT_STAFF`; any other role receives `403 FORBIDDEN` — **except**
`GET /api/staff/tickets/:id` (§4.2), which also accepts role
`ADMINISTRATOR` as a read-only exception (BR-40). None of these endpoints
are ownership-scoped (BR-31) — any active IT Staff user may act on any
Ticket.

### 4.1 `GET /api/staff/tickets`

The Ticket Queue (FR-12, BR-31, BR-32).

**Query params:**

| Param | Required | Notes |
| --- | --- | --- |
| `search` | no | Case-insensitive partial match against `ticketNumber` OR `summary`. |
| `categoryId` | no | Exact match. Unknown/non-numeric id → `400`. |
| `requestedPriority` | no | `LOW`/`MEDIUM`/`HIGH`. Unrecognized → `400`. |
| `itPriority` | no | `LOW`/`MEDIUM`/`HIGH`. Unrecognized → `400`. |
| `status` | no | One of the `TicketStatus` values (§specification.md §7). Unrecognized → `400`. |
| `ownerId` | no | Integer id, or the literal string `unassigned` for `ownerId IS NULL`. Non-numeric and not `unassigned` → `400`. |
| `sortBy` | no | One of `createdAt`, `updatedAt`, `ticketNumber`, `requestedPriority`, `itPriority`, `currentStatus`. Default `createdAt`. Unrecognized → `400`. |
| `sortDir` | no | `asc` or `desc`. **Default `asc`** (specification.md §12-8 — oldest first). Unrecognized → `400`. |
| `page` | no | 1-based integer. Default `1`. Non-positive/non-integer clamped to `1`. |
| `pageSize` | no | Integer, 1–50. Default `10`. Out-of-range clamped to the nearest bound. |

Filters combine with AND logic.

**200 response:**

```json
{
  "data": [
    {
      "id": 101,
      "ticketNumber": "TKT-2026-000101",
      "summary": "Laptop battery drains quickly",
      "categoryName": "Hardware",
      "requestedPriority": "MEDIUM",
      "itPriority": "MEDIUM",
      "currentStatus": "IN_PROGRESS",
      "ownerName": "Michael Brown",
      "createdAt": "2026-09-01T09:14:00.000Z",
      "updatedAt": "2026-09-01T09:14:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "totalCount": 87,
  "totalPages": 9,
  "hasAnyTickets": true
}
```

`hasAnyTickets` is whether the Ticket table has any row at all (system-wide,
unfiltered), distinguishing the true empty state from no-results-for-these-
filters (AC-25/AC-26), the same convention as Lab 2's My Tickets.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `IT_STAFF`. |
| 400 | `INVALID_FILTER` | Unrecognized filter/sort value. `field` identifies which. |

### 4.2 `GET /api/staff/tickets/:id`

Full Ticket detail for IT Staff (FR-13), and read-only for Administrator
(FR-28, BR-40). Same shape as §3.3's Requester detail response, except the
`comments` array includes both `PUBLIC` and `INTERNAL` entries (BR-04),
each carrying `visibility`.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `IT_STAFF` or `ADMINISTRATOR`. |
| 404 | `NOT_FOUND` | Ticket id doesn't exist. |

### 4.3 `PATCH /api/staff/tickets/:id/claim`

Claim an unassigned or self-owned Ticket (FR-14, BR-19). `IT_STAFF` only —
unlike §4.2, Administrator is not accepted here.

**Request body:** none.

**200 response:**

```json
{ "id": 101, "ownerId": 3, "ownerName": "Sarah Johnson" }
```

Claiming a Ticket the caller already owns is a no-op success (BR-19),
returning the same shape unchanged.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `IT_STAFF`. |
| 404 | `NOT_FOUND` | Ticket id doesn't exist. |
| 409 | `ALREADY_OWNED` | The Ticket is currently owned by a different active IT Staff user; use Reassign (§4.4) instead (BR-19/AC-38). |

### 4.4 `PATCH /api/staff/tickets/:id/owner`

Reassign ownership (FR-15, BR-20) — no ownership precondition, unlike
Claim (§4.3): the acting IT Staff user may set the Owner to any active IT
Staff id, including themselves, or clear it back to unassigned.

**Request body:**

```json
{ "ownerId": 3 }
```

`ownerId` is any active IT Staff user's id, the caller's own id, or `null`
(clear back to unassigned).

**200 response:**

```json
{ "id": 101, "ownerId": 3, "ownerName": "Sarah Johnson" }
```

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `IT_STAFF`. |
| 404 | `NOT_FOUND` | Ticket id doesn't exist. |
| 400 | `INVALID_OWNER` | `ownerId` doesn't reference an active `IT_STAFF` user (and isn't `null`). |

### 4.5 `PATCH /api/staff/tickets/:id/priority`

Change IT Priority (FR-16, BR-21).

**Request body:** `{ "itPriority": "HIGH" }`

**200 response:** `{ "id": 101, "itPriority": "HIGH" }`

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `IT_STAFF`. |
| 404 | `NOT_FOUND` | Ticket id doesn't exist. |
| 400 | `VALIDATION_ERROR` | `itPriority` is not `LOW`/`MEDIUM`/`HIGH`. |

### 4.6 `PATCH /api/staff/tickets/:id/status`

Change Current Status (FR-17, BR-22, specification.md §7).

**Request body:** `{ "status": "RESOLVED" }`

**200 response:** `{ "id": 101, "currentStatus": "RESOLVED" }`

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `IT_STAFF`. |
| 404 | `NOT_FOUND` | Ticket id doesn't exist. |
| 400 | `VALIDATION_ERROR` | `status` is not a recognized `TicketStatus` value. |
| 409 | `INVALID_TRANSITION` | `status` is recognized but not reachable from the Ticket's current status per specification.md §7 (BR-22). |

### 4.7 `POST /api/staff/tickets/:id/comments`

Post a Public Comment or an Internal Note (FR-18, FR-19).

**Request body:**

```json
{ "visibility": "INTERNAL", "content": "Escalated to hardware vendor for battery replacement." }
```

**201 response:** same shape as §3.7's 201 response, with `visibility`
reflecting what was submitted.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `IT_STAFF`. |
| 404 | `NOT_FOUND` | Ticket id doesn't exist. |
| 400 | `VALIDATION_ERROR` | `content` empty/whitespace-only/outside 1–2000 chars, or `visibility` is not `PUBLIC`/`INTERNAL`. |

---

## 5. Administrator User Management Endpoints

All endpoints under `/api/admin/*` require an authenticated session with
role `ADMINISTRATOR`; any other role receives `403 FORBIDDEN`.

### 5.1 `GET /api/admin/users`

List/search/filter users (FR-20, BR-38, BR-39).

**Query params:**

| Param | Required | Notes |
| --- | --- | --- |
| `search` | no | Case-insensitive partial match against `name` OR `email`. |
| `role` | no | One of `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`. Unrecognized → `400`. |

No pagination (BR-39 — Lab 3 explicitly excludes it for this list).

**200 response:**

```json
{
  "data": [
    { "id": 1, "name": "Jennifer Anderson", "email": "jennifer.anderson@example.com", "role": "IT_STAFF", "isActive": true },
    { "id": 2, "name": "Michael Brown", "email": "michael.brown@example.com", "role": "IT_STAFF", "isActive": true }
  ],
  "totalCount": 2
}
```

Ordered by `name` ascending. `passwordHash` and `mustChangePassword` are
never included.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `ADMINISTRATOR`. |
| 400 | `INVALID_FILTER` | Unrecognized `role` value. |

### 5.2 `POST /api/admin/users`

Create a user (FR-21, BR-33, BR-10).

**Request body:**

```json
{
  "name": "Alex Thompson",
  "email": "alex.thompson@tiktockit.com",
  "role": "IT_STAFF",
  "isActive": true,
  "initialPassword": "N3w!Passw0rd"
}
```

**201 response:**

```json
{ "id": 42, "name": "Alex Thompson", "email": "alex.thompson@tiktockit.com", "role": "IT_STAFF", "isActive": true }
```

The created user has `mustChangePassword: true` (BR-11), not returned here
since this response shape never includes it (matches §5.1).

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `ADMINISTRATOR`. |
| 400 | `VALIDATION_ERROR` | Missing/blank `name`, missing/malformed `email`, or `role` not one of the three values. `field` identifies which. |
| 400 | `WEAK_PASSWORD` | `initialPassword` fails the complexity rule (BR-10). |
| 409 | `DUPLICATE_EMAIL` | `email` matches an existing user, case-insensitively (BR-15). |

### 5.3 `PATCH /api/admin/users/:id`

Edit a user's name/email/role/active state (FR-22, BR-34–36).

**Request body:** any subset of

```json
{ "name": "Alex T. Thompson", "email": "alex.t.thompson@tiktockit.com", "role": "ADMINISTRATOR", "isActive": false }
```

**200 response:** same shape as §5.2's 201 response, reflecting the update.
If `isActive` was set to `false`, or `role` was changed, the target user's
existing sessions are deleted server-side (BR-34) so the change takes
effect immediately, not at their session's natural expiry.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `ADMINISTRATOR`. |
| 404 | `NOT_FOUND` | `id` doesn't reference an existing user. |
| 400 | `VALIDATION_ERROR` | Malformed `name`/`email`/`role`. |
| 409 | `DUPLICATE_EMAIL` | `email` matches a different existing user, case-insensitively. |
| 409 | `SELF_DEACTIVATION` | `id` equals the caller's own id and `isActive: false` was requested (BR-35). |
| 409 | `LAST_ADMINISTRATOR` | This edit would deactivate the last active Administrator, or change their role away from `ADMINISTRATOR` (BR-36). |

### 5.4 `PATCH /api/admin/users/:id/password`

Set a new initial password (FR-23, BR-37).

**Request body:**

```json
{ "newPassword": "An0ther!Pass" }
```

**200 response:** `{ "id": 42, "mustChangePassword": true }`

The target user's existing sessions are deleted server-side (same reasoning
as §5.3), so a stale session can't keep using the old password's
authorization.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No valid session. |
| 403 | `FORBIDDEN` | Caller's role is not `ADMINISTRATOR`. |
| 404 | `NOT_FOUND` | `id` doesn't reference an existing user. |
| 400 | `WEAK_PASSWORD` | `newPassword` fails the complexity rule (BR-10). |

---

## 6. Traceability

Every capability above is exercised by at least one planned test in
`tests.md`'s AC-to-test matrix; see that document for the mapping from each
endpoint/status-code case back to AC-01–AC-35.
