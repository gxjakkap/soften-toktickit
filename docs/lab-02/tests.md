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
| UNIT-01 | Unit | BR-06, AC-01 | Ticket Number generator | Returns `TKT-<year>-<6-digit>` from a given id/year | `server/tests/lab-02/ticket-number.unit.test.ts` | Pass |
| UNIT-02 | Unit | BR-25 | Attachment filename/type validator | Accepts jpg/jpeg/png/webp/pdf, rejects everything else and path-unsafe names | `server/tests/lab-02/attachment-filename.unit.test.ts` | Pass |
| UNIT-03 | Unit | BR-10, BR-12 | Requester-context resolver | Rejects a `requesterId` that is missing, unknown, or inactive | `server/tests/lab-02/requester-context.unit.test.ts` | Pass |
| UNIT-04 | Unit | BR-26 | SERIALIZABLE-retry helper (5-attachment cap concurrency, §7 below) | Retries a Postgres serialization failure (P2034) up to 3 times and returns the eventual result; gives up and rethrows after exhausting retries; rethrows immediately for a non-serialization error | `server/tests/lab-02/serializable-retry.unit.test.ts` | Pass |
| API-01 | API | AC-01 | `POST /api/tickets` valid body | 201; one row saved; response includes `ticketNumber` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-02 | API | AC-04 | `POST /api/tickets` missing summary | 400 `VALIDATION_ERROR` field `summary`; no row inserted | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-03 | API | AC-05 | `POST /api/tickets` description < 10 chars | 400 `VALIDATION_ERROR` field `description`; no row inserted | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-04 | API | AC-06 | `POST /api/tickets` missing `requestedPriority` | 400 `VALIDATION_ERROR` field `requestedPriority` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-05 | API | BR-12 | `POST /api/tickets` inactive/unknown `requesterId` | 400 `INVALID_REQUESTER`; no row inserted | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
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
| API-24 | API | AC-22 | `GET /api/dev-requesters` | Only `isActive: true` rows, ordered by name | `server/tests/lab-02/dev-requesters.api.test.ts` | Pass |
| API-25 | API | FR-02 (ref data) | `GET /api/categories`, `GET /api/related-systems` | Only active rows returned | `server/tests/lab-02/dev-requesters.api.test.ts` | Pass |
| UI-01 | UI | AC-22 | DevRequesterSelection active-list rendering | Inactive seeded Requester never appears; Continue disabled until chosen | `client/tests/lab-02/DevRequesterSelection.test.tsx` | Pass |
| UI-02 | UI | AC-21 | DevRequesterSelection API failure | Safe error state shown, no crash, no dropdown left in a broken state | `client/tests/lab-02/DevRequesterSelection.test.tsx` | Pass |
| UI-03 | UI | AC-02, BR-12 | Opening My Tickets/Create Ticket/Ticket Detail with no stored Requester, or with a stored Requester the server now rejects as `INVALID_REQUESTER` (deactivated since selection) | Redirects to Development Requester Selection in both cases; storage is cleared | `client/tests/lab-02/DevRequesterSelection.test.tsx` | Pass |
| UI-04 | UI | AC-23 | Change Requester flow | Previous Requester's ticket data is gone after switching | `client/tests/lab-02/DevRequesterSelection.test.tsx` | Pass |
| UI-05 | UI | AC-04, AC-26 | CreateTicket blank Summary | Field-level error directly under Summary; API not called | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-06 | UI | AC-07 | CreateTicket double-submit | Submit shows Busy/disabled state; only one API call fires | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-07 | UI | AC-08 | CreateTicket server failure | Entered values preserved; safe error banner shown | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-08 | UI | AC-01 | CreateTicket success | Generated Ticket Number shown in success state | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-09 | UI | AC-11 | CreateTicket oversized file, client-side | Per-file error shown before any upload request fires | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-10 | UI | AC-20 | MyTickets empty state | Empty-account copy + Create Ticket CTA, no filter UI implying data exists | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-11 | UI | AC-19 | MyTickets no-results state | No-results copy + Clear Filters, distinct from empty state | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-12 | UI | AC-18 | MyTickets pagination controls | Previous/Next, page-number buttons (ui-spec.md §11.3), and the "Showing X to Y of Z" text all update the list and reflect the current page | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-13 | UI | AC-16 | MyTickets search input | List filters as the Requester types a search term | `client/tests/lab-02/MyTickets.test.tsx` | Pass |
| UI-14 | UI | AC-24 | RequesterTicketDetail read-only rendering | All Ticket fields read-only; no Comment/Status/IT Priority controls present | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pass |
| UI-15 | UI | AC-14, AC-15 | AttachmentSection active vs removed | Active shows Download; removed shows metadata only, no Download action | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-16 | UI | AC-10 | AttachmentSection at the 5-attachment cap | Upload control shows disabled state with limit explanation | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| STYLE-01 | UI style | ui-spec.md §3–4 | CreateTicket field/button classes | Required CSS classes/tokens present for editable, read-only, invalid, disabled, busy states | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| STYLE-02 | Visual/Responsive | AC-25 | Create Ticket screenshots | Desktop/tablet/mobile screenshots match `ui-spec.md`, no clipping/overlap/scroll; `document.body.scrollWidth` asserted ≤ viewport width | `e2e/lab-02/screenshots.spec.ts` → `artifacts/lab-02/screenshots/create-ticket/{desktop,tablet,mobile}.png` | Pass |
| STYLE-03 | Visual/Responsive | AC-25 | My Tickets screenshots | Desktop table vs. mobile card, no horizontal scroll; `document.body.scrollWidth` asserted ≤ viewport width | `e2e/lab-02/screenshots.spec.ts` → `artifacts/lab-02/screenshots/my-tickets/{desktop,tablet,mobile}.png` | Pass |
| STYLE-04 | Visual/Responsive | AC-25 | Ticket Detail screenshots | All three viewports legible, no clipping/overlap; `document.body.scrollWidth` asserted ≤ viewport width | `e2e/lab-02/screenshots.spec.ts` → `artifacts/lab-02/screenshots/ticket-detail/{desktop,tablet,mobile}.png` | Pass |
| E2E-01 | E2E | AC-01, AC-09, AC-16, AC-24 | Full create → find → open flow | Select Requester, create ticket w/ attachment, find via search in My Tickets, open Ticket Detail and confirm data + attachment; no Public Comments/Internal Notes rendered | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| E2E-02 | E2E | AC-03, AC-23 | Cross-Requester isolation | Requester A's ticket invisible to Requester B in list and direct navigation; switching back to A restores A's data | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| E2E-03 | E2E | AC-14, AC-15 | Attachment lifecycle | Upload → download succeeds → soft-remove → download now fails safely (410, direct request) | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |

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

