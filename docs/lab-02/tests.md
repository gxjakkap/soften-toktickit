# Lab 2 Test Plan and Results

This plan is written from `specification.md` and `api-spec.md` before any
implementation code exists (Test DD — see handout §9). It is the contract
the coding agent must satisfy; it is not to be reconstructed afterward from
whatever tests happen to get generated.

## 1. Test Strategy

- **Unit** — pure logic with no DB/HTTP: Ticket Number formatting,
  attachment filename/type validation, Requester-context resolution rules.
  Vitest, colocated under `server/tests/lab-02/`.
- **API / integration** — Supertest against the Express app with a real
  test database, one file per resource area, matching the required minimum
  structure (handout §12). Covers every endpoint, status code, and
  ownership rule in `api-spec.md`.
- **UI component** — Vitest + Testing Library, one file per screen/major
  component under `client/tests/lab-02/`, following the existing Lab 1
  convention of tests living in `tests/`, not next to source.
- **UI style / responsive / visual** — Playwright, asserting required CSS
  classes/field states plus screenshots at desktop/tablet/mobile viewports,
  checked against `ui-spec.md` §12 rather than personal judgment.
- **E2E** — Playwright, full user flows spanning Requester selection →
  ticket creation → My Tickets → Ticket Detail → attachment lifecycle,
  including cross-Requester isolation.

