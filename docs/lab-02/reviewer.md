# Reviewer for Lab 2

Name: Noppawit Tanmanee
Student ID: 67070501082
GitHub Username: [FakeKase](https://github.com/FakeKase)

One reviewer for every Lab 2 issue. Every PR below merged into `lab2-staging` only after review and approval; none merged without it. Comment excerpts are trimmed for length, full text is on GitHub at the linked PR.

## Issue 1, Design Documents (`specification.md`, `tests.md`, `ui-spec.md`, `api-spec.md`)

PR: [#16](https://github.com/gxjakkap/soften-toktickit/pull/16)

Approved on the first pass. *"LGTM! all the plans are to perfect to be true bro"* No changes requested.

## Issue 2, Dev Requester context and selection screen

PR: [#25](https://github.com/gxjakkap/soften-toktickit/pull/25)

Approved on the first pass. *"LGTM! everything works just fine sub"* No changes requested.

## Issue 3, Database schema (Ticket, Attachment, Category, Related System)

PR: [#26](https://github.com/gxjakkap/soften-toktickit/pull/26)

Approved on the first pass. *"Valid! Approve kub"* No changes requested.

## Issue 4, Ticket creation API

PR: [#27](https://github.com/gxjakkap/soften-toktickit/pull/27)

Approved on the first pass. *"LGTM kubbbb"* No changes requested.

## Issue 5, Create Ticket UI

PR: [#28](https://github.com/gxjakkap/soften-toktickit/pull/28)

First round came back with changes requested and five findings. System-generated fields (Ticket Number, Ticket Date, Requester) rendered in the *Disabled* visual state instead of *Read-only*: `disabled`/`aria-disabled` were layered on top of `zg-field-readonly`, contradicting `ui-spec.md` §3's distinction between the two states. `tests.md` hadn't been updated, so the 13 rows this PR implements still said `Planned`. The attachment-upload 201 response leaked internal fields (`storedFileName`, `removedReason`) that aren't in `api-spec.md` §7's example. Two more, non-blocking: the 5-attachment cap was check-then-insert rather than transactional, so concurrent uploads could race past it, and an uploaded file could be orphaned on disk if `prisma.attachment.create` threw after the file was already written.

All five got fixed. `disabled`/`aria-disabled` came off the three read-only fields, with a regression test added so it can't come back unnoticed. `tests.md` §2 and §6 got updated with real pass counts. The attachment-creation response now has a `select` limiting it to the documented fields. The 5-cap check moved into a `SERIALIZABLE` transaction. The upload path now cleans up the file on any error, not just the cases it already handled.

Second round: approved. *"All five fixed, good job kub!"*

## Issue 6, My Tickets (API + UI: search/filter/sort/pagination)

PR: [#29](https://github.com/gxjakkap/soften-toktickit/pull/29)

First round, changes requested, three findings. Seeded Ticket Numbers (`TKT-SEED-jennifer.anderson-001`) violated the project's own BR-06 format (`TKT-<4-digit year>-<6-digit sequence>`), and these are the exact rows every My Tickets screenshot would show. `categoryRows[spec.categoryIndex]` depended on `findMany` returning rows in a stable order it never guaranteed, so a reseed could silently reassign categories on existing demo tickets. `api-spec.md` §5 and the implementation disagreed on how an unknown `categoryId` should fail: the spec said 400, the code returned 200 with an empty list. That one was flagged as a doc/code disagreement to settle either way, not a one-sided bug.

The fix: seeded Ticket Numbers now come from a reserved `900001+` range run through the real `formatTicketNumber` helper, so they're BR-06-compliant. Category and Related System seed lookups now map by name instead of array index. The disagreement got resolved by changing the code, not the spec: an unknown `categoryId` now returns 400 `INVALID_FILTER`, and an empty string is treated as "no filter" rather than category `0`.

Second round: approved, with one new non-blocking note. The fix for the first finding derived the seed year from each row's own `createdAt`, so a seed run spanning a New Year boundary would produce duplicate rows instead of converging. That needs two runs on opposite sides of January 1 to trigger, so it wasn't blocking, just logged as a future hardening item. *"All three fixed, verified each one. Approving kub."*

## Issue 7, Requester Ticket Detail and Attachment lifecycle (download, soft-remove)

PR: [#30](https://github.com/gxjakkap/soften-toktickit/pull/30)

Approved on the first pass, after specifically checking the security-shaped paths. Ownership is checked before the removed-attachment 410, so a non-owner gets an indistinguishable 404 rather than a 403 that would leak existence (BR-15). `Number.isInteger` guards stop a NaN id from reaching Prisma. `Content-Disposition` header injection via `originalFileName` is closed. Removed attachments drop the Download control entirely instead of just disabling it.

One non-blocking nit: `contentDispositionFilename` doesn't RFC 6266 percent-encode non-ASCII filenames, so a Thai-language attachment name could render mangled in some browsers. Not fixed here, not required by BR-25 through BR-29, logged as a future hardening item.

## Issue 8, Zen Green styling and responsive polish

PR: [#31](https://github.com/gxjakkap/soften-toktickit/pull/31)

Approved on the first pass, reviewed against the captured screenshots directly rather than the CSS diff alone: tablet My Tickets renders all columns at 850px, mobile collapses to cards, same-color badges got their distinguishing icons, seed Ticket Numbers are BR-06-compliant, and the read-only-vs-disabled fix from Issue 5 is visible in the evidence.

One non-blocking observation: this PR also removed Create Ticket's separate post-submit upload path in favor of reusing `AttachmentSection`, a functional change inside what the PR title framed as a styling audit. Called out as safe, since existing tests already exercised the flow through the new component and stayed green at 71/71, but worth naming so a future PR doesn't slip a larger behavior change through unnoticed under a "styling" label.

## Issue 9, Test Suite Consolidation, Traceability, and Release Integration

TBA