Every AC-01–AC-26 has at least one row; every test names a real file path
under the required minimum Lab 2 structure (handout §12), extended with
`dev-requesters.api.test.ts`, `DevRequesterSelection.test.tsx`/
`AttachmentSection.test.tsx`, and (Issue 24) `serializable-retry.unit.test.ts`
and the two `e2e/lab-02/*.spec.ts` files, since the handout's list is a
stated minimum, not a ceiling.

UNIT-04 traces to BR-26 rather than an AC because it tests an
implementation-level concurrency safeguard (the SERIALIZABLE-retry wrapper
around the 5-active-attachment check, §7 below), not directly observable
Requester-facing behavior.

## 4. Responsive and Visual Checklist

### 4.1 ui-spec.md §12 checklist

Mirrors `ui-spec.md` §12:

- [x] No clipped labels at any viewport (desktop ≥992px, tablet 768–991px,
      mobile <768px)
- [x] No overlapping messages (validation, badges, toasts)
- [x] No unintended horizontal scrolling at any viewport — automated as of
      Issue 24 via `document.body.scrollWidth <= viewport width` assertions
      in `e2e/lab-02/screenshots.spec.ts` (STYLE-02/03/04), not just visual
      inspection
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

Originally verified 2026-09-05 (Issue 8) via live browser automation
(manual, since Playwright wasn't installed yet — see the superseded note in
§7). Re-verified and re-captured 2026-09-05 (Issue 24) with the real
Playwright suite added by this issue; the Issue 8 screenshots below were
overwritten in place at the same `ui-spec.md` §13 paths.

