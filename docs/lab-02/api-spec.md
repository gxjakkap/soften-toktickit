# Lab 2 API Contract

All endpoints are relative to the existing Express app (`server/src/app.ts`).
This document is normative for `tests.md`'s API-level tests; anything that
disagrees with `specification.md` is a bug in one of the two documents,
please flag it.

## 0. Conventions Used Throughout

### 0.1 Requester context (BR-10, BR-14, BR-15)

There is no real authentication in Lab 2. Every Requester-scoped endpoint
requires a `requesterId` identifying the current Development Requester,
supplied by the client from its locally persisted selection:

- On `GET` requests: query parameter `requesterId`.
- On `POST`/`PATCH` requests: a `requesterId` field in the JSON (or
  multipart) body.

`GET /api/dev-requesters`, `GET /api/categories`, and
`GET /api/related-systems` are reference-data endpoints and do not require
`requesterId`.

**Ownership rule**, applied identically everywhere: a Ticket or Attachment
not owned by the supplied `requesterId` is treated exactly like a
nonexistent one — the response is `404`, never `403`. This prevents an API
consumer from learning that a given id exists but belongs to someone else.

### 0.2 Standard error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Summary must be between 5 and 120 characters.",
    "field": "summary"
  }
}
```

`field` is present only for a single-field validation failure. `code` is a
stable machine-readable string (see per-endpoint tables); `message` is
safe to show directly to the Requester.

### 0.3 Status codes used in this contract

| Status | Meaning here |
| --- | --- |
| 200 | Successful retrieval, or a mutation that doesn't create a new resource (soft-remove). |
| 201 | Resource created (Ticket, Attachment). |
| 400 | Invalid input: missing/malformed field, invalid enum value, unknown filter value, invalid Requester context. |
| 404 | Resource not found, or found but not owned by the supplied `requesterId` (BR-15). |
| 409 | Valid request, but rejected due to current resource state (5-active-attachment limit reached). |
| 410 | Resource existed and is owned by the caller, but has been soft-removed (download of a removed Attachment). |
| 413 | Uploaded file exceeds the 5 MB limit. |
| 415 | Uploaded file's type is not one of JPG/JPEG/PNG/WEBP/PDF. |
| 500 | Unexpected server error. Response body still uses the standard error envelope with `code: "INTERNAL_ERROR"` and a generic message — no stack traces or internals are exposed. |

---

## 1. `GET /api/dev-requesters`

List active Development Requesters for the Selection screen.

**Query params:** none.

**200 response:**

```json
[
  { "id": 1, "name": "Jennifer Anderson", "email": "jennifer.anderson@example.com" },
  { "id": 2, "name": "Michael Brown", "email": "michael.brown@example.com" }
]
```

Ordered by `name` ascending. Only rows with `isActive = true` are returned
(BR-09); the seeded inactive Requester never appears here.

**Failure:** `500` on unexpected DB error, safe error envelope, no partial
list.

---

## 2. `GET /api/categories`

List active Categories.

**200 response:**

```json
[
  { "id": 1, "name": "Account and Access" },
  { "id": 2, "name": "Hardware" }
]
```

Only `isActive = true` rows, ordered by `id` ascending (existing convention
in `server/src/app.ts`).

---

## 3. `GET /api/related-systems`

List active Related Systems. Same shape and ordering as `/api/categories`.

```json
[
  { "id": 1, "name": "Email" },
  { "id": 2, "name": "VPN" }
]
```

---

## 4. `POST /api/tickets`

Create a Ticket for the current Requester (FR-02, FR-03).

**Request body:**

```json
{
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 5,
  "requestedPriority": "MEDIUM",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle."
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `requesterId` | yes | Must reference an active `RequesterUser`. |
| `categoryId` | yes | Must reference an active `Category`. |
| `relatedSystemId` | yes | Must reference an active `RelatedSystem`. |
| `requestedPriority` | yes | One of `LOW`, `MEDIUM`, `HIGH` (BR-08). |
| `summary` | yes | Trimmed, 5–120 chars (BR-20). |
| `description` | yes | Trimmed, 10–2000 chars (BR-21). |

`ticketNumber`, `currentStatus`, `createdAt`, `updatedAt` are never accepted
from the client — they are always server-generated (BR-01, BR-02, BR-04,
BR-06).

**201 response:**

```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000101",
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 5,
  "requestedPriority": "MEDIUM",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle.",
  "currentStatus": "NEW",
  "createdAt": "2026-09-01T09:14:00.000Z",
  "updatedAt": "2026-09-01T09:14:00.000Z"
}
```

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing/blank/out-of-range `summary`, `description`; missing `requestedPriority`. `field` identifies which. |
| 400 | `INVALID_REFERENCE` | `categoryId`/`relatedSystemId` does not reference an active row. |
| 400 | `INVALID_REQUESTER` | `requesterId` missing, unknown, or not active (BR-12) — client should return to the Selection screen. |
| 500 | `INTERNAL_ERROR` | Unexpected error; no Ticket is persisted (AC-08). |

No Attachment upload happens in this call — see §6 and BR-24/§11-12 of
`specification.md`.

---

## 5. `GET /api/tickets`

Search/filter/sort/paginate the current Requester's own Tickets (FR-05–09).

**Query params:**

| Param | Required | Notes |
| --- | --- | --- |
| `requesterId` | yes | Owner scope (BR-14). |
| `search` | no | Case-insensitive partial match against `ticketNumber` OR `summary` (BR-16). |
| `categoryId` | no | Exact match. Unknown/non-numeric id → `400`. |
| `requestedPriority` | no | One of `LOW`/`MEDIUM`/`HIGH`. Unrecognized value → `400`. |
| `status` | no | One of the `TicketStatus` enum values. Unrecognized value → `400`. |
| `sortBy` | no | One of `createdAt`, `ticketNumber`, `summary`, `requestedPriority`, `currentStatus`. Default `createdAt`. Unrecognized value → `400`. |
| `sortDir` | no | `asc` or `desc`. Default `desc`. Unrecognized value → `400`. |
| `page` | no | 1-based integer. Default `1`. Non-positive or non-integer is clamped to `1` (BR-19), not rejected. |
| `pageSize` | no | Integer, 1–50. Default `10`. Out-of-range is clamped to the nearest bound (BR-19). |

Filters combine with AND logic (BR-17).

**200 response:**

```json
{
  "data": [
    {
      "id": 101,
      "ticketNumber": "TKT-2026-000101",
      "summary": "Laptop battery drains quickly",
      "categoryId": 2,
      "categoryName": "Hardware",
      "requestedPriority": "MEDIUM",
      "currentStatus": "NEW",
      "createdAt": "2026-09-01T09:14:00.000Z",
      "updatedAt": "2026-09-01T09:14:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "totalCount": 42,
  "totalPages": 5,
  "hasAnyTickets": true
}
```

`hasAnyTickets` is the current Requester's **unfiltered** ticket count
being greater than zero — the client uses it (together with `totalCount`)
to distinguish the empty-account state (`hasAnyTickets: false`) from the
no-results-for-these-filters state (`hasAnyTickets: true`, `totalCount: 0`)
per BR-30/AC-19/AC-20.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 400 | `INVALID_REQUESTER` | `requesterId` missing, unknown, or not active. |
| 400 | `INVALID_FILTER` | Unrecognized `requestedPriority`, `status`, `sortBy`, or `sortDir`; non-numeric `categoryId`. `field` identifies which. |
| 500 | `INTERNAL_ERROR` | Unexpected error. |

---

## 6. `GET /api/tickets/:id`

Retrieve one owned Ticket with full detail and its attachment list
(FR-10).

**Query params:** `requesterId` (required).

**200 response:**

```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000101",
  "requester": { "id": 1, "name": "Jennifer Anderson" },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 5, "name": "Corporate Laptop" },
  "requestedPriority": "MEDIUM",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle.",
  "currentStatus": "NEW",
  "createdAt": "2026-09-01T09:14:00.000Z",
  "updatedAt": "2026-09-01T09:14:00.000Z",
  "attachments": [
    {
      "id": 501,
      "originalFileName": "battery-report.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 812345,
      "uploadedAt": "2026-09-01T09:15:00.000Z",
      "isRemoved": false
    },
    {
      "id": 502,
      "originalFileName": "screenshot.png",
      "mimeType": "image/png",
      "sizeBytes": 245000,
      "uploadedAt": "2026-08-30T10:00:00.000Z",
      "isRemoved": true,
      "removedAt": "2026-08-31T08:00:00.000Z"
    }
  ]
}
```

Removed attachments are included (BR-28) but carry `isRemoved: true` and no
downloadable content; the UI must not offer a download/preview action for
them.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 400 | `INVALID_REQUESTER` | `requesterId` missing, unknown, or not active. |
| 404 | `NOT_FOUND` | Ticket id doesn't exist, or exists but isn't owned by `requesterId` (BR-15/AC-03). |

---

## 7. `POST /api/tickets/:id/attachments`

Upload an Attachment to an owned Ticket (FR-04). `multipart/form-data`.

**Form fields:**

| Field | Required | Notes |
| --- | --- | --- |
| `requesterId` | yes | Owner scope. |
| `file` | yes | One file, ≤ 5 MB, type in `{jpg, jpeg, png, webp, pdf}` by extension and declared `Content-Type`. |

**201 response:**

```json
{
  "id": 503,
  "ticketId": 101,
  "originalFileName": "receipt.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 1200000,
  "uploadedAt": "2026-09-01T09:16:00.000Z",
  "isRemoved": false
}
```

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 400 | `INVALID_REQUESTER` | `requesterId` missing/unknown/inactive. |
| 404 | `NOT_FOUND` | Ticket id doesn't exist or isn't owned by `requesterId`. |
| 409 | `ATTACHMENT_LIMIT_REACHED` | Ticket already has 5 active Attachments (BR-26/AC-10). |
| 413 | `FILE_TOO_LARGE` | File exceeds 5 MB (BR-25/AC-11). |
| 415 | `UNSUPPORTED_FILE_TYPE` | Extension or content type not allowed (BR-25/AC-12). |
| 500 | `INTERNAL_ERROR` | Storage or unexpected failure. The parent Ticket is unaffected either way (BR-24/AC-13). |

---

## 8. `GET /api/attachments/:id/download`

Stream an active Attachment's file content (FR-11).

**Query params:** `requesterId` (required).

**200 response:** the raw file bytes, with `Content-Type` set to the
stored `mimeType` and `Content-Disposition: attachment; filename="<originalFileName>"`.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 400 | `INVALID_REQUESTER` | `requesterId` missing/unknown/inactive. |
| 404 | `NOT_FOUND` | Attachment id doesn't exist, or its Ticket isn't owned by `requesterId`. |
| 410 | `ATTACHMENT_REMOVED` | Attachment exists and is owned by the caller, but `isRemoved = true` (BR-28/AC-15). |

---

## 9. `PATCH /api/attachments/:id/remove`

Soft-remove an owned Attachment (FR-12).

**Request body:**

```json
{ "requesterId": 1, "reason": "Wrong file, re-uploading the correct one" }
```

`reason` is optional (§11-2 of `specification.md`); omit or send an empty
string when not provided.

**200 response:** the updated Attachment, same shape as the upload
response, now with `isRemoved: true`, `removedAt`, and `removedReason` (or
`null` if none was given).

Calling this on an Attachment that is **already** removed is idempotent —
it returns `200` with the existing removed state rather than an error,
since the caller's desired end state ("this attachment is removed") already
holds.

**Failure cases:**

| Status | `code` | Cause |
| --- | --- | --- |
| 400 | `INVALID_REQUESTER` | `requesterId` missing/unknown/inactive. |
| 404 | `NOT_FOUND` | Attachment id doesn't exist, or its Ticket isn't owned by `requesterId`. |

---

## 10. Traceability

Every capability above is exercised by at least one planned test in
`tests.md`'s AC-to-test matrix; see that document for the mapping from each
endpoint/status-code case back to AC-01–AC-26.
