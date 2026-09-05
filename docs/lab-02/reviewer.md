# Reviewer for Lab 2

Name: Noppawit Tanmanee
Student ID: 67070501082
GitHub Username: [FakeKase](https://github.com/FakeKase)

Same reviewer for every Lab 2 issue. Every PR below merged into `lab2-staging`
and was reviewed and approved by this reviewer before merge — no Lab 2 PR
merged without review. Comment excerpts are trimmed for length; full text is
on GitHub at the linked PR.

## Issue 1 — Design Documents (`specification.md`, `tests.md`, `ui-spec.md`, `api-spec.md`)

PR: [#16](https://github.com/gxjakkap/soften-toktickit/pull/16)

- **Review:** APPROVED, first pass. *"LGTM! all the plans are to perfect to be true bro"*
- No changes requested.

## Issue 2 — Dev Requester context and selection screen

PR: [#25](https://github.com/gxjakkap/soften-toktickit/pull/25)

- **Review:** APPROVED, first pass. *"LGTM! everything works just fine sub"*
- No changes requested.

## Issue 3 — Database schema (Ticket, Attachment, Category, Related System)

PR: [#26](https://github.com/gxjakkap/soften-toktickit/pull/26)

- **Review:** APPROVED, first pass. *"Valid! Approve kub"*
- No changes requested.

## Issue 4 — Ticket creation API

PR: [#27](https://github.com/gxjakkap/soften-toktickit/pull/27)

- **Review:** APPROVED, first pass. *"LGTM kubbbb"*
- No changes requested.

## Issue 5 — Create Ticket UI

PR: [#28](https://github.com/gxjakkap/soften-toktickit/pull/28)

- **Review round 1:** CHANGES_REQUESTED. Five findings:
  1. System-generated fields (Ticket Number/Date/Requester) rendered in the
     *Disabled* visual state instead of *Read-only* — `disabled`/
     `aria-disabled` layered on top of `zg-field-readonly`, contradicting
     `ui-spec.md` §3's distinction between the two states.
  2. `tests.md` not updated — 13 rows this PR implements still said
     `Planned`.
  3. The attachment-upload 201 response leaked internal fields
     (`storedFileName`, `removedReason`) not in `api-spec.md` §7's example.
  4. (Non-blocking) 5-attachment cap was check-then-insert, not
     transactional — a race under concurrent uploads.
  5. (Non-blocking) An uploaded file could be orphaned on disk if
     `prisma.attachment.create` threw after the file was written.
- **Response:** all five addressed — dropped `disabled`/`aria-disabled`
  from the three read-only fields and added a regression test for it;
  updated `tests.md` §2/§6 with real pass counts; added a `select` to the
  attachment-creation response; moved the 5-cap check into a
  `SERIALIZABLE` transaction; added cleanup-on-any-error for the uploaded
  file.
- **Review round 2:** APPROVED. *"All five fixed, good job kub!"*

## Issue 6 — My Tickets (API + UI: search/filter/sort/pagination)

PR: [#29](https://github.com/gxjakkap/soften-toktickit/pull/29)

- **Review round 1:** CHANGES_REQUESTED. Three findings:
  1. Seeded Ticket Numbers (`TKT-SEED-jennifer.anderson-001`) violated the
     project's own BR-06 format (`TKT-<4-digit year>-<6-digit sequence>`) —
     and these are the rows every My Tickets screenshot would show.
  2. `categoryRows[spec.categoryIndex]` depended on unordered `findMany`
     results; a reseed could silently reassign categories on existing demo
     Tickets.
  3. `api-spec.md` §5 and the implementation disagreed on how an unknown
     `categoryId` should fail (spec said 400; code returned 200 with an
     empty list) — flagged as a doc/code disagreement to resolve either
     way, not a one-sided bug.
- **Response:** seed Ticket Numbers switched to a reserved `900001+` range
  formatted through the real `formatTicketNumber` helper (BR-06-compliant);
  Category/Related System seed lookups changed to map by name instead of
  array index; the code was changed (not the spec) so an unknown
  `categoryId` returns 400 `INVALID_FILTER`, with an empty string treated
  as "no filter" rather than category `0`.
- **Review round 2:** APPROVED, with one new non-blocking observation: the
  fix for #1 derived the seed year from each row's own `createdAt`, so a
  seed run spanning a New Year boundary would produce duplicate rows
  instead of converging (needs two runs either side of Jan 1 to trigger —
  not blocking, logged as a future hardening rather than fixed under this
  PR). *"All three fixed, verified each one. Approving kub."*

## Issue 7 — Requester Ticket Detail and Attachment lifecycle (download, soft-remove)

PR: [#30](https://github.com/gxjakkap/soften-toktickit/pull/30)

- **Review:** APPROVED, first pass, after specifically checking the
  security-shaped paths: ownership is checked before the removed-attachment
  410 (so a non-owner gets an indistinguishable 404, not a 403 that would
  leak existence — BR-15); `Number.isInteger` guards stop a NaN id reaching
  Prisma; `Content-Disposition` header injection via `originalFileName` is
  closed; removed attachments drop the Download control entirely rather
  than disabling it.
- One non-blocking nit: `contentDispositionFilename` doesn't RFC 6266
  percent-encode non-ASCII filenames, so a Thai-language attachment name
  could render mangled in some browsers. Not fixed in this PR; not required
  by BR-25–BR-29, logged as a future hardening item.

## Issue 8 — Zen Green styling and responsive polish

PR: [#31](https://github.com/gxjakkap/soften-toktickit/pull/31)

- **Review:** APPROVED, first pass — reviewed against the captured
  screenshots directly rather than the CSS diff alone (tablet My Tickets at
  850px, mobile card collapse, icon+label pairing on same-color badges, the
  BR-06-compliant seed Ticket Numbers, and the read-only-vs-disabled fix
  from Issue 5 all confirmed present in evidence).
- One non-blocking observation: this PR also removed Create Ticket's
  separate post-submit upload path in favor of reusing `AttachmentSection`
  — a functional change inside what the PR title framed as a styling audit.
  Called out as safe (existing tests already exercised the flow through the
  new component, 71/71 stayed green) but worth naming so a future PR
  doesn't slip a larger behavior change through unnoticed under a "styling"
  label.

## Issue 24 — Test Suite Consolidation, Traceability, and Release Integration

PR: pending (this issue) — opened against `lab2-staging`, to be reviewed
before the `lab2-staging` → `main` release PR.