Every row in §2 traces to at least one Acceptance Criterion, Business Rule,
or Functional Requirement in `specification.md`. Every Acceptance Criterion
is covered by at least one row (§3 matrix).

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| SCHEMA-01 | Integration | BR-01 | `Ticket.ticketNumber` unique constraint | A second insert with the same ticket number is rejected by the database | `server/tests/lab-02/schema.integration.test.ts` | Pass |
| SCHEMA-02 | Integration | BR-02, BR-04 | `Ticket` system-generated defaults | `currentStatus` defaults to `NEW`; `createdAt`/`updatedAt` are stamped without being supplied | `server/tests/lab-02/schema.integration.test.ts` | Pass |
| SCHEMA-03 | Integration | BR-07, BR-13 | `Ticket` foreign-key integrity | Insert with an unknown `requesterId`, `categoryId` or `relatedSystemId` is rejected | `server/tests/lab-02/schema.integration.test.ts` | Pass |
| SCHEMA-04 | Integration | specification.md §7.2 | Column nullability | Required Ticket/Attachment columns are `NOT NULL`; `removedAt`/`removedReason` are nullable | `server/tests/lab-02/schema.integration.test.ts` | Pass |
| SCHEMA-05 | Integration | BR-17, BR-18 | Search/filter/sort index coverage | Indexes exist on `requesterId`, `categoryId`, `relatedSystemId`, `currentStatus`, `createdAt` | `server/tests/lab-02/schema.integration.test.ts` | Pass |
| SCHEMA-06 | Integration | BR-27 | Attachment soft-removal defaults and ticket cascade | New attachments start `isRemoved: false` with null removal fields; deleting a Ticket removes its Attachment rows | `server/tests/lab-02/schema.integration.test.ts` | Pass |
| SCHEMA-07 | Integration | BR-07, BR-13 | Reference and requester rows in use | Deleting a Category, Related System or Requester still referenced by a Ticket is refused | `server/tests/lab-02/schema.integration.test.ts` | Pass |
| SCHEMA-08 | Integration | specification.md §7.4 | Seed idempotency | Seeds the 4 Categories and 7 Related Systems as active; a second run yields identical rows and ids | `server/tests/lab-02/seed-idempotency.integration.test.ts` | Pass |
| UNIT-01 | Unit | BR-06, AC-01 | Ticket Number generator | Returns `TKT-<year>-<6-digit>` from a given id/year | `server/tests/lab-02/ticket-number.unit.test.ts` | Planned |
| UNIT-02 | Unit | BR-25 | Attachment filename/type validator | Accepts jpg/jpeg/png/webp/pdf, rejects everything else and path-unsafe names | `server/tests/lab-02/attachment-filename.unit.test.ts` | Pass |
| UNIT-03 | Unit | BR-10, BR-12 | Requester-context resolver | Rejects a `requesterId` that is missing, unknown, or inactive | `server/tests/lab-02/requester-context.unit.test.ts` | Planned |
| API-01 | API | AC-01 | `POST /api/tickets` valid body | 201; one row saved; response includes `ticketNumber` | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-02 | API | AC-04 | `POST /api/tickets` missing summary | 400 `VALIDATION_ERROR` field `summary`; no row inserted | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-03 | API | AC-05 | `POST /api/tickets` description < 10 chars | 400 `VALIDATION_ERROR` field `description`; no row inserted | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-04 | API | AC-06 | `POST /api/tickets` missing `requestedPriority` | 400 `VALIDATION_ERROR` field `requestedPriority` | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-05 | API | BR-12 | `POST /api/tickets` inactive/unknown `requesterId` | 400 `INVALID_REQUESTER`; no row inserted | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-06 | API | AC-03 | `GET /api/tickets` cross-Requester scope | Requester B's list never includes Requester A's tickets | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-07 | API | AC-16 | `GET /api/tickets?search=vpn` | Case-insensitive partial match on `ticketNumber`/`summary` only | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-08 | API | AC-17 | `GET /api/tickets?categoryId=&status=` | AND-combined filters return only matching rows | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-09 | API | AC-18 | `GET /api/tickets` pagination metadata | Correct `page`/`pageSize`/`totalCount`/`totalPages` | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-10 | API | BR-19 | `GET /api/tickets` out-of-range `page`/`pageSize` | Clamped to valid bounds, not rejected | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-11 | API | AC-20 | `GET /api/tickets` for a Requester with zero tickets | `data: []`, `hasAnyTickets: false` | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-12 | API | AC-19 | `GET /api/tickets` filters matching nothing | `data: []`, `hasAnyTickets: true`, `totalCount: 0` | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-13 | API | AC-24 | `GET /api/tickets/:id` owned | 200 with full detail + attachments | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-14 | API | AC-03 | `GET /api/tickets/:id` not owned | 404 `NOT_FOUND` (not 403) | `server/tests/lab-02/ticket-detail.api.test.ts` | Pass |
| API-15 | API | AC-09 | `POST /api/tickets/:id/attachments` valid 2MB jpg | 201; appears in active attachment list | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-16 | API | AC-10 | Upload at 5-active-attachment cap | 409 `ATTACHMENT_LIMIT_REACHED`; no 6th row | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-17 | API | AC-11 | Upload 6MB pdf | 413 `FILE_TOO_LARGE`; no row created | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-18 | API | AC-12 | Upload `.exe` | 415 `UNSUPPORTED_FILE_TYPE`; no row created | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-19 | API | FR-11 | `GET /api/attachments/:id/download` active | 200, correct `Content-Type`/`Content-Disposition`, byte-identical to upload | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-20 | API | AC-15 | Download a removed attachment | 410 `ATTACHMENT_REMOVED`; no file returned | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-21 | API | AC-14 | `PATCH /api/attachments/:id/remove` | 200; `isRemoved: true`, `removedAt` set, row retained | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-22 | API | BR-29 | Remove an attachment not owned by caller | 404 `NOT_FOUND` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-23 | API | AC-13 | Attachment upload fails after Ticket creation succeeds | Ticket row still exists unmodified; only the attachment call fails | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-24 | API | AC-22 | `GET /api/dev-requesters` | Only `isActive: true` rows, ordered by name | `server/tests/lab-02/dev-requesters.api.test.ts` | Planned |
| API-25 | API | FR-02 (ref data) | `GET /api/categories`, `GET /api/related-systems` | Only active rows returned | `server/tests/lab-02/dev-requesters.api.test.ts` | Planned |
| UI-01 | UI | AC-22 | DevRequesterSelection active-list rendering | Inactive seeded Requester never appears; Continue disabled until chosen | `client/tests/lab-02/DevRequesterSelection.test.tsx` | Planned |
| UI-02 | UI | AC-21 | DevRequesterSelection API failure | Safe error state shown, no crash, no dropdown left in a broken state | `client/tests/lab-02/DevRequesterSelection.test.tsx` | Planned |
| UI-03 | UI | AC-02 | Opening My Tickets/Create Ticket/Ticket Detail with no stored Requester | Redirects to Development Requester Selection | `client/tests/lab-02/DevRequesterSelection.test.tsx` | Planned |
| UI-04 | UI | AC-23 | Change Requester flow | Previous Requester's ticket data is gone after switching | `client/tests/lab-02/DevRequesterSelection.test.tsx` | Planned |
| UI-05 | UI | AC-04, AC-26 | CreateTicket blank Summary | Field-level error directly under Summary; API not called | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-06 | UI | AC-07 | CreateTicket double-submit | Submit shows Busy/disabled state; only one API call fires | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-07 | UI | AC-08 | CreateTicket server failure | Entered values preserved; safe error banner shown | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-08 | UI | AC-01 | CreateTicket success | Generated Ticket Number shown in success state | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-09 | UI | AC-11 | CreateTicket oversized file, client-side | Per-file error shown before any upload request fires | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-10 | UI | AC-20 | MyTickets empty state | Empty-account copy + Create Ticket CTA, no filter UI implying data exists | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-11 | UI | AC-19 | MyTickets no-results state | No-results copy + Clear Filters, distinct from empty state | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-12 | UI | AC-18 | MyTickets pagination controls | Page navigation updates the list and the "Showing X to Y of Z" text | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-13 | UI | AC-16 | MyTickets search input | List filters as the Requester types a search term | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-14 | UI | AC-24 | RequesterTicketDetail read-only rendering | All Ticket fields read-only; no Comment/Status/IT Priority controls present | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-15 | UI | AC-14, AC-15 | AttachmentSection active vs removed | Active shows Download; removed shows metadata only, no Download action | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-16 | UI | AC-10 | AttachmentSection at the 5-attachment cap | Upload control shows disabled state with limit explanation | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| STYLE-01 | UI style | ui-spec.md §3–4 | CreateTicket field/button classes | Required CSS classes/tokens present for editable, read-only, invalid, disabled, busy states | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| STYLE-02 | Visual/Responsive | AC-25 | Create Ticket screenshots | Desktop/tablet/mobile screenshots match `ui-spec.md`, no clipping/overlap/scroll | `e2e/lab-02/requester-ticket-flow.spec.ts` → `artifacts/lab-02/screenshots/create-ticket/` | Planned |
| STYLE-03 | Visual/Responsive | AC-25 | My Tickets screenshots | Desktop table vs. mobile card, no horizontal scroll | `e2e/lab-02/requester-ticket-flow.spec.ts` → `artifacts/lab-02/screenshots/my-tickets/` | Planned |
| STYLE-04 | Visual/Responsive | AC-25 | Ticket Detail screenshots | All three viewports legible, no clipping/overlap | `e2e/lab-02/requester-ticket-flow.spec.ts` → `artifacts/lab-02/screenshots/ticket-detail/` | Planned |
| E2E-01 | E2E | AC-01, AC-09, AC-16, AC-24 | Full create → find → open flow | Select Requester, create ticket w/ attachment, find via search in My Tickets, open Ticket Detail and confirm data + attachment | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-02 | E2E | AC-03, AC-23 | Cross-Requester isolation | Requester A's ticket invisible to Requester B in list and direct navigation | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-03 | E2E | AC-14, AC-15 | Attachment lifecycle | Upload → download succeeds → soft-remove → download now fails safely | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |

## 3. Acceptance-Criterion Traceability Matrix

| AC | Covered by |
| --- | --- |
| AC-01 | API-01, UI-08, E2E-01 |
| AC-02 | UI-03 |
| AC-03 | API-06, API-14, E2E-02 |
| AC-04 | API-02, UI-05 |
| AC-05 | API-03 |
| AC-06 | API-04 |
| AC-07 | UI-06 |
| AC-08 | UI-07 |
| AC-09 | API-15, E2E-01 |
| AC-10 | API-16, UI-16 |
| AC-11 | API-17, UI-09 |
| AC-12 | API-18 |
| AC-13 | API-23 |
| AC-14 | API-21, UI-15, E2E-03 |
| AC-15 | API-20, UI-15, E2E-03 |
| AC-16 | API-07, UI-13, E2E-01 |
| AC-17 | API-08 |
| AC-18 | API-09, UI-12 |
| AC-19 | API-12, UI-11 |
| AC-20 | API-11, UI-10 |
| AC-21 | UI-02 |
| AC-22 | API-24, UI-01 |
| AC-23 | UI-04, E2E-02 |
| AC-24 | API-13, UI-14, E2E-01 |
| AC-25 | STYLE-02, STYLE-03, STYLE-04 |
| AC-26 | UI-05 |

