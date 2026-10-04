# Lab 3 Test Plan and Results

This plan is written from `specification.md` (FR-01–28, BR-01–40, AC-01–38,
§7 status matrix, §8 migration/seed) and `api-spec.md` (Test DD — handout
§9), then reconciled against what Issues #2–#9 actually built. It is Issue
#10's integration pass: it finalizes the test plan, closes coverage gaps,
and produces the evidence the grader needs for Part 3. Earlier issues'
acceptance criteria stay in force — this plan extends `docs/lab-02/tests.md`,
it does not replace it, and every Lab 2 row there is still `Pass` against
the current branch.

## 1. Test Strategy

- **Unit** — pure logic with no DB/HTTP: password hashing/strength,
  authorization-guard functions in isolation, the generic error handler.
  Vitest, colocated under `server/tests/lab-03/`.
- **API / integration** — Supertest against the Express app with a real
  test database, one file per resource area (handout §12 minimum,
  extended). Covers every endpoint, status code, and ownership/role rule in
  `api-spec.md`.
- **Security / authorization** — a single table-driven matrix
  (`server/tests/lab-03/authorization-matrix.api.test.ts`) running every
  protected endpoint as unauthenticated, Requester, IT Staff, and
  Administrator, plus dedicated existence-leak checks for another
  Requester's Ticket/Attachment and for Internal Note content. Most
  individual role rejections already have a test next to the endpoint they
  guard (see each API file below); this file is the consolidated
  cross-check, and it is where this issue's gap analysis found and closed
  the handful of role combinations nothing else exercised (§6).
- **Migration / regression** — `migration.integration.test.ts` runs the
  real Lab 2 → Lab 3 SQL migration against a scratch database seeded with
  Lab 2–shaped rows and checks nothing is lost; `schema-seed.integration.test.ts`
  checks the seed script and schema constraints directly. Lab 2's own
  Requester tests (`server/tests/lab-02/*`, `client/tests/lab-02/*`) are
  unmodified except where the identity mechanism itself changed (ownership
  from `requesterId` to session) or an endpoint newly requires
  authentication (§6) — both are still Lab 2 regression coverage, now
  passing under the Lab 3 identity model.
- **UI component** — Vitest + Testing Library, one file per screen under
  `client/tests/lab-03/`. Label/error association is proven implicitly
  throughout: `getByLabelText` (client) and Playwright's `getByLabel`
  (e2e) both fail if a control is not properly associated with its label,
  so every test that queries a field this way is also an accessibility
  assertion. No dedicated a11y test file exists, matching Lab 2 precedent.
- **UI style / responsive / visual** — Playwright, screenshots at
  desktop/tablet/mobile with a real `document.body.scrollWidth` assertion
  backing "no horizontal scroll," per `ui-spec.md` §9/§11.
- **E2E** — Playwright, full flows: authentication, Requester regression,
  the IT Staff operational flow (new this issue), and the Administrator
  user lifecycle (new this issue).

Every row in §2 traces to at least one AC/FR/BR in `specification.md`.
Every AC-01–AC-38 is covered by at least one row (§3 matrix).

## 2. Planned Tests

### 2.1 Unit

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UNIT-01 | Unit | BR-09 | `hashPassword`/`verifyPassword` | Stores a bcrypt hash, never the plaintext; verifies the right password, rejects the wrong one, salts each hash differently | `server/tests/lab-03/password.unit.test.ts` | Pass |
| UNIT-02 | Unit | BR-10, AC-29 | `isStrongPassword` | Accepts 8+ chars w/ upper, lower, digit, special; rejects each missing rule, empty, and non-string input | `server/tests/lab-03/password.unit.test.ts` | Pass |
| UNIT-03 | Unit | api-spec.md §1.5 | `requirePasswordChangeSatisfied` guard | 403 `PASSWORD_CHANGE_REQUIRED` when gated; calls `next()` when satisfied | `server/tests/lab-03/authorization.unit.test.ts` | Pass |
| UNIT-04 | Unit | api-spec.md §0.1 | `requireRole` guard | 403 `FORBIDDEN` for a disallowed role; calls `next()` for a permitted one; 401 (not a thrown error) when `req.user` is unset | `server/tests/lab-03/authorization.unit.test.ts` | Pass |
| UNIT-05 | Unit | BR-03 | `isOwner` | True only when owner id equals caller id; false for a different owner or a null/undefined owner | `server/tests/lab-03/authorization.unit.test.ts` | Pass |
| UNIT-06 | Unit | api-spec.md §0.2, §0.3 | `errorEnvelope` handler | Passes a body-parser 400/413 through as its own 4xx (not 500); falls back to 500 `INTERNAL_ERROR` and logs for anything else; does not log a passed-through 4xx; delegates to `next(err)` once headers are sent | `server/tests/lab-03/error-handler.unit.test.ts` | Pass |

### 2.2 API / Integration

