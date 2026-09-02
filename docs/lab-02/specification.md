# Lab 2 Sprint Engineering Specification

Status: **Draft — pending student review and approval before implementation.**
Every interpretive call made while writing this document is called out in
[§11 Assumptions and Decisions](#11-assumptions-and-decisions). Review that
section first; correct anything that doesn't match intent before this
contract is handed to the coding agent.

## 1. Sprint Goal

Deliver a Requester-facing ticketing experience — Create Ticket, My Tickets,
Requester Ticket Detail, and the Attachment lifecycle (upload, download,
soft-remove) — running against a temporary Development Requester identity
that stands in for real login until Lab 3, all built on a reusable Zen Green
UI foundation (forms, lists, badges, validation, loading, empty, error, and
responsive conventions) that later labs can extend without redesign.

## 2. Stakeholder Request Interpretation

The IT department wants Requesters to self-serve: describe a problem,
classify it (Category, Related System, Requested Priority), attach evidence,
and submit — receiving a Requester-facing view of Category, Related System is
required; and generate an official Ticket Number. Afterward, Requesters must
be able to find their own tickets (search/filter), open a read-only Ticket
Detail, and manage their own attachments — with a hard guarantee that one
Requester can never see or touch another Requester's ticket.

Because real login doesn't exist yet, the stakeholder wants a **temporary
"pick who you are" screen** that simulates a logged-in Requester for testing
purposes only, explicitly not to be confused with authentication. Everything
built this sprint (visual language, form patterns, list/table patterns,
states) is meant to be the reusable foundation IT Staff screens and Lab 3
auth will build on top of — not a one-off.

## 3. Scope

### Included

- Development Requester Selection screen (temporary "login," not real auth)
- Create Ticket (Category, Related System, Requested Priority, Summary,
  Description, Attachments)
- My Tickets: Requester-owned ticket list with search, filter, sort,
  pagination, empty state, no-results state
- Requester Ticket Detail: read-only ticket fields + attachment management
- Attachment lifecycle: upload (during creation or after), download
  (active only), soft-remove
- Ticket ownership enforcement (one Requester cannot view/act on another
  Requester's data)
- Zen Green visual system: color tokens, typography, field states, button
  hierarchy, validation placement, responsive rules, accessibility basics
- Seed data: 4 Categories, ≥6 Related Systems, ≥4 active Development
  Requesters, ≥1 inactive Development Requester, sample Tickets across
  multiple statuses for filter/sort demonstration

### Excluded

- Authentication, login, logout, passwords, sessions, tokens, real
  role-based authorization (the Development Requester selector is a testing
  mechanism only — BR-03)
- IT Staff dashboard, ticket queue, claiming/reassigning, setting IT
  Priority, or any other IT-Staff-owner function
- Public Comments, Internal Notes, Actions Taken (ticket collaboration /
  work tracking)
- Status changes beyond the system-assigned initial `New` status —
  resolution, closing, reopening, cancelling
- Administrator functions (managing users, Requesters, roles, reference
  data)

## 4. Functional Requirements

| ID | Requirement |
| --- | --- |
| FR-01 | The system shall provide a Development Requester Selection screen listing only active Requesters, letting the student choose one as the current testing context. |
| FR-02 | The system shall let the current Requester create a Ticket by providing Category, Related System, Requested Priority, Summary, and Description. |
| FR-03 | The system shall generate and display the official Ticket Number immediately after a Ticket is successfully created. |
| FR-04 | The system shall let the current Requester attach up to 5 active supporting files to a Ticket, either during creation or afterward from Ticket Detail. |
| FR-05 | The system shall list only the current Requester's own Tickets in My Tickets. |
| FR-06 | The system shall let the current Requester search their Tickets by Ticket Number or Summary. |
| FR-07 | The system shall let the current Requester filter their Tickets by Category, Requested Priority, and Current Status. |
| FR-08 | The system shall let the current Requester sort their Tickets by Created Date, Ticket Number, Summary, Requested Priority, or Current Status. |
| FR-09 | The system shall paginate My Tickets results with page/pageSize metadata. |
| FR-10 | The system shall let the current Requester open a read-only Ticket Detail screen for any Ticket they own. |
| FR-11 | The system shall let the current Requester download any active Attachment they own, and shall prevent downloading a removed Attachment. |
| FR-12 | The system shall let the current Requester soft-remove an Attachment they own, optionally with a reason. |
| FR-13 | The system shall let the current Requester switch to a different active Requester via a Change Requester action, reloading all Requester-scoped data. |
| FR-14 | The system shall reject any attempt — via direct URL, forged request, or otherwise — to view or modify a Ticket or Attachment not owned by the current Requester. |

## 5. Business Rules

| BR ID | Business Rule |
| --- | --- |
| BR-01 | The official Ticket Number is generated by the backend and must be unique. |
| BR-02 | A new Ticket begins with Current Status `New`. |
| BR-03 | Lab 2 uses a Development Requester selector instead of login. The selected identity is for testing only and is not authentication. |
| BR-04 | Ticket Date (`createdAt`) is system-generated at creation time; it is read-only and never entered by the Requester. |
| BR-05 | The Requester field on Create Ticket is populated from the currently selected Development Requester and is read-only; it cannot be typed or changed on the form. |
| BR-06 | The Ticket Number format is `TKT-<4-digit year>-<6-digit zero-padded sequence>` (e.g. `TKT-2026-000042`) and is not shown to the Requester until the Ticket is successfully created. |
| BR-07 | Category and Related System must be chosen from the active, seeded reference lists; free-text values are not accepted. |
| BR-08 | Requested Priority must be explicitly chosen from Low, Medium, or High; the field has no pre-selected default, and submission is blocked until a value is chosen. |
| BR-09 | The Development Requester Selection screen lists only active (`isActive = true`) Requesters, ordered by name ascending. |
| BR-10 | The selected Requester's identity is persisted client-side only (browser storage) for the duration of the browser session/device. It is not a server-side session and grants no trust beyond convenience — every API call must still carry the Requester's id explicitly. |
| BR-11 | A "Change Requester" action is available from the application shell at all times; choosing a new Requester clears the previous Requester's client-side context and returns to the Development Requester Selection screen. |
| BR-12 | If no Development Requester is currently selected — first visit, cleared storage, or the previously selected Requester is no longer active — any attempt to open My Tickets, Create Ticket, or Ticket Detail redirects to the Development Requester Selection screen. |
| BR-13 | Every Ticket belongs to exactly one Requester (`Ticket.requesterId`), set once at creation from the currently selected Requester and never reassigned in Lab 2. |
| BR-14 | A Requester may only retrieve, list, or act on Tickets and Attachments they own. The backend enforces this on every Requester-scoped endpoint regardless of what the client claims. |
| BR-15 | An access attempt for a Ticket or Attachment owned by a different Requester returns a not-found response. The API must not reveal whether the resource exists but belongs to someone else versus not existing at all (prevents ID enumeration). |
| BR-16 | My Tickets search matches Ticket Number or Summary, case-insensitive, partial match, scoped to the current Requester's own tickets only. |
| BR-17 | My Tickets supports filtering by Category, Requested Priority, and Current Status; combined filters narrow results with AND logic. |
| BR-18 | My Tickets supports sorting by Created Date, Ticket Number, Summary, Requested Priority, and Current Status, ascending or descending. Default sort is Created Date descending (newest first). |
| BR-19 | My Tickets is paginated. Default page size is 10; maximum page size is 50. Out-of-range `page`/`pageSize` values are clamped to the nearest valid value rather than rejected. |
| BR-20 | Ticket Summary is required, trimmed of leading/trailing whitespace, and must be 5–120 characters after trimming. |
| BR-21 | Ticket Description is required, trimmed, and must be 10–2000 characters after trimming. |
| BR-22 | The Create Ticket Submit control is disabled while a request is in flight, preventing a duplicate Ticket from a repeated click on the same submission. |
| BR-23 | If Ticket creation fails (validation or server error), no Ticket is persisted and the Requester's entered field values remain in the form so nothing needs retyping. |
| BR-24 | If a Ticket is created successfully but a selected Attachment fails to upload (size, type, count limit, or transient failure), the Ticket is **not** rolled back. The Requester sees a per-file error for the failed upload(s) and can retry from Ticket Detail; successfully uploaded files remain attached. |
| BR-25 | Attachments accept only JPG, JPEG, PNG, WEBP, and PDF files (checked by file extension and declared content type), each at most 5 MB. |
| BR-26 | A Ticket may have at most 5 active (non-removed) Attachments at a time. Upload is rejected once the limit is reached until an existing Attachment is removed. |
| BR-27 | Removing an Attachment is a soft removal: the Attachment row is kept with `isRemoved = true`, `removedAt`, and an optional `removedReason`. The underlying file is not deleted from storage. |
| BR-28 | A removed Attachment remains visible in the Ticket Detail attachment list as metadata (name, size, removed date) but cannot be downloaded or previewed; any download attempt for it fails safely. |
| BR-29 | Uploading, downloading, and removing an Attachment are ownership-checked against the current Requester exactly like Ticket access (BR-14, BR-15). |
| BR-30 | My Tickets shows an **empty** state (distinct from **no-results**) when the current Requester has zero Tickets in total, regardless of filters. It shows a **no-results** state when the Requester owns at least one Ticket but the current search/filter combination matches none. |
| BR-31 | The Development Requester Selection screen and its "for testing only" messaging exist solely for Lab 2. Lab 3 replaces the selector with real authenticated sessions; Ticket ownership migrates from the temporary `RequesterUser` selection to the authenticated user without changing the meaning of the Ticket–Requester relationship. The implementation must resolve "current requester" through a single backend helper and a single frontend API-client wrapper (not inlined per endpoint/call site) so this swap touches two seams, not every request — see §11-1. |

## 6. UI Specification Summary

Full detail lives in [`ui-spec.md`](./ui-spec.md). Summary:

- **Application shell**: TokTickIT identity, My Tickets / Create Ticket nav,
  current Requester display + Change Requester action, active-page
  indication, responsive mobile navigation.
- **Development Requester Selection**: dropdown of active Requesters,
  "testing only, not login" messaging, loading/empty/API-failure states,
  keyboard-accessible controls.
- **Create Ticket**: system-generated fields visually distinct and
  read-only (Ticket Number shown only after success, Ticket Date, Requester);
  classification fields grouped (Category, Related System, Requested
  Priority); Summary/Description given full width; Attachments below the
  main fields; primary (Submit) + secondary (Cancel) actions at the bottom;
  field-level validation messages; busy Submit state; success state showing
  the generated Ticket Number.
- **My Tickets**: search box, Category/Priority/Status filters, Clear
  Filters, Create Ticket action, sortable columns, pagination, desktop table
  / mobile card representation, empty vs no-results states, badge styling
  for Requested Priority and Current Status.
- **Requester Ticket Detail**: all Ticket fields read-only, grouped
  separately from the Attachment section; Attachment list shows
  active/removed state, upload control (disabled at the 5-attachment cap),
  download action (active only), remove action with confirmation.
- All screens follow the Zen Green tokens in §7 of the handout (reproduced
  in `ui-spec.md`) and the responsive rules (desktop ≥ 992px, tablet
  768–991px, mobile < 768px — no horizontal scrolling at any size).

## 7. Data Changes

New PostgreSQL concepts required by this sprint: `RequesterUser`, `Ticket`,
`Attachment`, `RelatedSystem`, plus additive changes to the existing
`Category` model. This section documents the target design; it is **not**
applied to `server/prisma/schema.prisma` by this specification task — that
happens in the implementation phase.

### 7.1 Relationships

- One `RequesterUser` owns many `Ticket`s (1:N).
- One `Ticket` belongs to exactly one `RequesterUser` (N:1).
- One `Ticket` may have many `Attachment`s (1:N).
- One `Category` may be used by many `Ticket`s (1:N).
- One `RelatedSystem` may be used by many `Ticket`s (1:N).

### 7.2 Target Prisma Schema

```prisma
model RequesterUser {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  tickets Ticket[]
}

model Category {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  tickets Ticket[]
}

model RelatedSystem {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  tickets Ticket[]
}

enum RequestedPriority {
  LOW
  MEDIUM
  HIGH
}

enum TicketStatus {
  NEW
  OPEN
  IN_PROGRESS
  PENDING
  RESOLVED
  CLOSED
  CANCELLED
}

model Ticket {
  id                Int               @id @default(autoincrement())
  ticketNumber      String            @unique
  requesterId       Int
  requester         RequesterUser     @relation(fields: [requesterId], references: [id])
  categoryId        Int
  category          Category          @relation(fields: [categoryId], references: [id])
  relatedSystemId   Int
  relatedSystem     RelatedSystem     @relation(fields: [relatedSystemId], references: [id])
  summary           String
  description       String
  requestedPriority RequestedPriority
  currentStatus     TicketStatus      @default(NEW)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  attachments Attachment[]

  @@index([requesterId])
  @@index([categoryId])
  @@index([relatedSystemId])
  @@index([currentStatus])
  @@index([createdAt])
}

model Attachment {
  id               Int       @id @default(autoincrement())
  ticketId         Int
  ticket           Ticket    @relation(fields: [ticketId], references: [id])
  originalFileName String
  storedFileName   String    @unique
  mimeType         String
  sizeBytes        Int
  uploadedAt       DateTime  @default(now())
  isRemoved        Boolean   @default(false)
  removedAt        DateTime?
  removedReason    String?

  @@index([ticketId])
  @@index([ticketId, isRemoved])
}
```

### 7.3 Design Notes and Justification

- **`ticketNumber` uniqueness (BR-01, BR-06)**: generated from the row's own
  autoincrementing `id` immediately after insert (`TKT-<year>-<id padded to
  6 digits>`), avoiding a separately-tracked counter that could race under
  concurrent creates.
- **`isActive` added to `Category`**: the API contract requires "retrieve
  active Categories" (handout §6), which only makes sense if a Category can
  be inactive. This is an additive, backward-compatible column on the
  existing model.
- **`RelatedSystem` mirrors `Category`'s shape** (id, name, isActive,
  createdAt) since both are simple, admin-managed reference lists with
  identical required behavior (active-only retrieval, unique name).
- **`TicketStatus` includes values beyond `New`** (Open, In Progress,
  Pending, Resolved, Closed, Cancelled) even though Lab 2 never writes any
  value other than `NEW` through its own APIs. The My Tickets screen must
  support filtering/sorting/badges by Current Status (handout Fig. on p.11
  shows multiple statuses), so seed data populates other statuses directly;
  no Lab 2 endpoint transitions a Ticket's status.
- **Soft removal on `Attachment`** (`isRemoved`, `removedAt`,
  `removedReason`) instead of deleting the row, per BR-27/BR-28 — the row
  and its metadata must remain visible after removal.
- **No IT-Staff-only columns** (IT Priority, Ticket Owner, Resolution
  Summary) are added in Lab 2. See §11 for rationale.
- **Indexes**: FK columns (`requesterId`, `categoryId`, `relatedSystemId`,
  `ticketId`) are indexed for join/filter performance; `currentStatus` and
  `createdAt` are indexed because My Tickets filters and sorts by them by
  default. Search (`search` query param against `ticketNumber`/`summary`)
  uses a case-insensitive `ILIKE` scan with no dedicated text index — see
  Known Limitations in `tests.md`; acceptable at Lab 2's seed-data scale.
- **Lab 3 evolution**: `RequesterUser` is a placeholder for a future
  authenticated `User`/`Account` model. `Ticket.requesterId` is expected to
  be re-pointed (via migration) at the authenticated user's id without
  changing its semantics — see BR-31. Only the *identification* step
  (how the backend learns the current requester id, and how the frontend
  supplies it) changes in Lab 3; the *ownership-check* logic (BR-14/BR-15)
  is written generically against a requester id argument and needs no
  change. That property only holds if identification is centralized behind
  one backend helper and one frontend API-client wrapper rather than
  inlined at every call site — see §11-1.

### 7.4 Required Seed Data

- 4 Categories: Account and Access, Hardware, Software, Network
- ≥ 6 Related Systems: Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission
  App, Printer, Corporate Laptop
- ≥ 4 active `RequesterUser` rows with realistic names/emails
- ≥ 1 inactive `RequesterUser` row (must never appear in the Development
  Requester Selection dropdown)
- A spread of seeded Tickets per active Requester, including: enough for
  at least one Requester to exceed one page at the default page size (to
  exercise pagination), at least one Requester with zero Tickets (to
  exercise the empty state), and Tickets across multiple `TicketStatus` and
  `RequestedPriority` values (to exercise filters, sorting, and badges)
- Seed logic is idempotent (safe to run repeatedly without duplicating
  rows), consistent with the existing `prisma/seed.ts` `upsert` pattern

## 8. API Contract

Full detail lives in [`api-spec.md`](./api-spec.md). Endpoint summary:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/dev-requesters` | List active Development Requesters |
| GET | `/api/categories` | List active Categories |
| GET | `/api/related-systems` | List active Related Systems |
| POST | `/api/tickets` | Create a Ticket for the current Requester |
| GET | `/api/tickets` | Search/filter/sort/paginate the current Requester's Tickets |
| GET | `/api/tickets/:id` | Retrieve one owned Ticket, with its attachments |
| POST | `/api/tickets/:id/attachments` | Upload an Attachment to an owned Ticket |
| GET | `/api/attachments/:id/download` | Download an active, owned Attachment |
| PATCH | `/api/attachments/:id/remove` | Soft-remove an owned Attachment |

Every endpoint above except the three reference-data `GET`s requires the
current Requester's id (BR-10) and enforces ownership per BR-14/BR-15.

## 9. Acceptance Criteria

| ID | Criterion |
| --- | --- |
| AC-01 | Given valid Ticket data, when the Requester submits the form, then one Ticket is saved and the official Ticket Number is displayed. |
| AC-02 | Given no Development Requester is selected, when the user attempts to open My Tickets, then the Development Requester Selection screen is shown. |
| AC-03 | Given Requester B is selected, when a Ticket belonging to Requester A is requested, then the Ticket data is not returned. |
| AC-04 | Given the Create Ticket form is submitted without a Summary, when validation runs, then a field-level error appears under Summary and no request is sent to the API. |
| AC-05 | Given the Create Ticket form is submitted with a Description shorter than 10 characters, when validation runs, then a field-level error appears under Description and no Ticket is created. |
| AC-06 | Given no Requested Priority is chosen, when the Requester submits, then a field-level error appears under Requested Priority and no Ticket is created. |
| AC-07 | Given the Requester clicks Submit twice in quick succession, when the first request is still in flight, then only one Ticket is created and the button shows a disabled/busy state. |
| AC-08 | Given the backend rejects Ticket creation with a server error, when the failure response is received, then the entered field values remain visible and a safe error message is shown, with no Ticket created. |
| AC-09 | Given a Ticket was just created, when the Requester attaches a valid 2 MB JPG, then the Attachment is stored, appears in the active attachment list, and counts toward the 5-attachment limit. |
| AC-10 | Given a Ticket already has 5 active Attachments, when the Requester attempts to upload a 6th file, then the upload is rejected with a limit-reached message and no 6th Attachment is stored. |
| AC-11 | Given the Requester selects a 6 MB PDF, when upload is attempted, then it is rejected with a file-size error and no Attachment row is created. |
| AC-12 | Given the Requester selects a `.exe` file, when upload is attempted, then it is rejected with an unsupported-file-type error and no Attachment row is created. |
| AC-13 | Given a Ticket was created but one selected Attachment failed to upload, when the Requester views the result, then the Ticket exists with its official Ticket Number, the failed file shows a retryable error, and any other successfully uploaded files remain attached. |
| AC-14 | Given an active Attachment, when the Requester removes it and confirms, then it is marked removed, disappears from the downloadable list, but still appears in the attachment list as removed metadata. |
| AC-15 | Given a removed Attachment, when a download is attempted directly, then the request fails safely and no file is returned. |
| AC-16 | Given the current Requester has Tickets whose Summary contains "VPN", when they search "vpn" in My Tickets, then only matching Tickets (case-insensitive) are shown. |
| AC-17 | Given the current Requester filters My Tickets by Category = Hardware and Current Status = Open, when the filters are applied, then only Tickets matching both conditions are shown. |
| AC-18 | Given the current Requester has more Tickets than one page, when they open My Tickets, then only the first page is shown along with correct pagination controls and total counts. |
| AC-19 | Given the current Requester's filtered results are empty but they own at least one Ticket overall, when My Tickets renders, then a no-results state with a Clear Filters action is shown, not the empty-account state. |
| AC-20 | Given the current Requester owns zero Tickets, when My Tickets renders with no filters applied, then an empty state inviting them to create their first Ticket is shown. |
| AC-21 | Given the Development Requester Selection screen loads, when the active-Requesters request fails, then a safe error state is shown with no dropdown crash. |
| AC-22 | Given the seeded inactive Requester, when the Development Requester Selection dropdown is loaded, then the inactive Requester does not appear in the list. |
| AC-23 | Given a Requester is selected, when they use Change Requester and pick a different Requester, then the previous Requester's ticket data no longer appears anywhere in the app. |
| AC-24 | Given a Ticket owned by the current Requester, when they open its Ticket Detail screen, then all Ticket fields render read-only with no editable Status, IT Priority, or Comment controls. |
| AC-25 | Given the viewport is narrowed to mobile width, when My Tickets, Create Ticket, and Ticket Detail are viewed, then no horizontal scrolling occurs and all controls remain reachable and legible. |
| AC-26 | Given a required field is left empty, when its error message renders, then it appears immediately below that field, not only in a page-level summary. |

## 10. Definition of Done

### Product Completion

- [ ] All scoped screens implemented: Development Requester Selection,
      Create Ticket, My Tickets, Requester Ticket Detail, Attachment
      lifecycle (upload/download/soft-remove)
- [ ] Every acceptance criterion (AC-01–AC-26) has passing, traceable
      automated test evidence per `tests.md`
- [ ] No required test is skipped, disabled, or commented out
- [ ] Ownership isolation (BR-14/BR-15) is verified by at least one
      automated test per Requester-scoped endpoint
- [ ] Attachment constraints (type, size, count, soft removal) match §4.5
      of the handout and BR-25–BR-29 exactly
- [ ] Implemented screens and APIs conform to `ui-spec.md` and
      `api-spec.md`
- [ ] Zen Green tokens match §7 of the handout; responsive rules (desktop /
      tablet / mobile) hold with no clipping, overlap, or horizontal
      scrolling
- [ ] Success, failure, validation, loading, empty, and no-results states
      are implemented and covered by tests for every screen that needs them
- [ ] `README.md` setup and test instructions are current
- [ ] All required tests pass from documented commands on the final `main`
      branch

### Course Delivery Requirements (checked separately from Product Completion)

- [ ] Work delivered via GitHub Issues and feature branches into
      `lab2-staging`, then one release Pull Request into `main`
- [ ] Peer review completed and recorded in `reviewer.md`
- [ ] Review comments addressed
- [ ] Required repository documents present: `specification.md`,
      `tests.md`, `ui-spec.md`, `api-spec.md`, `reviewer.md`, `ai-use.md`
- [ ] Submission PDF assembled per the handout's Part 1–9 format

## 11. Assumptions and Decisions

Every item below is an interpretation this specification made where the
handout left the choice to the student. Review each one; anything marked
**(reversible)** is cheap to change before implementation, anything marked
**(structural)** touches the API/schema shape and is more costly to change
after the coding agent starts.

1. **(structural) Requester-context transport.** The client persists the
   selected `requesterId` in browser storage and sends it explicitly on
   every API call (query param on GETs, body field on mutations) rather
   than a server-side pseudo-session cookie. Derived from the stakeholder
   text ("the selected Requester becomes the current testing context") read
   alongside BR-03's warning not to build anything resembling real
   authentication — a server session is closer to real auth than a client-
   remembered id is.
   **Lab 3 migration requirement**: this only stays a clean, low-cost swap
   if *identification* ("who is asking?") is implemented behind a single
   seam on each side — one backend helper (e.g. `getCurrentRequesterId(req)`)
   that every route handler calls instead of reading `req.query`/`req.body`
   directly, and one frontend API-client wrapper that every screen calls
   instead of attaching `requesterId` ad hoc per request. *Authorization*
   ("do they own this?", BR-14/BR-15) already takes a requester id as a
   plain argument and doesn't care where it came from, so it needs no
   change at all. Lab 3 then only replaces the two identification seams
   (session/JWT-derived id instead of a trusted client-supplied one)
   instead of touching every endpoint and every call site. The coding
   agent must build to this seam, not inline the lookup — see BR-31 and
   §7.3.
2. **(reversible) Attachment removal reason is optional**, not required and
   not omitted. The stakeholder request never mentions an audit reason;
   optional keeps removal fast while still allowing one when it matters.
3. **(structural) No IT-Staff-only columns in the Lab 2 schema** (IT
   Priority, Ticket Owner, Resolution Summary). Directly supported by
   §4.2 (IT Staff workflow excluded) and §5 (required concepts list omits
   them). They arrive via a Lab 3/4 migration instead of being pre-built
   nullable columns now.
4. **(reversible) Ticket Number format**: `TKT-<year>-<6-digit id>`,
   matching the illustrative screenshot's shape (`TKT-2025-001234`).
5. **(structural) Ownership failures return 404, not 403.** Chosen so the
   API never confirms that a Ticket/Attachment exists but belongs to
   someone else (BR-15) — a 403 would leak that information.
6. **(structural) Attachment storage is local disk** under a
   `server`-relative, gitignored uploads directory, with a random stored
   filename (collision/path-traversal-safe) and the original filename kept
   only as a display column. No cloud/object storage is introduced for this
   lab-scale MVP.
7. **(reversible) Requested Priority has no default** — the Requester must
   actively choose Low/Medium/High. Priority materially affects triage, so
   silently defaulting it felt wrong; happy to switch to a Medium default if
   preferred.
8. **(reversible) `TicketStatus` enum includes values beyond `New`**
   (Open, In Progress, Pending, Resolved, Closed, Cancelled) purely so seed
   data can populate My Tickets with realistic filter/sort/badge variety, as
   shown in the handout's example screenshot. No Lab 2 endpoint ever writes
   a status other than `NEW`.
9. **(reversible) Pagination defaults**: page size 10 (default) / 50 (max),
   1-based `page`, out-of-range values clamped rather than rejected —
   friendlier UX for a stray or stale query string. Full contract is in
   `api-spec.md`.
10. **(reversible) Duplicate-submission prevention is client-side only**
    (disabled/busy Submit button); no server-side idempotency key. Adequate
    for this lab's realistic concurrency; noted as a documented limitation
    in `tests.md` with an upgrade path if it ever matters.
11. **(reversible) Field length limits**: Summary 5–120 characters,
    Description 10–2000 characters, both trimmed. Chosen as reasonable
    bounds for a support-ticket form; not specified by the handout.
12. **(structural) Attachment upload and Ticket creation are separate API
    calls.** The Create Ticket screen presents them together, but the
    client creates the Ticket first, then uploads each selected file
    against the new Ticket's id. This is what makes "behavior when a Ticket
    is created but attachment upload fails" (handout §4.5) a real,
    definable scenario — see BR-24.
13. **(reversible) Search has no dedicated text index** — case-insensitive
    `ILIKE` against `ticketNumber`/`summary`. Fine at seed-data scale;
    called out as a known limitation rather than a premature optimization.