### 4.2 Section 14 submission screenshot checklist

Every screenshot the handout's Section 14 submission table requires,
captured by `e2e/lab-02/screenshots.spec.ts` (responsive triads also
covered by STYLE-02/03/04 above) or `e2e/lab-02/requester-ticket-flow.spec.ts`
(E2E-01/02/03), against a running app + seeded dev database. Run
`pnpm e2e` to regenerate all of them from a clean clone (§5).

**Create Ticket**

- [x] Initial — `artifacts/lab-02/screenshots/create-ticket/initial.png`
- [x] Validation failure — `artifacts/lab-02/screenshots/create-ticket/validation-failure.png`
- [x] Submitting (busy) — `artifacts/lab-02/screenshots/create-ticket/submitting.png`
- [x] Success — `artifacts/lab-02/screenshots/create-ticket/success.png`
- [x] API failure — `artifacts/lab-02/screenshots/create-ticket/api-failure.png`
- [x] Invalid-attachment state — `artifacts/lab-02/screenshots/create-ticket/invalid-attachment.png`

**Development Requester Selection**

- [x] Selection screen — `artifacts/lab-02/screenshots/dev-requester-selection/screen.png`
- [x] Active-user dropdown — `artifacts/lab-02/screenshots/dev-requester-selection/active-dropdown.png`
- [x] Selected-user display — `artifacts/lab-02/screenshots/dev-requester-selection/selected-user-display.png`
- [x] Change Requester action — `artifacts/lab-02/screenshots/dev-requester-selection/change-requester-action.png`
- [x] Loading state — `artifacts/lab-02/screenshots/dev-requester-selection/loading.png`
- [x] Failure state — `artifacts/lab-02/screenshots/dev-requester-selection/failure.png`

**My Tickets**

- [x] Requester A's list — `artifacts/lab-02/screenshots/my-tickets/requester-a-list.png`
- [x] Requester B's list (A's tickets gone) — `artifacts/lab-02/screenshots/my-tickets/requester-b-list.png`
- [x] Search — `artifacts/lab-02/screenshots/my-tickets/search.png`
- [x] Filters — `artifacts/lab-02/screenshots/my-tickets/filters.png`
- [x] Sorting — `artifacts/lab-02/screenshots/my-tickets/sorting.png`
- [x] Pagination — `artifacts/lab-02/screenshots/my-tickets/pagination.png`
- [x] Empty state — `artifacts/lab-02/screenshots/my-tickets/empty-state.png`
- [x] No-results state — `artifacts/lab-02/screenshots/my-tickets/no-results.png`

**Ticket Detail + Attachments**

- [x] Owned Ticket Detail — `artifacts/lab-02/screenshots/ticket-detail/owned-detail.png`
- [x] Add attachment — `artifacts/lab-02/screenshots/ticket-detail/add-attachment.png`
- [x] Download active attachment — `artifacts/lab-02/screenshots/ticket-detail/download-active.png`
- [x] Soft removal with reason — `artifacts/lab-02/screenshots/ticket-detail/remove-with-reason.png`
- [x] Retained metadata after removal — `artifacts/lab-02/screenshots/ticket-detail/retained-metadata.png`
- [x] Blocked removed-download attempt — `artifacts/lab-02/screenshots/ticket-detail/blocked-removed-download.png`
- [x] Unauthorized ticket-access rejection — `artifacts/lab-02/screenshots/ticket-detail/unauthorized-access.png`