**Authentication** (`server/tests/lab-03/auth.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-01 | API | AC-01 | `POST /api/auth/login` valid credentials | 200, identity shape, httpOnly/SameSite=Lax cookie, no `passwordHash` leaked | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-02 | API | BR-13 | Session token storage | Only the SHA-256 of the token is stored (not the raw value); `expiresAt` is 12h out | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-03 | API | BR-13 | Expired session cleanup | Logging in deletes the caller's expired `Session` rows | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-04 | API | BR-15 | Case-insensitive login email | `JENNIFER@...` matches the lower-cased stored row | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-05 | API | AC-05, BR-06 | Unknown email vs. wrong password | Identical 401 `INVALID_CREDENTIALS` either way; no session created, no enumeration | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-06 | API | AC-06, AC-33, BR-07 | Inactive account, correct password | 403 `INACTIVE_ACCOUNT`, no session created | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-07 | API | BR-06 | Inactive account, wrong password | Still the generic `INVALID_CREDENTIALS` — inactivity is never revealed before the password is proven right | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-08 | API | api-spec.md §1.1 | Login validation | 400 `VALIDATION_ERROR` naming the missing/non-string field (4 cases) | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-09 | API | BR-14 | `GET /api/auth/me` | 200 with id/name/email/role/`mustChangePassword` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-10 | API | AC-08 | `GET /api/auth/me`, no/bogus cookie | 401 `UNAUTHENTICATED` both ways | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-11 | API | AC-08, BR-13 | `GET /api/auth/me`, expired session | 401 | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-12 | API | api-spec.md §0.1 | `GET /api/auth/me`, deactivated-mid-session user | 401 | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-13 | API | AC-07, BR-12 | `POST /api/auth/logout` | 204, deletes the session row, clears the cookie; replaying the old cookie is 401 | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-14 | API | api-spec.md §1.2 | Logout, no session | 401 `UNAUTHENTICATED` | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-15 | API | AC-02, AC-30, BR-02, BR-11 | First-login change-password flow | Gate flag starts true; missing field, wrong current password, and a weak/same-as-current new password all fail and leave the gate set; a valid change clears it, kills the old token, issues a fresh one that works | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-16 | API | api-spec.md §1.4 | Change-password commit failure | 500, no cookie set — no client is left holding a token for a rolled-back row | `server/tests/lab-03/auth.api.test.ts` | Pass |
| API-17 | API | api-spec.md §3 (voluntary change excluded, but the same endpoint works ungated) | Change-password with no gate | 200, gate stays false, exactly one live session afterward | `server/tests/lab-03/auth.api.test.ts` | Pass |

**Authorization guard chain** (`server/tests/lab-03/authorization.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-18 | API | FR-06 | `GET /api/auth/me` refactor regression | Still 401 with no session, 200 with one | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-19 | API | AC-35 | Queue role guard | 401 no session, 403 Requester, 200 IT Staff passthrough | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-20 | API | BR-40, AC-37 | Queue, Administrator caller | 403 — the Administrator's one exception is read-only Detail, not the Queue | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-21 | API | BR-40, AC-36, AC-04 | Ticket Detail guard | Administrator reaches real lookup logic (404 on a bad id, not 403); Requester is 403 with no content leaked | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-22 | API | BR-40, AC-37 | Every Queue mutation route, Administrator caller | 403 on claim/owner/priority/status/comments (one parameterized check over all five) | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-23 | API | api-spec.md §4 | IT Staff mutation route passthrough | A nonexistent-ticket claim 404s (proof the guard chain, not just the role check, ran) | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-24 | API | AC-11, api-spec.md §5 | Admin role guard | 401 no session, 403 IT Staff, 403 Requester, 200 Administrator passthrough | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| API-25 | API | api-spec.md §1.5 | Password-change gate | 403 `PASSWORD_CHANGE_REQUIRED` on a protected non-auth route even for the right role; `/api/auth/me` itself is never gated | `server/tests/lab-03/authorization.api.test.ts` | Pass |

**Reference data** (`server/tests/lab-02/reference-data.api.test.ts` and
`server/tests/lab-01/categories-list.test.ts` — Lab 2/Lab 1 files, updated
this issue; see §6):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-26 | API | specification.md §12-12 | `GET /api/categories`, `GET /api/related-systems` | Only active rows, `{id, name}` shape; 401 with no session (this issue's fix — see §6) | `server/tests/lab-02/reference-data.api.test.ts`, `server/tests/lab-01/categories-list.test.ts` | Pass |

**Requester Ticket endpoints, session-derived identity**
(`server/tests/lab-03/requester-tickets.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-27 | API | BR-17 | `POST /api/tickets`, no session / wrong role | 401 no session; 403 for an IT Staff caller | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-28 | API | AC-03, BR-03 | `POST /api/tickets`, spoofed `requesterId` | 201, filed under the session owner regardless of body `requesterId` | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-29 | API | BR-21 | `POST /api/tickets`, `itPriority` seed | Copied from `requestedPriority` at creation | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-30 | API | api-spec.md §3.1 | `POST /api/tickets`, body-less request | 400 `VALIDATION_ERROR`, not 500 (Express 5 leaves `req.body` undefined) | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-31 | API | api-spec.md §3.2 | `GET /api/tickets`, no session | 401 | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-32 | API | AC-03 | `GET /api/tickets`, `requesterId` query param | Ignored; only the session owner's Tickets return | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-33 | API | api-spec.md §3.2 | `GET /api/tickets` row shape | Every row carries `itPriority` and `ownerName` | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-34 | API | AC-03, BR-16 | `GET /api/tickets/:id`, another Requester's Ticket | 404 `NOT_FOUND`, even guessing a real id | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-35 | API | api-spec.md §3.3 | `GET /api/tickets/:id` shape | `ownerName`, `itPriority`, `requesterConfirmedResolvedAt`, and a `PUBLIC`-only `comments` array (an `INTERNAL` fixture row never appears) | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-36 | API | FR-10, BR-26-28, BR-30 | `POST /api/tickets/:id/comments` | 201, author/timestamp/`visibility: PUBLIC` from the session — client-supplied `authorName`/`visibility` ignored | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-37 | API | AC-21, BR-26 | Comment, whitespace-only | 400 `VALIDATION_ERROR` field `content`, nothing inserted | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-38 | API | BR-26 | Comment, >2000 trimmed chars | 400 `VALIDATION_ERROR` field `content` | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-39 | API | api-spec.md §3.7 | Comment, body-less request | 400, not 500 | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-40 | API | BR-16 | Comment on a not-owned Ticket | 404 (no existence leak) | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-41 | API | api-spec.md §3.7 | Comment, non-Requester caller | 403 | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-42 | API | FR-11, BR-24 | `PATCH /api/tickets/:id/resolved` | Sets `requesterConfirmedResolvedAt`; calling again is idempotent (timestamp only); `currentStatus` never changes | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-43 | API | AC-14 | Resolved, not-owned Ticket | 404 | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-44 | API | BR-25 | Resolved, Ticket Closed/Cancelled | 409 `TICKET_CLOSED` | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |
| API-45 | API | api-spec.md §3.8 | Resolved, non-Requester caller | 403 | `server/tests/lab-03/requester-tickets.api.test.ts` | Pass |

**IT Staff Ticket Queue** (`server/tests/lab-03/staff-queue.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-46 | API | AC-35 | Queue, no session / Requester caller | 401 / 403 | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-47 | API | BR-31 | Queue is table-wide | Both of two IT Staff callers see every fixture Ticket, including ones owned by the other caller | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-48 | API | api-spec.md §4.1 | Queue row shape | Includes `categoryName`, `itPriority`, `ownerName` per the documented shape | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-49 | API | AC-22 | Search | Case-insensitive partial match on `ticketNumber` OR `summary`; exact ticket number also matches | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-50 | API | BR-32 | Filters in isolation | `categoryId`, `requestedPriority`, `itPriority` (independent of Requested Priority), `status`, `ownerId` (numeric and `unassigned`) each narrow correctly (6 sub-cases) | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-51 | API | AC-23, BR-32 | Combined filters | Category + Status AND; IT Priority + `ownerId=unassigned` AND | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-52 | API | AC-24 | Pagination | Correct `page`/`pageSize`/`totalCount`/`totalPages`; page 2 shows the remainder; out-of-range `page`/`pageSize` clamp, not reject | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-53 | API | specification.md §12-8 | Default sort | `createdAt asc` (oldest first) with `id asc` as a deterministic tie-break | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-54 | API | BR-32 | Every sortable field, both directions | `createdAt`/`updatedAt`/`ticketNumber`/`requestedPriority`/`itPriority`/`currentStatus` all sort asc/desc without error; `ticketNumber desc` verified exactly | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-55 | API | AC-25, AC-26 | Filters matching nothing | `data: []`, `hasAnyTickets: true`, `totalCount: 0` | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |
| API-56 | API | api-spec.md §4.1 | Invalid filter/sort values | 400 `INVALID_FILTER` for an unrecognized `requestedPriority`/`itPriority`/`status`/`sortBy`/`sortDir`/`ownerId`/`categoryId` (8 sub-cases) | `server/tests/lab-03/staff-queue.api.test.ts` | Pass |

**IT Staff Ticket Detail** (`server/tests/lab-03/staff-ticket-detail.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-57 | API | api-spec.md §4.2 | `GET /api/staff/tickets/:id` | 401 no session, 403 Requester, 404 nonexistent id | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-58 | API | BR-40, AC-36 | Administrator retrieval | 200, includes Internal Note content | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-59 | API | api-spec.md §4.2 | IT Staff retrieval shape | `ownerId`/`ownerName` present; both `PUBLIC` and `INTERNAL` comments returned | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-60 | API | api-spec.md §4.1b | `GET /api/staff/it-staff-users` | 403 non-IT-Staff; lists only active IT Staff, ordered by name | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-61 | API | FR-14, BR-19 | Claim, unassigned Ticket | 200, caller becomes Owner | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-62 | API | BR-19 | Claim, already-owned-by-caller | No-op success, same shape | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-63 | API | AC-38, BR-19 | Claim, owned by someone else | 409 `ALREADY_OWNED`, message names Reassign; owner unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-64 | API | api-spec.md §4.3 | Claim, wrong role / missing ticket | 403 Requester, 404 unknown id | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-65 | API | FR-15, BR-20 | Reassign, any active IT Staff incl. self | 200, Owner set as requested | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-66 | API | BR-20 | Reassign, `ownerId: null` | Clears ownership back to unassigned | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-67 | API | api-spec.md §4.4 | Reassign, invalid owner | 400 `INVALID_OWNER` for a Requester id, an inactive IT Staff id, and a nonexistent id | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-68 | API | api-spec.md §4.4 | Reassign, wrong role / missing ticket | 403 Requester, 404 unknown id | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-69 | API | AC-17, BR-21 | `PATCH .../priority` | Updates `itPriority`; `requestedPriority` is untouched | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-70 | API | api-spec.md §4.5 | Priority, invalid value / wrong role | 400 `VALIDATION_ERROR`; 403 Requester | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-71 | API | specification.md §7, BR-22 | Status, every permitted transition | All 17 ✓ cells in the §7 matrix succeed (parameterized) | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-72 | API | AC-18, BR-22 | Status, disallowed transitions | 8 sampled disallowed pairs (incl. New→Closed, Open→Resolved, Cancelled's terminal state) all 409 `INVALID_TRANSITION`, status unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-73 | API | AC-19 | Resolved → Reopened | 200, Ticket actionable again | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-74 | API | api-spec.md §4.6 | Status, unrecognized value / wrong role / missing ticket | 400 before any transition check; 403 Requester; 404 unknown id | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |

**Comments and Internal Notes** (`server/tests/lab-03/comments-notes.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-75 | API | FR-18 | `POST /api/staff/tickets/:id/comments`, `PUBLIC` | 201, author/timestamp from the session | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-76 | API | FR-19, BR-04, BR-29 | `INTERNAL` note | Visible via the staff detail endpoint; never appears, even as a substring, in the Requester's own detail response for the same Ticket | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-77 | API | api-spec.md §4.7 | Invalid `visibility` | 400 `VALIDATION_ERROR` field `visibility` | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-78 | API | AC-21, BR-26 | Whitespace-only / over-length content | 400 field `content`, both cases | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-79 | API | api-spec.md §4.7 | Nonexistent ticket | 404 | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-80 | API | AC-04 | Requester caller | 403, no note content exposed anywhere in the response | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |
| API-81 | API | BR-40 | Administrator caller | 403 — this endpoint has no read exception | `server/tests/lab-03/comments-notes.api.test.ts` | Pass |

**Administrator User Management** (`server/tests/lab-03/users-admin.api.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-82 | API | AC-11, AC-35 | Non-Administrator callers, every admin endpoint | 403 `FORBIDDEN` for IT Staff and Requester across all 4 endpoints (8 cases); 401 with no session | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-83 | API | FR-20, BR-38, BR-39, AC-27, AC-28 | `GET /api/admin/users` | Documented shape, name-ascending order, no `passwordHash`/`mustChangePassword` leaked | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-84 | API | BR-38 | Search | Case-insensitive partial match on name or email; no-match shape `{data: [], totalCount: 0}` | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-85 | API | BR-38 | Role filter | Narrows correctly; combines with search using AND | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-86 | API | api-spec.md §5.1 | Unrecognized role filter | 400 `INVALID_FILTER` | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-87 | API | FR-21, BR-10, BR-11, BR-33, AC-09, AC-30 | `POST /api/admin/users` | 201, created user has `mustChangePassword: true` — confirmed by logging in as the new user | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-88 | API | AC-09, BR-15 | Duplicate email (any case) | 409 `DUPLICATE_EMAIL`, nothing created | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-89 | API | BR-33 | Invalid/missing role | 400 `VALIDATION_ERROR` field `role` (4 cases, incl. array and lower-case) | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-90 | API | api-spec.md §5.2 | Blank name / malformed email | 400 `VALIDATION_ERROR`, correct `field` | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-91 | API | AC-29 | Weak initial password | 400 `WEAK_PASSWORD`, nothing created | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-92 | API | api-spec.md §5.2 | Create an inactive Administrator | 201 — legal, just an edge case of the same endpoint | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-93 | API | FR-22 | `PATCH /api/admin/users/:id` | Edits name/email/role/`isActive` | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-94 | API | BR-34 | Deactivate or change role | Target's existing sessions are deleted immediately, not at natural expiry | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-95 | API | BR-15 | Duplicate email on edit | 409, any case, excluding the user's own unchanged email | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-96 | API | api-spec.md §5.3 | Invalid role/type, empty body, unknown id | 400 for each; 404 `NOT_FOUND` for an unknown id | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-97 | API | AC-31, BR-35 | Self-deactivation | 409 `SELF_DEACTIVATION`, decided from the session identity, not any client-supplied id; account stays active | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-98 | API | AC-32, BR-36, FR-26 | Last active Administrator | 409 `LAST_ADMINISTRATOR` when the sole Administrator changes their own role; demoting a second Administrator first works; an Administrator may demote themself while another remains active | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-99 | API | FR-23, BR-37, AC-30 | `PATCH .../password` | Replaces the hash, forces `mustChangePassword: true`, ends existing sessions — confirmed by the old password failing and the new one succeeding and landing on the gate | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-100 | API | BR-10 | Weak replacement password | 400 `WEAK_PASSWORD`, hash unchanged | `server/tests/lab-03/users-admin.api.test.ts` | Pass |
| API-101 | API | api-spec.md §5.4 | Unknown user id | 404 | `server/tests/lab-03/users-admin.api.test.ts` | Pass |

**Error envelope wiring** (no AC — infrastructure):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| API-102 | API | api-spec.md §0.2, §0.3 | Malformed JSON body | 400 `MALFORMED_REQUEST`, not 500 — `express.json()` itself rejects it before any route runs | `server/tests/lab-03/error-envelope.api.test.ts` | Pass |

### 2.3 Security / Authorization

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | Security | FR-06, FR-24, api-spec.md §0.1 | Direct-API role matrix | Every protected endpoint (22 routes, §4.1b–§5.4) tried as unauthenticated, as each disallowed role, and as each allowed role: 401 unauthenticated always; 403 `FORBIDDEN` for every disallowed role; every allowed role actually reaches the handler (not 401/403) — 88 assertions in this one `describe` block (the allowed-role half added in review, see §6, after it was pointed out that an endpoint allowing every role generated no role assertion at all), 92 for the whole file counting SEC-02–05 below | `server/tests/lab-03/authorization-matrix.api.test.ts` | Pass |
| SEC-02 | Security | BR-16, FR-24 | No existence leak, Ticket | `GET /api/tickets/:id` for another Requester's Ticket is 404 with a body of exactly `{error}` — no ticket field leaked | `server/tests/lab-03/authorization-matrix.api.test.ts` | Pass |
| SEC-03 | Security | BR-16, FR-24 | No existence leak, Attachment download | `GET /api/attachments/:id/download` for another Requester's attachment is 404, no `Content-Disposition` header, body only `{error}` | `server/tests/lab-03/authorization-matrix.api.test.ts` | Pass |
| SEC-04 | Security | BR-16, FR-24 | No existence leak, Attachment remove | `PATCH /api/attachments/:id/remove` for another Requester's attachment is 404; the row is confirmed unchanged in the database | `server/tests/lab-03/authorization-matrix.api.test.ts` | Pass |
| SEC-05 | Security | BR-04, BR-29 | Internal Note never reaches a Requester | Posting an Internal Note on a Ticket, then fetching that same Ticket as its owning Requester, never contains the note's content anywhere in the JSON | `server/tests/lab-03/authorization-matrix.api.test.ts` | Pass |

### 2.4 Migration / Regression

**Lab 2 → Lab 3 migration** (`server/tests/lab-03/migration.integration.test.ts`
— runs the real migration SQL against a scratch database seeded with Lab
2–shaped rows):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| MIG-01 | Migration | specification.md §8.3 | `RequesterUser` → `User` in place | Every row/id preserved, `role: REQUESTER`, `mustChangePassword: true` | `server/tests/lab-03/migration.integration.test.ts` | Pass |
| MIG-02 | Migration | BR-09 | Backfilled passwords | bcrypt hashes of the documented dev password; never plaintext | `server/tests/lab-03/migration.integration.test.ts` | Pass |
| MIG-03 | Migration | BR-15 | Email normalization | Existing emails lower-cased; DB rejects a new mixed-case email (`CHECK` constraint) | `server/tests/lab-03/migration.integration.test.ts` | Pass |
| MIG-04 | Migration | specification.md §8.3 | Ticket/Attachment preservation | Every row preserved; `requesterId` still resolves to a `User` | `server/tests/lab-03/migration.integration.test.ts` | Pass |
| MIG-05 | Migration | BR-21 | `itPriority` backfill | Copied from `requestedPriority`; `ownerId`/`requesterConfirmedResolvedAt` null | `server/tests/lab-03/migration.integration.test.ts` | Pass |
| MIG-06 | Migration | BR-23 | Status rename | `PENDING` → `WAITING_FOR_REQUESTER`; other statuses untouched | `server/tests/lab-03/migration.integration.test.ts` | Pass |
| MIG-07 | Migration | BR-23 | Enum declaration order | `REOPENED` sits between `CLOSED` and `CANCELLED` on disk, matching schema order | `server/tests/lab-03/migration.integration.test.ts` | Pass |
| MIG-08 | Migration | specification.md §8.3 | Id sequence | New users get fresh ids above the migrated rows (sequence survives the rename) | `server/tests/lab-03/migration.integration.test.ts` | Pass |

**Schema and seed** (`server/tests/lab-03/schema-seed.integration.test.ts`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| MIG-09 | Migration | specification.md §8.4 | Seed account minimums | ≥4 active/≥1 inactive Requester, ≥3 active/≥1 inactive IT Staff, ≥1 active Administrator; every password hashed; idempotent on rerun (identical rows/ids) | `server/tests/lab-03/schema-seed.integration.test.ts` | Pass |
| MIG-10 | Migration | specification.md §8.4 | Seed ticket spread | Unassigned + multiple owners, ≥5 distinct statuses, some `itPriority ≠ requestedPriority`; both `PUBLIC` and `INTERNAL` comments seeded | `server/tests/lab-03/schema-seed.integration.test.ts` | Pass |
| MIG-11 | Migration | BR-15 | Schema constraint | Duplicate email (P2002) and non-lower-case email both rejected | `server/tests/lab-03/schema-seed.integration.test.ts` | Pass |
| MIG-12 | Migration | specification.md §8.2 | Defaults | New user active/no gate; new Ticket `NEW`/unowned/unconfirmed | `server/tests/lab-03/schema-seed.integration.test.ts` | Pass |
| MIG-13 | Migration | BR-18 | Ticket Owner FK | Active IT Staff accepted; nonexistent owner rejected (P2003) | `server/tests/lab-03/schema-seed.integration.test.ts` | Pass |
| MIG-14 | Migration | specification.md §8.5 | Owner/Requester delete rules | Deleting an Owner unassigns their Tickets (`SET NULL`); deleting a Requester who filed Tickets is refused (`RESTRICT`) | `server/tests/lab-03/schema-seed.integration.test.ts` | Pass |
| MIG-15 | Migration | BR-27, BR-28 | Comment FK integrity | Author/ticket must exist; an author with comments can't be deleted; deleting a Ticket cascades its comments | `server/tests/lab-03/schema-seed.integration.test.ts` | Pass |
| MIG-16 | Migration | specification.md §8.2 | Session FK/uniqueness | Sessions cascade with their user; `tokenHash` is unique | `server/tests/lab-03/schema-seed.integration.test.ts` | Pass |
| MIG-17 | Migration | BR-32, FR-20 | Queue/role index coverage | Indexes exist on `Ticket.ownerId`/`requesterId`/`currentStatus`/`itPriority`, `User.role`, `TicketComment(ticketId, visibility)` | `server/tests/lab-03/schema-seed.integration.test.ts` | Pass |

### 2.5 UI Component

**Login** (`client/tests/lab-03/Login.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-01 | UI | ui-spec.md §2 | Empty submit | Field-level errors on Email/Password; API never called | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-02 | UI | AC-01 | Successful login | Routes to the Requester default landing screen (My Tickets) | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-03 | UI | ui-spec.md §2 | Busy state | Sign In shows "Signing in…", disabled, while the request is in flight | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-04 | UI | AC-05 | Invalid credentials | Banner shown; Password cleared, Email preserved | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-05 | UI | AC-06 | Inactive account | Distinct banner from invalid-credentials | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-06 | UI | ui-spec.md §2 | Server/network failure | Safe generic banner; raw server message never rendered | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-07 | UI | AC-02 | `mustChangePassword: true` | Routes straight to Change Password, no intermediate screen | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-08 | UI | ui-spec.md §2 | "Forgot your password?" link | Present but disabled, with an Administrator-only tooltip | `client/tests/lab-03/Login.test.tsx` | Pass |

**Change Password** (`client/tests/lab-03/ChangePassword.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-09 | UI | AC-02 | Non-gated user | Redirected away from this screen | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-10 | UI | ui-spec.md §3 | Live password-rule checklist | Each rule (length/upper/lower/digit/special) marks met as the New Password field satisfies it | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-11 | UI | ui-spec.md §3 | Confirm mismatch | Live mismatch error; Continue disabled | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-12 | UI | AC-02 | Successful change | Lands on the role default screen directly, no confirmation screen | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-13 | UI | ui-spec.md §3 | Wrong current password | Field-level error under Current password | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-14 | UI | BR-10 | New equals Current | Continue disabled; live field-level error | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |

**Auth guards and role-scoped navigation** (`client/tests/lab-03/AuthGuards.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-15 | UI | FR-06 | Unauthenticated direct URL | Redirected to Login | `client/tests/lab-03/AuthGuards.test.tsx` | Pass |
| UI-16 | UI | AC-10 | Requester navigation | Shows only My Tickets/Create Ticket | `client/tests/lab-03/AuthGuards.test.tsx` | Pass |
| UI-17 | UI | specification.md §6 | IT Staff navigation | Shows only Ticket Queue | `client/tests/lab-03/AuthGuards.test.tsx` | Pass |
| UI-18 | UI | specification.md §6 | Administrator navigation | Shows only User Management | `client/tests/lab-03/AuthGuards.test.tsx` | Pass |
| UI-19 | UI | AC-35, specification.md §12-14 | Wrong-role direct URL | Forbidden state (not an error banner) for Requester→Queue, IT Staff→My Tickets (with a correct "back to your home page" link), Requester→User Management | `client/tests/lab-03/AuthGuards.test.tsx` | Pass |
| UI-20 | UI | AC-07 | Logout | Clears the session; a protected route redirects to Login afterward | `client/tests/lab-03/AuthGuards.test.tsx` | Pass |

**Requester Ticket Detail, Lab 3 additions** (`client/tests/lab-03/RequesterTicketDetail.test.tsx`
— read-only-rendering regression lives in `client/tests/lab-02/RequesterTicketDetail.test.tsx`,
still `Pass`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-21 | UI | ui-spec.md §4 | Public Comments, empty | "No comments yet." shown | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Pass |
| UI-22 | UI | ui-spec.md §4 | Comments list | Oldest-first, author name, role badge, timestamp | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Pass |
| UI-23 | UI | FR-10 | Post a comment | Appears at the bottom immediately, no reload; input clears | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Pass |
| UI-24 | UI | ui-spec.md §4 | Empty/whitespace draft | Post Comment stays disabled | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Pass |
| UI-25 | UI | ui-spec.md §4 | Post failure | Safe error message; draft text preserved | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Pass |
| UI-26 | UI | ui-spec.md §4 | Ticket Closed | "Problem Appears Resolved" button hidden | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Pass |
| UI-27 | UI | FR-11, BR-24 | Confirm dialog | Confirming replaces the button with a "Marked resolved by you on…" badge | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Pass |
| UI-28 | UI | ui-spec.md §4 | Dialog cancel | No API call made | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Pass |

**IT Staff Ticket Detail** (`client/tests/lab-03/StaffTicketDetail.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-29 | UI | AC-35 | Requester direct access | Forbidden state; no detail request made | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-30 | UI | ui-spec.md §6 | Read-only info card | Ticket No., Requester, Requested Priority badge, Description all render | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-31 | UI | ui-spec.md §6 | Load failure | Safe error state with Retry | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-32 | UI | FR-14 | Claim, unassigned | Button shown; clicking sets the caller as Owner | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-33 | UI | FR-15, ui-spec.md §6 | Owned by someone else | Claim hidden; the Owner `<select>` (Reassign) changes ownership instead | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-34 | UI | FR-16 | IT Priority change | Submits a `PATCH .../priority` | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-35 | UI | specification.md §7 | Status options | Only transitions permitted from the current status are offered (Resolved → Closed/Reopened only) | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-36 | UI | BR-22 | 409 `INVALID_TRANSITION` | Status `<select>` reverts to its prior value; error shown | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-37 | UI | BR-04, ui-spec.md §6 | Comments vs. Notes | Visually distinct sections (separate test id, "Internal only" label); posting from each composer hits the right `visibility` | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |

**IT Staff Ticket Queue** (`client/tests/lab-03/StaffTicketQueue.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-38 | UI | AC-35 | Requester direct access | Forbidden state; no Queue request made | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-39 | UI | AC-37 | Administrator direct access | Forbidden state | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-40 | UI | AC-26 | Zero Tickets system-wide | Empty-queue state, no filter UI shown | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-41 | UI | AC-25 | Filtered to zero | No-results state + Clear Filters, distinct from the empty state | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-42 | UI | ui-spec.md §5 | Server error | Safe failure banner with Retry | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-43 | UI | ui-spec.md §5 | Data rendering | Both the desktop table and the mobile card list show the same Ticket, with badges | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-44 | UI | ui-spec.md §5 | Unassigned Ticket | "Unassigned" rendered in place of an Owner name | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-45 | UI | specification.md §12-8 | Default sort indicator | "Sorted oldest first" shown on first load | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-46 | UI | AC-22 | Search | List narrows; API called with `search` | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-47 | UI | AC-23 | Filter panel | Opens behind "Filters"; choosing a value shows a removable chip and calls the API with it; removing the chip clears the filter | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-48 | UI | BR-32 | Sortable column header | Clicking toggles `sortBy`/`sortDir` in the request | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |
| UI-49 | UI | AC-24 | Pagination | "Showing X to Y of Z tickets"; Next loads page 2 | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass |

**Administrator User Management** (`client/tests/lab-03/UserManagement.test.tsx`):

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| UI-50 | UI | AC-35 | IT Staff direct access | Forbidden state; no admin request made | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-51 | UI | AC-27, BR-39 | User list | Name, Email, Role, Status, Edit per row; no pagination controls | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-52 | UI | specification.md §6 | Navigation | "User Management" shown only for the Administrator role | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-53 | UI | ui-spec.md §7 | Load failure | Safe error with Retry; retry recovers the list | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-54 | UI | AC-28, BR-38 | Search | Narrows by name or email as the Administrator types | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-55 | UI | BR-38 | Role filter | Narrows and shows a removable chip | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-56 | UI | ui-spec.md §7 | No matches | "No users match your search." + Clear Filters | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-57 | UI | AC-29 | Create form validation | Name/Email/Role/Password errors shown together; Active defaults checked; nothing sent to the API | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-58 | UI | BR-33 | Role control | Single `<select>`, not multi-select; exactly Requester/IT Staff/Administrator plus the placeholder | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-59 | UI | FR-21 | Create submit | Closes the panel, shows "User created.", the new user appears in the list, and the POST body matches exactly | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-60 | UI | AC-09 | Duplicate email on create | Error surfaces under Email Address; input kept, marked invalid | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-61 | UI | ui-spec.md §7 | Forbidden/server failure on create | Safe banner inside the open panel; form values preserved | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-62 | UI | ui-spec.md §7 | Cancel | Closes the panel and discards input | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-63 | UI | FR-22 | Edit | Form pre-filled with current values; only the changed field(s) are sent in the `PATCH` | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-64 | UI | BR-15 | Duplicate email on edit | Same field-level treatment as create | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-65 | UI | BR-36 | Safety-rule rejection on edit | Server's message ("At least one active Administrator is required.") shown as a banner | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-66 | UI | AC-31, BR-35 | Self-row, another Admin exists | Active toggle disabled with "You can't deactivate your own account."; Role stays enabled | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-67 | UI | AC-32, BR-36 | Self-row, sole active Administrator | Both Active and Role disabled, each with its own explanatory copy | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-68 | UI | ui-spec.md §7 | Another user's row | Active toggle stays enabled, no self-deactivation copy | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-69 | UI | ui-spec.md §7 | Set New Password control | Collapsed by default on edit; entirely absent on create | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-70 | UI | FR-23, BR-37 | Set new password | Weak value rejected locally; a valid one calls `PATCH .../password` with exactly `{newPassword}`, then clears the field | `client/tests/lab-03/UserManagement.test.tsx` | Pass |

### 2.6 UI Style / Responsive / Visual

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| STYLE-01 | Visual/Responsive | AC-25 | Create Ticket / My Tickets / Ticket Detail responsive screenshots, now under session auth | Desktop/tablet/mobile, `document.body.scrollWidth` ≤ viewport width | `e2e/lab-03/screenshots.spec.ts` → `artifacts/lab-03/screenshots/{create-ticket,my-tickets,ticket-detail}/{desktop,tablet,mobile}.png` | Pass |
| STYLE-02 | Visual | ui-spec.md §14 (Lab 2 parity) | Create Ticket state screenshots | Initial/validation-failure/busy/success/API-failure/invalid-attachment all captured | `e2e/lab-03/screenshots.spec.ts` → `artifacts/lab-03/screenshots/create-ticket/*.png` | Pass |
| STYLE-03 | Visual | ui-spec.md §14 (Lab 2 parity) | My Tickets state screenshots | Cross-Requester isolation, search, filters, sorting, pagination, empty state, no-results all captured | `e2e/lab-03/screenshots.spec.ts` → `artifacts/lab-03/screenshots/my-tickets/*.png` | Pass |
| STYLE-04 | Visual | ui-spec.md §14 (Lab 2 parity), AC-03 | Ticket Detail + Attachment lifecycle screenshots | Owned detail, add/download/remove, retained metadata, blocked download, unauthorized-access rejection all captured | `e2e/lab-03/screenshots.spec.ts` → `artifacts/lab-03/screenshots/ticket-detail/*.png` | Pass |
| STYLE-05 | Visual/Responsive | ui-spec.md §9, §11, AC-34 | Login / Change Password / Ticket Queue / IT Staff Ticket Detail / User Management responsive screenshots — the four screens `ui-spec.md` §11 required that had no screenshot evidence before this issue | Desktop/tablet/mobile for all five screens, `document.body.scrollWidth` ≤ viewport width at each | `e2e/lab-03/staff-and-admin-screenshots.spec.ts` → `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/*.png` | Pass |

### 2.7 End-to-End

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-01 | E2E | AC-01, AC-05, AC-06 | Login flows | Real Requester login success; generic invalid-credentials banner; distinct inactive-account banner | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-02 | E2E | AC-10, specification.md §6 | Role-scoped navigation | Each of the three roles sees only their own nav destinations | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-03 | E2E | AC-02, AC-30 | Mandatory first-login change | A freshly Administrator-created Requester must change their password before any other screen is reachable (direct navigation to `/tickets` bounces back) | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-04 | E2E | AC-07, BR-12 | Logout | Ends the session; `/tickets` afterward redirects to Login | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-05 | E2E | FR-10 | Public Comment | A Requester posts one and sees it appear immediately, with their name/role | `e2e/lab-03/requester-comments-and-resolved.spec.ts` | Pass |
| E2E-06 | E2E | FR-11, BR-24, BR-25 | Problem Appears Resolved | Confirm dialog → success badge replaces the button; Current Status (`New`) never changes | `e2e/lab-03/requester-comments-and-resolved.spec.ts` | Pass |
| E2E-07 | E2E | specification.md §2 | Requester regression | Real Login reaches My Tickets with a Logout action; no "Change Requester" control exists anymore | `e2e/lab-03/requester-comments-and-resolved.spec.ts` | Pass |
| E2E-08 | E2E | AC-01, AC-03, AC-09, AC-14-16, AC-23, AC-24 (Lab 2 ACs, unmodified) | Lab 2 Requester regression | Create → find → open, cross-Requester isolation, attachment lifecycle, all still correct now that identity is session-derived rather than client-supplied | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pass |
| E2E-09 | E2E | FR-13, FR-14, FR-16-19, BR-04 | IT Staff operational flow (new this issue) | Login as IT Staff → find a Ticket by number in the Queue → open it → Claim → set IT Priority → a permitted Status transition → post a Public Comment and an Internal Note → the filing Requester sees the comment but never the note | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-10 | E2E | FR-21, AC-30 | Administrator creates a user (new this issue) | Create via the UI; the new user is routed to Change Password at first login | `e2e/lab-03/user-administration.spec.ts` | Pass |
| E2E-11 | E2E | FR-22, BR-34 | Edit and deactivate (new this issue) | Edited name takes effect immediately in the list; deactivating a user kills their existing session (`GET /api/auth/me` 401s on the pre-deactivation session, held in an isolated cookie jar) and blocks their next login with the inactive-account message | `e2e/lab-03/user-administration.spec.ts` | Pass |
| E2E-12 | E2E | FR-25, FR-26, AC-31, AC-32 | Safety rails on the sole seeded Administrator (new this issue) | Opening their own row disables Active ("You can't deactivate your own account.") and Role ("At least one active Administrator is required.") together | `e2e/lab-03/user-administration.spec.ts` | Pass |

## 3. Acceptance-Criterion Traceability Matrix

| AC | Covered by |
| --- | --- |
| AC-01 | API-01, UI-02, E2E-01, E2E-08 |
| AC-02 | API-15, UI-07, UI-09, UI-12, E2E-03 |
| AC-03 | API-28, API-32, API-34, SEC-02, E2E-08 |
| AC-04 | API-21, API-80 |
| AC-05 | API-05, UI-04, E2E-01 |
| AC-06 | API-06, UI-05, E2E-01 |
| AC-07 | API-13, UI-20, E2E-04 |
| AC-08 | API-10, API-11 |
| AC-09 | API-88, UI-60 |
| AC-10 | UI-16, E2E-02 |
| AC-11 | API-24, API-82 |
| AC-12 | API-36, UI-23, E2E-05 |
| AC-13 | API-42, UI-27, E2E-06 (see §7 — no direct API assertion that the IT Staff detail response surfaces the signal, only client/E2E) |
| AC-14 | API-43 |
| AC-15 | API-61, UI-32 |
| AC-16 | API-65, UI-33 |
| AC-17 | API-69, UI-34 |
| AC-18 | API-72, UI-35 |
| AC-19 | API-73 |
| AC-20 | API-76, SEC-05 |
| AC-21 | API-37, API-78, UI-24 |
| AC-22 | API-49, UI-46 |
| AC-23 | API-51, UI-47 |
| AC-24 | API-52, UI-49 |
| AC-25 | API-55, UI-41 |
| AC-26 | UI-40 (see §7 — exercised only at the mocked UI layer, not against a real system-wide-empty database) |
| AC-27 | API-83, UI-51 |
| AC-28 | API-84, UI-54 |
| AC-29 | API-91, UI-57 |
| AC-30 | API-87, API-99, E2E-03, E2E-10 |
| AC-31 | API-97, UI-66 |
| AC-32 | API-98, UI-67 |
| AC-33 | API-06 |
| AC-34 | STYLE-05 |
| AC-35 | SEC-01, API-19, API-46, API-57, API-64, API-68, API-74, API-82, UI-19, UI-29, UI-38, UI-50 |
| AC-36 | API-58, SEC-01 |
| AC-37 | API-20, API-22, SEC-01 |
| AC-38 | API-63 |

Every AC-01–AC-38 has at least one row. Two are flagged above as covered
at a weaker level than the rest of the table — see §7 for why, and why
that's an acceptable gap rather than a missed one.

## 4. Responsive and Visual Checklist

Mirrors `ui-spec.md` §10's Visual Inspection Checklist:

- [x] No clipped labels at any viewport, on any new screen — STYLE-05
      (Login, Change Password, Ticket Queue, IT Staff Ticket Detail, User
      Management at desktop/tablet/mobile)
- [x] No overlapping messages (validation, badges, toasts) on Login,
      Change Password, Ticket Queue, Ticket Detail (IT Staff), User
      Management — covered incidentally by every UI-component test that
      asserts a field-level error or banner renders alongside its field,
      and visually by STYLE-05's screenshots
- [x] No unintended horizontal scrolling at any viewport — automated via
      `document.body.scrollWidth <= viewport width` in both STYLE-01 (Lab
      2 screens) and STYLE-05 (the four new screens)
- [x] Consistent field styling (editable vs. read-only vs. invalid vs.
      disabled) between the Requester and IT Staff Ticket Detail screens —
      both reuse the same `.zg-field`/`.zg-field-invalid` tokens from
      `ui-spec.md` §3; no new class was introduced for either screen
- [x] Badge colors/labels consistent between the Ticket Queue and both
      Ticket Detail screens for the same Priority/Status/Role value —
      structural, not a new test: `client/src/badges.tsx` is the single
      shared source for `StatusBadge`/`PriorityBadge`/`RoleBadge`, imported
      by `StaffTicketQueue.tsx`, `StaffTicketDetail.tsx`,
      `RequesterTicketDetail.tsx`, `MyTickets.tsx`, and `UserManagement.tsx`
      — there is no second badge implementation left to drift. Each
      screen's own component test (UI-30, UI-43, UI-51) already asserts the
      right badge renders there.
- [x] Public Comments and Internal Notes are visually unmistakable from
      each other at every viewport, not color-only — UI-37 asserts a
      separate `data-testid`, a persistent "Internal only" label, and a
      distinct background tint (`ui-spec.md` §6)
- [x] Role-based navigation shows only permitted destinations for each of
      the three roles — UI-16/17/18, E2E-02
- [x] Filters, pagination, and Queue/User Management controls remain
      usable at all three viewports — exercised by STYLE-05's screenshots
      at all three widths; interaction correctness itself is proven at
      desktop by UI-46-49 (Queue) and UI-54-55 (User Management), which
      jsdom doesn't vary by viewport for

### 4.1 Screenshot inventory (this issue's additions)

`e2e/lab-03/staff-and-admin-screenshots.spec.ts` produces, beyond the
STYLE-01-04 files already in place from Issue #5/#9:

- `artifacts/lab-03/screenshots/authentication/{desktop,tablet,mobile}.png`
  — Login
- `artifacts/lab-03/screenshots/authentication/change-password-{desktop,tablet,mobile}.png`
  — Change Password (bonus capture beyond `ui-spec.md` §11's one named
  triad per screen group, since both Login and Change Password live under
  "authentication")
- `artifacts/lab-03/screenshots/staff-queue/{desktop,tablet,mobile}.png`
- `artifacts/lab-03/screenshots/staff-ticket-detail/{desktop,tablet,mobile}.png`
- `artifacts/lab-03/screenshots/user-management/{desktop,tablet,mobile}.png`

15 files, all newly captured by this issue; none were missing afterward.
No manual-only visual check remains for any Lab 3 screen — everything
`ui-spec.md` §11 lists now has an automated, reproducible capture.

## 5. Test Commands

Run from a clean clone, after `README.md`'s Setup steps (db up, install,
`prisma:generate`/`prisma:migrate`/`prisma:seed`) and with `server`/`client`
dev servers running (`pnpm e2e` starts them itself if they aren't already
up):

```bash
# Server: unit + API/integration/security/migration tests (Vitest + Supertest)
pnpm --filter server test

# Client: UI component tests (Vitest + Testing Library)
pnpm --filter client test

# E2E + visual/responsive screenshots (Playwright)
pnpm e2e
```

This issue adds a single root command that runs all three in sequence
from the repository root:

```bash
pnpm test
```

## 6. Final Results

**Issue #10 (Test Plan, Gap Analysis, and Full Coverage)**: this document
did not exist before this issue — Issues #2–#9 built substantial lab-03
test coverage but never assembled a `tests.md` tying it to the ACs, and
some real gaps had accumulated. This pass:

- **Found and fixed one real spec/code disagreement**: `specification.md`
  §12-12 and `api-spec.md` §2 both say `GET /api/categories` and
  `GET /api/related-systems` now require an authenticated session (a
  deliberate Lab 3 tightening over Lab 2's open endpoints), but
  `server/src/app.ts` had never had `...requireAuth` added to either route
  — both were still callable with no session at all. Fixed at
  `server/src/app.ts:184` and `server/src/app.ts:194`. Caught it because
  the existing test for these endpoints
  (`server/tests/lab-02/reference-data.api.test.ts`) called them with no
  cookie and still expected 200 — that test (and the matching Lab 1
  regression test, `server/tests/lab-01/categories-list.test.ts`, which had
  the same problem) were updated to authenticate and to assert the new 401
  case; both are API-26 above.
- **Closed a set of missing role-rejection cases**, found by building the
  AC-35 direct-API matrix (SEC-01) the handout's security/authorization
  requirement calls for and that nothing in Issues #2–#9 had assembled as
  one artifact: `GET /api/tickets` and `GET /api/tickets/:id` had no test
  at all for an IT Staff or Administrator caller (only ownership/401 were
  tested); `POST /api/tickets/:id/attachments`,
  `GET /api/attachments/:id/download`, and `PATCH /api/attachments/:id/remove`
  had the same gap; `POST /api/tickets` and
  `POST /api/tickets/:id/comments` and `PATCH /api/tickets/:id/resolved`
  each had an IT Staff rejection test but no Administrator one;
  `GET /api/staff/it-staff-users` had only a Requester rejection test, with
  no check that Administrator is rejected too (unlike
  `GET /api/staff/tickets/:id`, this endpoint has no Administrator
  read-only exception). The app's role guards turned out to already be
  correct in every one of these cases — this was a test-coverage gap, not
  a product bug — confirmed by `authorization-matrix.api.test.ts` passing
  65/65 on the first run.
- **Added the two missing E2E flows**: no end-to-end test exercised the IT
  Staff operational screen (search → claim → priority → status → comment
  → note → the Requester-visibility boundary) or the Administrator user
  lifecycle (create → forced first-login change → edit → deactivate →
  self-deactivation/last-Administrator blocks), despite both screens having
  full UI-component and API coverage individually. Added
  `e2e/lab-03/staff-ticket-flow.spec.ts` and
  `e2e/lab-03/user-administration.spec.ts`.
- **Filled the four empty screenshot directories** `ui-spec.md` §11
  requires (`authentication`, `staff-queue`, `staff-ticket-detail`,
  `user-management`) — `artifacts/lab-03/screenshots/` had only the three
  Lab 2 screen directories reused under session auth; nothing had ever
  captured the three genuinely new Lab 3 screens, or Login/Change Password,
  at any viewport. Added `e2e/lab-03/staff-and-admin-screenshots.spec.ts`.
- **Added a root `pnpm test` script** running all three suites in sequence,
  since none existed before this issue (`package.json`).
- No other disagreement was found between the implemented code and
  `specification.md`/`api-spec.md` during this pass.

**PR #55 review round 1** (`FakeKase`) found the matrix's deny-only loop
generated zero role assertions for an endpoint whose `allowed` list is every
role (`/api/categories`, `/api/related-systems`): restricting either one to
`REQUESTER`-only still passed the full suite. Fixed by adding a second loop
asserting every allowed role actually reaches the handler (SEC-01, now 88
assertions in that `describe` block). Also found and fixed: the Internal
Note leak check never confirmed its own setup POST succeeded before
asserting the content was absent; the deactivation e2e's comment claimed the
account's *next request* is blocked but only its *next login* was tested
(BR-34 promises both) — now the test also kills a held-open session through
the `request` fixture's independent cookie jar (E2E-11); and the E2E suite
created throwaway `.test.invalid` users with no cleanup, visible as
accumulated rows in the User Management screenshot — closed with
`playwright.config.ts`'s new `globalTeardown`
(`e2e/global-teardown.ts` → `server/scripts/clean-e2e-fixtures.ts`).

**PR #55 review round 2** (`FakeKase`) found the round-1 fix was
incomplete: the User Management screenshot still had one leftover row
because `globalTeardown` only runs after the whole suite, and
`authentication.spec.ts` creates its fixture user earlier in the same run,
before the screenshot spec. Far more significant: the cleanup only ever
matched `.test.invalid` *users*, never Tickets filed under a real seeded
Requester (`jennifer.anderson@example.com` mainly) — the committed
`my-tickets/desktop.png` showed "Showing 1 to 10 of 325 tickets" with 33
wrapped pagination buttons, accumulated across unrelated runs over a much
longer period than this issue. Fixed both:

- `server/scripts/clean-e2e-fixtures.ts` now also deletes every Ticket whose
  `ticketNumber` falls outside the seed's reserved `900001+` range
  (`prisma/seed.ts`'s own comment documents that range exists specifically
  so a non-seed row is identifiable this way) — 318 fixture Tickets were
  sitting in the dev database at review time, none created by this issue.
- Added `e2e/global-setup.ts` (cleans before the run starts, so a crashed
  prior run can't leak into this one either) and a `test.beforeAll` in both
  screenshot specs (`screenshots.spec.ts`, `staff-and-admin-screenshots.spec.ts`)
  cleaning immediately before each captures its screenshots, closing the
  within-run ordering gap `globalTeardown` alone couldn't. All three share
  `e2e/clean-fixtures.ts`'s one `cleanFixtures()` call.

Recaptured; `my-tickets/desktop.png` now shows "Showing 1 to 10 of 19
tickets" (14 seeded + 5 this file's own in-run fixtures), two page buttons,
no wrapping. Confirmed stable over two consecutive full `pnpm e2e` runs.

```bash
pnpm --filter server test   # 371/371 passing
pnpm --filter client test   # 126/126 passing
pnpm e2e                    # 29/29 passing
```

## 7. Known Limitations or Deferred Tests

- **AC-26 (a truly empty, system-wide Ticket table) is exercised only at
  the mocked UI layer** (`UI-40` in `StaffTicketQueue.test.tsx`), not by a
  real API-level integration test. Every server test in this suite runs
  against the same shared dev Postgres instance, which always has seed
  data and other files' fixtures present by the time any one test runs;
  genuinely truncating the `Ticket` table to prove `hasAnyTickets: false`
  server-side would require an isolated database per test file, which is a
  bigger infrastructure change than this lab's scope justifies. The
  `hasAnyTickets` field itself is asserted directly in `staff-queue.api.test.ts`
  (API-55) for the no-results case; only the true-zero case stays UI-only.
- **AC-13's "IT Staff viewing the Ticket see the resolved-by-Requester
  signal" has no dedicated API-level assertion** that
  `GET /api/staff/tickets/:id` includes `requesterConfirmedResolvedAt`.
  The field is part of the same response shape as the Requester's own
  detail endpoint (api-spec.md §4.2 says "same shape as §3.3"), and the
  client/E2E layer (`UI-27`, `E2E-06`) proves the badge renders from real
  data end-to-end, so the gap is narrow — a one-line addition to
  `staff-ticket-detail.api.test.ts` would close it if a future issue wants
  the belt-and-suspenders API-level check.
- **No dedicated accessibility (axe-core) scan.** Same as Lab 2 (see
  `docs/lab-02/tests.md` §7) — label/error association is proven
  implicitly by every `getByLabelText`/`getByLabel` query throughout this
  suite, which is Lab 3's maintained standard, not a regression.
- **`docs/lab-03/ai_use.md` and `docs/lab-03/reviewer.md` do not exist
  yet.** `specification.md` §11's Course Delivery Requirements lists both
  as required repository documents, alongside peer review recorded in
  `reviewer.md` for every issue. Out of scope for this issue by explicit
  instruction — not touched here.
- **Fixture Tickets and users created *during* a run still exist for the
  rest of that run** — `global-setup.ts`/`global-teardown.ts` bracket the
  whole suite, and the two screenshot specs clean immediately before they
  capture, but a spec between those points can still see an earlier spec's
  same-run fixtures (e.g. `my-tickets/desktop.png` legitimately shows
  `screenshots.spec.ts`'s own 5 in-flight fixture Tickets alongside the 14
  seeded ones). This is expected, not a gap — see review round 2 above for
  the actual bug (cross-run accumulation) and its fix.
- **`docs/lab-02/tests.md` §2's `STYLE-02/03/04` rows still cite
  `e2e/lab-02/screenshots.spec.ts`**, but that file was moved to
  `e2e/lab-03/screenshots.spec.ts` by Issue #5 (its own header comment
  explains why: the flows it captures are session-authenticated now, so
  re-capturing them is Lab 3 evidence, written to
  `artifacts/lab-03/screenshots/` rather than overwriting Lab 2's
  already-submitted `artifacts/lab-02/screenshots/`). `docs/lab-02/tests.md`
  itself was not updated to reflect the move — flagged here since fixing it
  means editing a different lab's already-submitted document, which is
  outside this issue's scope; `docs/lab-03/tests.md` (§2.6 above) cites the
  correct current path.