Every AC-01–AC-26 has at least one row; every planned test names a real
file path under the required minimum Lab 2 structure (handout §12),
extended with `dev-requesters.api.test.ts` and
`DevRequesterSelection.test.tsx`/`AttachmentSection.test.tsx` since the
handout's list is a stated minimum, not a ceiling.

## 4. Responsive / Visual Checklist

Mirrors `ui-spec.md` §12 — completed with screenshot evidence during
implementation:

- [x] No clipped labels at any viewport (desktop ≥992px, tablet 768–991px,
      mobile <768px)
- [x] No overlapping messages (validation, badges, toasts)
- [x] No unintended horizontal scrolling at any viewport
- [x] Consistent field styling (editable/read-only/invalid/disabled) across
      Create Ticket and Ticket Detail
- [x] Badge colors/labels consistent for the same Priority/Status value
      across My Tickets and Ticket Detail (`badges.tsx` is now the single
      source for both screens — Issue 8 found and fixed a class-name/icon
      drift between them)
- [x] Filters, pagination, and attachment controls remain usable at all
      three viewports
- [x] Desktop table ↔ mobile card transformation on My Tickets preserves
      all information

Verified 2026-09-05 (Issue 8, Zen Green styling/responsive polish pass) via
live browser automation against the real app at desktop (1280px), tablet
(850px), and mobile (500px, this session's floor below 768px) widths —
screenshots below. Playwright still isn't part of this workspace (§7), so
this is manual verification, not an automated visual-regression suite.

## 5. Test Commands

To be run once implementation exists (not yet — this is a pre-code spec
deliverable):

```bash
# Server: unit + API/integration tests (Vitest + Supertest)
pnpm --filter server test

# Client: UI component + style tests (Vitest + Testing Library)
pnpm --filter client test

# E2E + visual/responsive screenshots (Playwright)
# NOTE: Playwright is not yet part of this workspace — see Known Limitations.
npx playwright test e2e/lab-02
```

## 6. Final Results

Updated as of Issue 7 (Requester Ticket Detail and Attachment Lifecycle),
following Issue 6 (My Tickets). Issue 6 implements API-06 through API-12,
UI-10 through UI-13; Issue 7 implements API-13, API-14, API-19, API-20,
API-21, UI-14, UI-15, UI-16. All are marked `Pass` in §2, confirmed by:

```bash
pnpm --filter server test   # 81/81 passing
pnpm --filter client test   # 71/71 passing
```

Also added by Issue 6, beyond the rows tests.md enumerated by name: an
`INVALID_FILTER` 400 test for an unrecognized `requestedPriority`/`status`/
`sortBy`/`sortDir` or non-numeric `categoryId` (api-spec.md §5's failure
table), and a `sortBy=summary` + default-sort-tie-break test (BR-18) — both
in `my-tickets.api.test.ts` alongside the numbered API-06..12 rows.

Rows owned by other issues (E2E) are still `Planned` and get updated as
those issues land. STYLE-02 through STYLE-04 and the E2E rows also stay
`Planned`: they depend on Playwright, which isn't part of this workspace
yet (§7). Issue 7's own responsive check for Ticket Detail was done
manually via live browser automation against a ticket created through the
real API (desktop viewport confirmed directly; tablet/mobile resize was
not available in that session — see §7).

**Issue 8 (Zen Green styling and responsive polish)**: audited all four
screens against `ui-spec.md` and fixed real deviations — a duplicate/
conflicting `.zg-badge` CSS rule that silently dropped the icon+label gap,
a My-Tickets/Ticket-Detail badge class-name mismatch (`in-progress` vs.
`in_progress`) papered over by that same duplication, Ticket Detail's
status/priority badges missing the required distinguishing icon, no
Destructive button style anywhere (Remove Attachment used the tertiary/
link style), the removed-attachment row using the brand green instead of a
muted tone, the Remove Attachment dialog left in raw unthemed Bootstrap
styling, inconsistent 16/24px section spacing on Create Ticket, the
mobile header nav wrapping instead of collapsing behind a menu control (now
fixed — see `AppShell.tsx`), and Create Ticket's own post-submit attachment
list never exposing Download/Remove (now reuses `AttachmentSection` via a
new `bare`/`initialFiles` mode instead of a second, incomplete
implementation). Re-ran `pnpm --filter client test` after each fix
(65/65 passing throughout, `tsc --noEmit` clean).

Screenshots captured 2026-09-05 via live browser automation (`resize_window`
was unreliable for exact device widths in this session; desktop landed at
1280px, tablet at 850px, mobile at 500px — all within `ui-spec.md` §8's
bands) rather than Playwright, for the same reason as Issue 7 (§7).

## 7. Known Limitations or Deferred Tests

- **Search has no dedicated index.** `search` uses a case-insensitive
  `ILIKE` scan against `ticketNumber`/`summary`. Fine at Lab 2 seed-data
  scale; add a trigram/full-text index if ticket volume grows in a later
  lab.
- **No server-side idempotency key for ticket creation.** Duplicate-submit
  prevention (BR-22) is client-side (disabled/busy Submit button) only.
  Acceptable for this lab's realistic usage pattern; add an idempotency key
  if genuine duplicate-ticket incidents are ever observed.
- **File-type validation is extension + declared Content-Type, not
  magic-byte content sniffing.** Sufficient for the trust level of this lab
  (a Development Requester, not a hostile actor); magic-byte sniffing is a
  reasonable future hardening, not required by BR-25.
- **5-active-attachment limit enforcement is check-then-insert inside a
  Postgres `SERIALIZABLE` transaction** (`withSerializableRetry`,
  `server/src/lib/serializable-retry.ts`), not a plain read-then-write.
  Postgres' SSI implementation can raise a spurious "could not serialize
  access" conflict even between transactions that never really raced
  (page-granular predicate locking); Postgres' own docs require retrying
  on that error code, so the transaction is retried up to 3 times rather
  than surfaced to the Requester as a failure.
- **No automated accessibility (axe-core) scan is configured.** §7 of
  `ui-spec.md` is checked via the manual/visual checklist in §4 above, not
  an automated a11y test suite, for this lab.
- **Playwright is not yet an installed dependency** in this workspace
  (confirmed via `client/package.json` / `server/package.json` /
  `pnpm-workspace.yaml` — no `e2e` package exists yet). Adding it, plus an
  `e2e` workspace package or root devDependency, is implementation work for
  the "E2E testing" GitHub Issue, not part of this specification task.