**Responsive (desktop/tablet/mobile, ui-spec.md §8/§13)**

- [x] Create Ticket — `artifacts/lab-02/screenshots/create-ticket/{desktop,tablet,mobile}.png`
- [x] My Tickets — `artifacts/lab-02/screenshots/my-tickets/{desktop,tablet,mobile}.png`
- [x] Ticket Detail — `artifacts/lab-02/screenshots/ticket-detail/{desktop,tablet,mobile}.png`

36 files total; none missing. "Blocked removed-download attempt" and
"unauthorized ticket-access rejection" are screenshotted at the UI layer
(the only user-visible surface — both fail safely with no distinguishing
information per BR-15/BR-28) with the actual `404`/`410` backing the claim
asserted directly against the API in the same test.

**Known duplicate pairs** (Issue 10 audit): two pairs of the 36 files are
byte-identical, both for the same reason — nothing on the page changes
between the two captures, so this is expected, not a missing screenshot:

- `ticket-detail/retained-metadata.png` and
  `ticket-detail/blocked-removed-download.png` — the "blocked" request
  between them is `context.request.get(...)` against the API directly, never
  touching `page`, so the rendered DOM is identical before and after; the
  `410` itself is asserted in the same test (`screenshots.spec.ts` lines
  246–259), independent of the screenshot.
- `create-ticket/initial.png` and `create-ticket/desktop.png` — both capture
  the same blank Create Ticket form at the same effective width (Playwright's
  default project viewport is 1280px wide, matching `VIEWPORTS.desktop`), and
  `fullPage: true` screenshots normalize away the height difference between
  the two viewport configs.

## 5. Test Commands

Run from a clean clone, after `README.md`'s Setup steps (db up, install,
migrate, seed) and with `server`/`client` dev servers running (`pnpm e2e`
starts them itself via Playwright's `webServer` config if they aren't
already up):

```bash
# Server: unit + API/integration tests (Vitest + Supertest)
pnpm --filter server test

# Client: UI component + style tests (Vitest + Testing Library)
pnpm --filter client test

# E2E + visual/responsive screenshots (Playwright) — added by Issue 24
pnpm e2e
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

Issue 7's own responsive check for Ticket Detail was done manually via live
browser automation against a ticket created through the real API (desktop
viewport confirmed directly; tablet/mobile resize was not available in that
session).

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
bands) rather than Playwright — no Playwright dependency existed yet (§7 at
the time).

**Issue 24 (Test Suite Consolidation, Traceability, and Release
Integration)**: closed every gap left open above.

- Corrected every stale `Planned` status in §2 to `Pass` — those tests
  (UNIT-01, UNIT-03, API-01–05, API-24, API-25, UI-01–04) were actually
  implemented and passing since Issues 2–8; tests.md had simply never been
  updated after the fact. No new test-writing was needed for these.
- Added `@playwright/test` (root devDependency), `playwright.config.ts`, and
  `e2e/lab-02/{helpers,requester-ticket-flow,screenshots}.spec.ts`, closing
  the "Playwright not installed" limitation for good.
- `requester-ticket-flow.spec.ts` implements E2E-01–03 against the real
  running app (server + client dev servers, real Postgres) — all three now
  `Pass`.
- `screenshots.spec.ts` implements STYLE-02–04 (now `Pass`, with a real
  `document.body.scrollWidth` assertion backing the "no horizontal scroll"
  claim instead of only a visual check) and captures the full Section 14
  screenshot set audited in §4.2 — 27 previously-missing screenshots
  (validation/API-failure/loading/empty/no-results/isolation/attachment-
  lifecycle/unauthorized-access states) plus a re-capture of the 9
  responsive screenshots Issue 8 had taken manually, now at the same
  `ui-spec.md` §13 paths but Playwright-produced and reproducible.
- One genuine test-timing issue was found and fixed in the test suite
  itself (not the app): scripting a `selectOption` on Create Ticket's
  Category/Related System selects immediately after they mount can land in
  the gap between React committing the DOM and wiring the change handler,
  silently no-opping the selection. `waitForCreateTicketReady()` in
  `e2e/lab-02/helpers.ts` waits for a real populated `<option>` before
  selecting; a human clicking is never fast enough to hit this window, so
  it isn't a product bug. Confirmed non-flaky over 4 consecutive full runs.

```bash
pnpm --filter server test   # 81/81 passing
pnpm --filter client test   # 71/71 passing
pnpm e2e                    # 14/14 passing (3 E2E scenarios + 11 screenshot-audit specs)
```

**Issue 10 (post-release audit findings)**: a read-only audit against
`specification.md`'s Definition of Done found two real, untested product
gaps and one real setup gap; fixed all three plus the documentation issues
that didn't require touching `ai_use.md`/`reviewer.md`.

- BR-12's third redirect trigger (a Requester deactivated after being
  selected) was never implemented or tested. Added a single event fired from
  `apiClient.ts`'s one response-parsing seam whenever the server reports
  `INVALID_REQUESTER`, consumed by `RequesterProvider` to clear the stored
  Requester — every screen already redirects on `requester === null`
  (`App.tsx`), so no per-screen change was needed. New test: UI-03 in
  `DevRequesterSelection.test.tsx`.
- `ui-spec.md` §11.3 requires page-number pagination controls on My Tickets;
  only Previous/Next existed. Added them (`MyTickets.tsx`, `zen-green.css`);
  verified they wrap correctly with no horizontal scroll up to 14 pages at
  mobile width. UI-12 in `MyTickets.test.tsx` updated to assert the new
  controls.
- `README.md`'s Setup steps crash on a genuinely fresh clone: pnpm skips
  Prisma's install-time build script by default, so `prisma migrate dev`
  never generates the Prisma Client, and the next documented command
  (`prisma:seed`) fails. Added an explicit `pnpm prisma:generate` step;
  reverified against two separate fresh clones.
- Added an explicit assertion that "Ticket Owner" never renders on Ticket
  Detail (`RequesterTicketDetail.test.tsx`, alongside the existing
  Comment/Status/IT Priority checks).
- Documented (did not fabricate a fix for) two byte-identical screenshot
  pairs — `create-ticket/initial.png` vs. `desktop.png`, and
  `ticket-detail/retained-metadata.png` vs. `blocked-removed-download.png` —
  both inherent to what those states actually look like on screen, not
  missing coverage; see §4.2 above.
- Investigated one `socket hang up` seen during the audit's own concurrent
  test runs; 5/5 clean in isolation, see §7 below — not a code change.
- Did not touch `ai_use.md` or `reviewer.md` (explicitly out of scope); see
  `specification.md` §10 for the two items still open there.

```bash
pnpm --filter server test   # 81/81 passing
pnpm --filter client test   # 72/72 passing (+1: BR-12 reactivation redirect)
pnpm e2e                    # 14/14 passing
```

## 7. Known Limitations or Deferred Tests

- **A `socket hang up` was observed once in `attachments.api.test.ts`
  (Issue 10 audit)**, during a session running the server suite from four
  concurrent processes against the same shared dev Postgres instance at
  once. Re-ran `pnpm --filter server test` five times in isolation
  immediately after (no concurrent load): 81/81 every time. Treated as
  audit-induced resource contention, not a product flake — no code change
  made. Re-check if it recurs under normal (single-runner) conditions.
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
- **The Playwright suite creates real fixture Tickets/Attachments in
  whatever database it runs against**, rather than an isolated/rolled-back
  transaction per test. Acceptable for Lab 2's local dev Postgres instance
  (fixture rows are clearly named `... fixture <timestamp>` and harmless
  alongside seed data — a Requester's page count grows slightly each run,
  which is expected, not a bug); a CI environment for a later lab should
  point `pnpm e2e` at a disposable database or truncate fixture rows
  between runs.
