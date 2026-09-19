# Lab 3 Sprint Engineering Specification

Status: **Draft — pending student review and approval before implementation.**
Every interpretive call made while writing this document is called out in
[§11 Assumptions and Decisions](#11-assumptions-and-decisions). Review that
section first; correct anything that doesn't match intent before this
contract is handed to the coding agent.

## 1. Sprint Goal

Replace Lab 2's temporary Development Requester selector with real
email/password authentication and role-based authorization for three roles
— Requester, IT Staff, and Administrator — so that Requesters keep every
Lab 2 ticket capability under their authenticated identity, IT Staff gain an
operational Ticket Queue and Ticket Detail workflow (ownership, IT Priority,
status, Public Comments, Internal Notes), and Administrators get a
minimalist User Management screen, all without breaking or redesigning the
Lab 2 increment.

## 2. Stakeholder Request Interpretation

The stakeholder wants the "pick who you are" testing shortcut gone. In its
place: a real login that resolves identity and role from the database, and
a mandatory password change the first time anyone signs in with a password
an Administrator set for them. Requesters shouldn't notice much change —
their Lab 2 screens keep working, just against their real account instead
of a client-remembered id — but they gain two new abilities: talking to IT
Staff through Public Comments, and flagging that their problem looks fixed
without being able to formally close their own Ticket. IT Staff get the
first real operational surface in the product: a queue they can search,
filter, sort, and triage; a Ticket Detail where they claim or hand off
ownership, set their own priority read on the Ticket, move it through a
defined status workflow, talk to the Requester publicly, and leave notes
only their team can see. Administrators get exactly one screen, kept
deliberately small — list, create, edit, activate/deactivate, reset a
password — with a handful of hard safety rails (no duplicate emails, can't
lock themselves out, can't leave the system with zero Administrators) so a
single mistake can't take down access for everyone. Every one of these
boundaries has to hold at the API, not just in what the UI happens to show,
since the stakeholder was explicit that hiding a button is not
authorization.

## 3. Scope

### Included

- Email/password authentication: login, logout, current-user retrieval
- Mandatory password change on first login for any user whose password was
  set by an Administrator (new account or password reset)
- Role-based authorization for Requester, IT Staff, and Administrator,
  enforced server-side on every protected endpoint and reflected in
  role-scoped client navigation
- Migration of Ticket ownership from the Lab 2 `RequesterUser` testing
  identity to the real authenticated `User` model, preserving every
  existing Ticket and Attachment
- Continuation of all Lab 2 Requester functions (Create Ticket, My Tickets,
  Requester Ticket Detail, Attachment lifecycle) scoped to the authenticated
  Requester instead of a client-supplied id
- Requester Public Comments and a "Problem Appears Resolved" action
- IT Staff Ticket Queue: search, filter, sort, pagination across all
  Tickets
- IT Staff Ticket Detail: claim/reassign ownership, set IT Priority, change
  Current Status along a defined transition matrix, post Public Comments,
  write Internal Notes
- Administrator User Management: list/search/filter users, create a user
  with one role, edit name/email/role/active state, set a new initial
  password, with the safety rules in §5
- Zen Green visual system extended to the new screens — no new visual
  language

### Explicitly Excluded

- Email invitations, password-reset email, multi-factor authentication,
  social login, single sign-on
- Self-registration and Requester-created accounts
- Actions Taken (deferred to Lab 4)
- Formal SLA calculation, escalation rules, notification services
- Dashboards and KPI analytics beyond simple queue counts
- Multi-tenant organizations, departments, customer administration
- Production-grade deployment or cloud infrastructure changes
- Multiple roles assigned to one user
- User deletion, bulk user operations, import/export, account-history
  screens
- Department, organization, profile-photo, or other extended user-profile
  fields
- Email delivery of initial passwords or reset links
- Account unlocking, administrator approval workflows, advanced
  identity-management functions
- Login-attempt throttling or account lockout
- Voluntary password change outside the mandatory first-login flow (an
  Administrator resetting a password achieves the same effect if ever
  needed)
- Mandatory pagination, multi-column sorting, or multiple simultaneous
  filters on the Administrator user list

## 4. Functional Requirements

| ID | Requirement |
| --- | --- |
| FR-01 | The system shall let a user authenticate with an email address and password. |
| FR-02 | The system shall require a user marked as needing a password change to set a new valid password before any other screen becomes reachable. |
| FR-03 | The system shall let an authenticated user retrieve their own identity, role, and password-change requirement. |
| FR-04 | The system shall let an authenticated user log out, invalidating their session server-side. |
| FR-05 | The system shall show each authenticated user only the navigation and actions permitted for their role. |
| FR-06 | The system shall enforce role- and ownership-based authorization on every protected endpoint regardless of what the client's UI happens to show. |
| FR-07 | The system shall let an authenticated Requester create a Ticket under their own identity, exactly as in Lab 2. |
| FR-08 | The system shall let an authenticated Requester search, filter, sort, and paginate only their own Tickets, exactly as in Lab 2. |
| FR-09 | The system shall let an authenticated Requester manage Attachments on Tickets they own, exactly as in Lab 2. |
| FR-10 | The system shall let an authenticated Requester post a Public Comment on a Ticket they own. |
| FR-11 | The system shall let an authenticated Requester indicate that the reported problem appears resolved, without changing the Ticket's formal Current Status. |
| FR-12 | The system shall let an authenticated IT Staff user search, filter, sort, and paginate across every Ticket in a shared Ticket Queue. |
| FR-13 | The system shall let an authenticated IT Staff user open the full detail of any Ticket. |
| FR-14 | The system shall let an authenticated IT Staff user claim an unassigned or self-owned Ticket. |
| FR-15 | The system shall let an authenticated IT Staff user reassign a Ticket's ownership to any other active IT Staff user, or clear it back to unassigned. |
| FR-16 | The system shall let an authenticated IT Staff user set or change a Ticket's IT Priority. |
| FR-17 | The system shall let an authenticated IT Staff user change a Ticket's Current Status along the permitted transitions in §5. |
| FR-18 | The system shall let an authenticated IT Staff user post a Public Comment on any Ticket. |
| FR-19 | The system shall let an authenticated IT Staff user write an Internal Note on any Ticket, visible only to IT Staff and Administrator. |
| FR-20 | The system shall let an authenticated Administrator view and search/filter the full user list by name, email, or role. |
| FR-21 | The system shall let an authenticated Administrator create a user with a name, email, exactly one role, active state, and an initial password. |
| FR-22 | The system shall let an authenticated Administrator edit a user's name, email, role, and active state. |
| FR-23 | The system shall let an authenticated Administrator set a new initial password for an existing user, forcing a password change at that user's next login. |
| FR-24 | The system shall reject any attempt, by any role, to view or act on a Ticket, Attachment, Comment, or Note outside what that role and identity are permitted — direct URL, forged request, or otherwise. |
| FR-25 | The system shall prevent an Administrator from deactivating their own account. |
| FR-26 | The system shall prevent any action that would leave the system with zero active Administrators. |
| FR-27 | The system shall prevent two users from sharing the same email address, compared case-insensitively. |
| FR-28 | The system shall let an authenticated Administrator retrieve any Ticket's full detail via the API, including Internal Notes, so that BR-04's Administrator-visibility guarantee is actually reachable; this read is the only Ticket-related capability an Administrator has — no Ticket Queue, no claim/reassign, no priority/status/comment changes. |

## 5. Business Rules

| BR ID | Business Rule |
| --- | --- |
| BR-01 | Only an active user with valid credentials may authenticate. |
| BR-02 | A user marked as requiring a password change cannot enter the normal application until a new valid password is saved. |
| BR-03 | The authenticated user identity, not a requesterId supplied by the client, determines ownership of Requester operations. |
| BR-04 | Public Comments are visible to the Requester, IT Staff, and Administrator. Internal Notes are visible only to IT Staff and Administrator. |
| BR-05 | A Requester may indicate the problem appears resolved, but cannot formally set the Ticket to Resolved or Closed. |
| BR-06 | An unknown email or a wrong password both produce the same generic "Invalid email or password" response; the system never indicates which one was wrong or whether the email exists. |
| BR-07 | An account whose password is correct but is inactive is rejected with a distinct "account inactive" response rather than the generic invalid-credentials message. |
| BR-08 | Lab 3 implements no login-attempt throttling or account lockout; every login attempt is evaluated independently. |
| BR-09 | Passwords are hashed with bcrypt before storage; the plaintext password is never persisted, logged, or returned by any endpoint or error message. |
| BR-10 | Every password — an Administrator-set initial password or a user's replacement at first login — must be at least 8 characters and include an uppercase letter, a lowercase letter, a digit, and a special character. |
| BR-11 | A user created by an Administrator, or whose password is reset by an Administrator, is marked as requiring a password change and cannot reach any screen but Change Password until a valid new password is saved. |
| BR-12 | Logging out deletes the current session server-side and clears the session cookie client-side; any later request presenting the old cookie is treated as unauthenticated. |
| BR-13 | A session expires 12 hours after it is created, regardless of activity; an expired session is treated identically to no session at all. |
| BR-14 | The current-user endpoint returns the authenticated user's id, name, email, role, and password-change requirement, and is the single source the client uses to decide role-based navigation and the first-login gate. |
| BR-15 | Email addresses are stored and compared case-insensitively; creating or editing a user with an email matching an existing user's, in any case, is rejected as a duplicate. |
| BR-16 | Every Ticket, Attachment, Public Comment, and Internal Note operation that Lab 2 scoped to the Development Requester now derives the Requester's identity from the authenticated session; the underlying ownership rule (a Requester may only act on Tickets/Attachments they own) is otherwise unchanged from Lab 2. |
| BR-17 | Only a user with the Requester role may create a Ticket; the Ticket's Requester is set once at creation from the authenticated session and is never reassigned. |
| BR-18 | A Ticket's Owner (who is working it) is distinct from its Requester (who filed it); a Ticket may have zero or one Owner. |
| BR-19 | Claiming a Ticket sets the acting IT Staff user as Owner. Claiming a Ticket the same user already owns is a no-op. Claiming a Ticket owned by someone else is rejected — use Reassign instead. |
| BR-20 | Reassigning a Ticket sets its Owner to any active IT Staff user of the acting user's choosing, including themselves, or clears ownership back to unassigned. |
| BR-21 | IT Priority is set to the Ticket's Requested Priority at creation and may thereafter be changed only by IT Staff. |
| BR-22 | Current Status may be changed only by IT Staff, and only along a transition explicitly permitted by the matrix in §7; an unrecognized or disallowed transition is rejected and the Ticket's status is unchanged. |
| BR-23 | The required Current Status values are New, Open, In Progress, Waiting for Requester, Resolved, Closed, Reopened, and Cancelled. Lab 2's `PENDING` value is renamed to `WAITING_FOR_REQUESTER` and `REOPENED` is added by migration; no Lab 2 Ticket loses status meaning in the process. |
| BR-24 | Marking "Problem Appears Resolved" is idempotent — repeating it only updates the timestamp — and never itself changes Current Status; it exists as a signal IT Staff can see, not a state transition. |
| BR-25 | "Problem Appears Resolved" may be set only by the owning Requester, and only while the Ticket's Current Status is not Closed or Cancelled. |
| BR-26 | A Public Comment or Internal Note must have non-empty, non-whitespace-only content between 1 and 2000 characters after trimming; anything outside that range is rejected with a field-level error and nothing is saved. |
| BR-27 | Public Comments and Internal Notes are append-only in Lab 3 — no endpoint edits or deletes either. |
| BR-28 | Every Public Comment and Internal Note records its author and creation timestamp from the backend; neither is ever accepted from the client. |
| BR-29 | An Internal Note request from a caller with the Requester role is rejected regardless of Ticket ownership, and the response never includes Internal Note content. |
| BR-30 | A Requester may post a Public Comment only on a Ticket they own. An IT Staff user may post a Public Comment on any Ticket, since triage communication is a shared queue responsibility, not an ownership-scoped one. |
| BR-31 | The Ticket Queue is not ownership-scoped: any active IT Staff user may search, filter, sort, and open any Ticket regardless of who currently owns it. |
| BR-32 | The Ticket Queue supports search by Ticket Number or Summary; filtering by Category, Requested Priority, IT Priority, Current Status, and Ticket Owner (including "Unassigned"); and sorting by Created Date, Ticket Number, Requested Priority, IT Priority, Current Status, and Last Updated. Combined filters use AND logic, matching Lab 2's My Tickets precedent. |
| BR-33 | An Administrator assigns exactly one role — Requester, IT Staff, or Administrator — when creating a user; the system has no concept of a user holding more than one role at a time. |
| BR-34 | An Administrator may edit a user's name, email, role, and active state; a change that deactivates a user or changes their role immediately invalidates that user's existing sessions, so the change takes effect on their very next request rather than waiting for their current session to expire. |
| BR-35 | An Administrator cannot deactivate their own account; any edit whose target id equals the acting Administrator's own id and would set `isActive` to false is rejected. |
| BR-36 | The system must always retain at least one active Administrator; an edit that would deactivate the last active Administrator, or change the last active Administrator's role away from Administrator, is rejected. |
| BR-37 | Setting a new initial password for an existing user replaces their stored password hash, marks them as requiring a password change, and does not require knowledge of their previous password. |
| BR-38 | The Administrator user list search matches name or email, case-insensitive, partial match; an optional role filter narrows further; both combine with AND logic. |
| BR-39 | The Administrator user list is not paginated in Lab 3 — it returns every matching user in one response, ordered by name ascending. |
| BR-40 | An Administrator may retrieve a Ticket's full detail, including Internal Notes, via `GET /api/staff/tickets/:id` — this is the only Ticket-related capability granted to the Administrator role. Administrators cannot list the Ticket Queue, claim/reassign ownership, change IT Priority or Current Status, or post any Comment or Note, and Lab 3's UI gives them no navigation route to this endpoint — it exists at the API level solely so BR-04's promise ("Internal Notes are visible... to IT Staff and Administrator") is actually true rather than unreachable. |

## 6. UI Specification Summary

Full detail lives in [`ui-spec.md`](./ui-spec.md). Summary:

- **Screens**: Login, mandatory Change Password, an updated authenticated
  application shell (replaces the Development Requester display with the
  authenticated user's name, role, and Logout), Create Ticket / My Tickets
  (unchanged from Lab 2 except for identity source), Requester Ticket Detail
  (adds Public Comments and Problem Appears Resolved), IT Staff Ticket
  Queue, IT Staff Ticket Detail, Administrator User Management.
- **Modes**: every screen distinguishes create / view / edit where
  applicable — Login has no modes; Change Password is a single required
  form; Ticket Queue is view-only with a link into Ticket Detail; Ticket
  Detail (both Requester and IT Staff variants) mixes read-only Ticket
  fields with role-specific editable controls; User Management has a list
  (view) mode plus create and edit panels.
- **Controls**: role-gated navigation items only ever show destinations the
  current role is permitted to reach — a hidden or absent control is a UX
  convenience, never the authorization mechanism (FR-06).
- **Feedback states**: loading, validating, submitting/busy, success,
  field-level validation, empty vs. no-results, forbidden, and safe
  API-failure states are defined for every screen that talks to the API,
  following the same conventions established in Lab 2's `ui-spec.md` §5.
- **Role-based behavior**: Requester navigation shows My Tickets / Create
  Ticket only; IT Staff navigation shows Ticket Queue only; Administrator
  navigation shows User Management only. No role sees another role's
  screens in navigation, and direct URL access to an unpermitted screen is
  rejected server-side (FR-06, FR-24) and shown client-side as a forbidden
  state, not a silent redirect that hides the reason.
- **Responsive rules**: unchanged from Lab 2 — desktop ≥ 992px, tablet
  768–991px, mobile < 768px, no horizontal scrolling at any size — extended
  to the Ticket Queue table and the User Management list/create panel.

## 7. Ticket Status Workflow

Required statuses (BR-23): New, Open, In Progress, Waiting for Requester,
Resolved, Closed, Reopened, Cancelled. Only IT Staff may transition status
(BR-22); a Requester's "Problem Appears Resolved" action (BR-24, BR-25)
never appears in this table because it is not a status transition.

| From \ To | Open | In Progress | Waiting for Requester | Resolved | Closed | Reopened | Cancelled |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **New** | ✓ | ✓ | | | | | ✓ |
| **Open** | | ✓ | ✓ | | | | ✓ |
| **In Progress** | | | ✓ | ✓ | | | ✓ |
| **Waiting for Requester** | | ✓ | | ✓ | | | ✓ |
| **Resolved** | | | | | ✓ | ✓ | |
| **Closed** | | | | | | ✓ | |
| **Reopened** | ✓ | ✓ | | | | | |
| **Cancelled** | *(terminal — no further transitions)* | | | | | | |

Any transition not marked ✓ is rejected (BR-22) with a safe error and no
status change. `Reopened` is a deliberate transitional status distinct from
`In Progress`/`Open` — it signals "this was previously closed and needs
re-triage" and must itself move to `Open` or `In Progress` before further
work is recorded.

## 8. Data Changes

Full target schema lives below; migration mechanics are in §8.3. This is
**not** applied to `server/prisma/schema.prisma` by this specification
task — that happens in the implementation phase.

### 8.1 Relationships

- One `User` with role `REQUESTER` owns many `Ticket`s as Requester (1:N,
  unchanged from Lab 2's `RequesterUser`–`Ticket` relationship).
- One `Ticket` may have zero or one `User` as its Owner, who must have role
  `IT_STAFF` (1:N from the Owner side; see §11 for why `ADMINISTRATOR`
  ownership, though schema-legal per the handout, is not exercised in Lab 3).
- One `Ticket` may have many `TicketComment`s, each `PUBLIC` or `INTERNAL`.
- Each `TicketComment` has exactly one author `User`.
- One `User` may have many `Session`s (in practice usually zero or one at a
  time, since logout deletes the row, but nothing prevents concurrent
  sessions from different devices).
- Existing `Category`, `RelatedSystem`, `Ticket`, and `Attachment` data
  remains valid and untouched by this migration except for the additive
  columns below.

### 8.2 Target Prisma Schema

```prisma
enum UserRole {
  REQUESTER
  IT_STAFF
  ADMINISTRATOR
}

model User {
  id                 Int       @id @default(autoincrement())
  name               String
  email              String    @unique
  passwordHash       String
  role               UserRole
  isActive           Boolean   @default(true)
  mustChangePassword Boolean   @default(false)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  ticketsFiled Ticket[]        @relation("TicketRequester")
  ticketsOwned Ticket[]        @relation("TicketOwner")
  comments     TicketComment[]
  sessions     Session[]

  @@index([role])
}

model Session {
  id        Int      @id @default(autoincrement())
  tokenHash String   @unique
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  expiresAt DateTime

  @@index([userId])
  @@index([expiresAt])
}

enum CommentVisibility {
  PUBLIC
  INTERNAL
}

model TicketComment {
  id         Int               @id @default(autoincrement())
  ticketId   Int
  ticket     Ticket            @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  authorId   Int
  author     User              @relation(fields: [authorId], references: [id])
  visibility CommentVisibility
  content    String
  createdAt  DateTime          @default(now())

  @@index([ticketId])
  @@index([ticketId, visibility])
}

enum RequestedPriority {
  LOW
  MEDIUM
  HIGH
}

// WAITING_FOR_REQUESTER replaces Lab 2's PENDING (BR-23); REOPENED is new.
enum TicketStatus {
  NEW
  OPEN
  IN_PROGRESS
  WAITING_FOR_REQUESTER
  RESOLVED
  CLOSED
  REOPENED
  CANCELLED
}

model Ticket {
  id                            Int               @id @default(autoincrement())
  ticketNumber                  String            @unique
  requesterId                   Int
  requester                     User              @relation("TicketRequester", fields: [requesterId], references: [id])
  ownerId                       Int?
  owner                         User?             @relation("TicketOwner", fields: [ownerId], references: [id])
  categoryId                    Int
  category                      Category          @relation(fields: [categoryId], references: [id])
  relatedSystemId               Int
  relatedSystem                 RelatedSystem     @relation(fields: [relatedSystemId], references: [id])
  summary                       String
  description                   String
  requestedPriority             RequestedPriority
  itPriority                    RequestedPriority
  currentStatus                 TicketStatus      @default(NEW)
  requesterConfirmedResolvedAt  DateTime?
  createdAt                     DateTime          @default(now())
  updatedAt                     DateTime          @updatedAt

  attachments Attachment[]
  comments    TicketComment[]

  @@index([requesterId])
  @@index([ownerId])
  @@index([categoryId])
  @@index([relatedSystemId])
  @@index([currentStatus])
  @@index([itPriority])
  @@index([createdAt])
}
```

`Category`, `RelatedSystem`, and `Attachment` are unchanged from Lab 2's
`specification.md` §7.2.

### 8.3 Migration from Lab 2

The Lab 2 `RequesterUser` table becomes the Lab 3 `User` table **in place**
— its rows are not copied or re-keyed:

1. Add `role`, `passwordHash`, `mustChangePassword`, `updatedAt` columns to
   the existing `RequesterUser` table (temporarily nullable/defaulted where
   needed for backfill).
2. Backfill every existing row: `role = 'REQUESTER'`, `passwordHash` = a
   bcrypt hash of a documented local-dev password, `mustChangePassword =
   true` (this deliberately routes every migrated Lab 2 Requester through
   the first-login Change Password flow, which doubles as regression
   coverage for BR-02/BR-11 against real migrated data rather than only
   fresh seed rows).
3. Rename the table/model from `RequesterUser` to `User`. Because the row
   ids are untouched, every existing `Ticket.requesterId` foreign key value
   remains valid with no data rewrite — this is the reason Lab 2's schema
   is evolved rather than replaced (handout §5: "without discarding
   existing Ticket or Attachment data").
4. Add `ownerId`, `itPriority`, `requesterConfirmedResolvedAt` to `Ticket`.
   Backfill `itPriority = requestedPriority` for every existing row (BR-21).
   `ownerId` and `requesterConfirmedResolvedAt` default to `NULL`.
5. Migrate the `TicketStatus` enum via two raw SQL steps (Prisma does not
   generate enum-value renames or positioned inserts automatically), in
   this order:
   1. `ALTER TYPE "TicketStatus" RENAME VALUE 'PENDING' TO 'WAITING_FOR_REQUESTER';`
      — every existing seeded Ticket in that status keeps its meaning under
      the new name instead of losing it.
   2. `ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED' BEFORE 'CANCELLED';`
      — the explicit `BEFORE` clause is required. Postgres sorts an enum's
      values by declaration order, and a plain `ADD VALUE` with no
      position would append `REOPENED` after `CANCELLED`, leaving the
      on-disk order out of sync with §8.2's schema (`..., CLOSED, REOPENED,
      CANCELLED`). Since BR-32 makes Current Status sortable, that mismatch
      would make the Queue's status sort silently disagree with the schema
      anyone reads.
6. Create the `Session` and `TicketComment` tables.
7. New IT Staff and Administrator accounts are added only via seed data
   (§8.4), never derived from Lab 2 data — Lab 2 never had any concept of
   those roles.

### 8.4 Required Seed Data

- All Lab 2 seed seams stay in place: 4 Categories, ≥ 6 Related Systems, and
  the existing seeded Tickets/Attachments, now owned by migrated `User`
  rows with role `REQUESTER`.
- ≥ 4 active Requester accounts and 1 inactive Requester account (the
  migrated Lab 2 rows satisfy this if Lab 2's seed already met its own
  minimums).
- ≥ 3 active IT Staff accounts and 1 inactive IT Staff account.
- ≥ 1 active Administrator account.
- A realistic spread of Ticket ownership across the new fields: some
  Tickets unassigned (`ownerId = null`), some claimed by different seeded
  IT Staff, Tickets across multiple `TicketStatus` and `itPriority` values,
  and a handful of seeded Public Comments and Internal Notes that reveal no
  sensitive information.
- Every seeded account uses the same documented local-dev password
  (`DevPass123!`, satisfying BR-10), with `mustChangePassword = true` on at
  least one seeded account so the first-login flow has a deterministic
  fixture to test against without relying on migrated data alone.
- Seed logic remains idempotent (safe to run repeatedly), consistent with
  the existing `upsert`-based `prisma/seed.ts` pattern.
- Seeded credentials are for local development only, clearly documented as
  such, and are not real personal passwords or secrets.

### 8.5 Implementation Notes (Issue #2)

Choices made while writing the migration and seed that §8.2–§8.4 did not fix:

- **Hashing library**: `bcryptjs` (pure JS, cost 10). Native `bcrypt` needs an
  install script, which pnpm blocks in this repo. Hashes are interchangeable.
- **Migrated passwords**: the migration writes one precomputed bcrypt hash of
  `DevPass123!` for every migrated row, so it needs no database extension.
- **Case-insensitive email (BR-15)**: the migration lower-cases existing emails
  and adds `CHECK (email = lower(email))`, so the `@unique` index is
  effectively case-insensitive at the database. The API must lower-case emails
  before writing them. If two Lab 2 rows differed only by case, the migration
  fails on the unique index instead of merging them.
- **Foreign keys**: `Ticket.requesterId` and `TicketComment.authorId` are
  `RESTRICT`; `Ticket.ownerId` is `SET NULL`; `TicketComment.ticketId` and
  `Session.userId` are `CASCADE`. Users are deactivated, never deleted (§3), so
  the delete rules only matter for tests and manual cleanup.
- **Ticket Owner role**: not enforced by the database (§12-7); the seed only
  assigns active IT Staff.
- **Seed convergence**: re-running resets seeded users to the documented state
  (name, role, active flag, `mustChangePassword`, dev password) and does not
  duplicate Tickets or comments. Comments are matched by ticket, author,
  visibility and content.
- **Lab 2 code touched**: the `PENDING` to `WAITING_FOR_REQUESTER` rename and
  new `REOPENED` value were applied to the server status filter and the client
  status maps (`REOPENED` reuses the Open badge). `POST /api/tickets` sets
  `itPriority` from `requestedPriority` (BR-21). The dev Requester lookup only
  accepts `REQUESTER` users. No new routes or screens.

### 8.6 Implementation Notes (Issue #3)

Choices made while writing the auth endpoints that the contract did not fix:

- **Login check order**: password first, then `isActive`, so `INACTIVE_ACCOUNT`
  (BR-07) is only shown to someone who already knows the password. An unknown
  email is compared against a dummy bcrypt hash so it takes the same time as a
  wrong password (BR-06).
- **Email**: trimmed and lower-cased before lookup (BR-15, §8.5 CHECK).
- **Change password**: deletes every session the user has, not only the current
  one, then issues a fresh session. A wrong current password returns
  `INVALID_CREDENTIALS` with `field: "currentPassword"`. Reusing the current
  password as the new one is allowed; the contract does not forbid it.
- **Secrets**: none needed. Session tokens are 32 random bytes and only their
  SHA-256 is stored, so there is no signing key or hashing pepper to configure.
- **Not in this issue**: the `PASSWORD_CHANGE_REQUIRED` gate on non-auth
  endpoints (§1.5) and role guards. `mustChangePassword` is exposed by login
  and `/api/auth/me`; enforcing it belongs with the authorization middleware.
  Expired `Session` rows are ignored on read but never purged.

## 9. API Contract

Full detail lives in [`api-spec.md`](./api-spec.md). Endpoint summary:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Authenticate with email/password, start a session |
| POST | `/api/auth/logout` | End the current session |
| GET | `/api/auth/me` | Retrieve the authenticated user's identity and role |
| POST | `/api/auth/change-password` | Satisfy the mandatory first-login password change |
| GET | `/api/categories` | List active Categories (any authenticated user) |
| GET | `/api/related-systems` | List active Related Systems (any authenticated user) |
| POST | `/api/tickets` | Create a Ticket as the authenticated Requester |
| GET | `/api/tickets` | Search/filter/sort/paginate the authenticated Requester's own Tickets |
| GET | `/api/tickets/:id` | Retrieve one owned Ticket, with Attachments and Public Comments |
| POST | `/api/tickets/:id/attachments` | Upload an Attachment to an owned Ticket |
| GET | `/api/attachments/:id/download` | Download an active, owned Attachment |
| PATCH | `/api/attachments/:id/remove` | Soft-remove an owned Attachment |
| POST | `/api/tickets/:id/comments` | Post a Public Comment on an owned Ticket |
| PATCH | `/api/tickets/:id/resolved` | Mark "Problem Appears Resolved" on an owned Ticket |
| GET | `/api/staff/tickets` | Search/filter/sort/paginate the shared Ticket Queue (IT Staff only) |
| GET | `/api/staff/tickets/:id` | Retrieve full Ticket detail, including Internal Notes (IT Staff; read-only for Administrator too — BR-04/BR-40) |
| PATCH | `/api/staff/tickets/:id/claim` | Claim an unassigned or self-owned Ticket; rejected if someone else already owns it (BR-19) |
| PATCH | `/api/staff/tickets/:id/owner` | Reassign Ticket ownership to any active IT Staff user, or clear it (BR-20) |
| PATCH | `/api/staff/tickets/:id/priority` | Change IT Priority |
| PATCH | `/api/staff/tickets/:id/status` | Change Current Status along the permitted transitions |
| POST | `/api/staff/tickets/:id/comments` | Post a Public Comment or an Internal Note |
| GET | `/api/admin/users` | List/search/filter users |
| POST | `/api/admin/users` | Create a user with one role |
| PATCH | `/api/admin/users/:id` | Edit a user's name/email/role/active state |
| PATCH | `/api/admin/users/:id/password` | Set a new initial password |

Authentication is an httpOnly session cookie (see `api-spec.md` §0.1 and
§11-1 for the justification). Every endpoint above except login carries an
authenticated user; every endpoint except the two reference-data `GET`s
additionally enforces a role and, where applicable, an ownership check
(FR-06, FR-24).

## 10. Acceptance Criteria

| ID | Criterion |
| --- | --- |
| AC-01 | Given an active user with valid credentials, when the user logs in, then the backend establishes authenticated access and returns the permitted user identity and role. |
| AC-02 | Given a user who must change the initial password, when login succeeds, then normal application screens remain unavailable until a valid new password is saved. |
| AC-03 | Given an authenticated Requester, when the client supplies another requesterId, then the backend still applies the authenticated identity and does not return another Requester's data. |
| AC-04 | Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected without exposing note content. |
| AC-05 | Given an unknown email or a wrong password, when login is attempted, then a generic "Invalid email or password" response is returned and no indication is given whether the email exists. |
| AC-06 | Given a correct password for an inactive account, when login is attempted, then a distinct inactive-account response is returned and no session is created. |
| AC-07 | Given an authenticated user, when they log out, then the session is invalidated server-side and a subsequent request with the old cookie is treated as unauthenticated. |
| AC-08 | Given no session cookie or an expired session, when a protected endpoint is called, then a 401 response is returned and no data is disclosed. |
| AC-09 | Given an Administrator creates a user with an email that differs only in letter case from an existing user's email, when the form is submitted, then creation is rejected as a duplicate email. |
| AC-10 | Given a Requester, when their navigation renders, then only Requester-permitted destinations appear, with no Ticket Queue or Admin links. |
| AC-11 | Given an IT Staff account, when it calls a User Management endpoint directly, then the request is rejected as forbidden. |
| AC-12 | Given a Requester's own Ticket, when they post a Public Comment, then the comment is saved with their identity and timestamp and is visible to IT Staff and Administrator. |
| AC-13 | Given a Requester's own Ticket, when they mark "Problem Appears Resolved", then the Ticket's Current Status is unchanged and IT Staff viewing the Ticket see the resolved-by-Requester signal. |
| AC-14 | Given a Ticket not owned by the current Requester, when they attempt to mark it "Problem Appears Resolved", then the request is rejected as not found. |
| AC-15 | Given an unassigned Ticket, when an IT Staff user claims it, then they become the Ticket Owner and the Queue reflects the new owner. |
| AC-16 | Given a Ticket owned by IT Staff member A, when IT Staff member B reassigns it to themselves, then Ticket Owner becomes B and the change is visible to both in the Queue. |
| AC-17 | Given a Ticket, when IT Staff changes IT Priority, then the new value is saved and Requested Priority is unchanged. |
| AC-18 | Given a Ticket in Current Status New, when IT Staff attempts to set it directly to Closed, then the transition is rejected as not permitted. |
| AC-19 | Given a Ticket in Current Status Resolved, when IT Staff sets it to Reopened, then the transition succeeds and the Ticket is again actionable. |
| AC-20 | Given a Ticket, when IT Staff writes an Internal Note, then it is saved and does not appear anywhere in the Requester's Ticket Detail view. |
| AC-21 | Given a Public Comment or Internal Note submitted with only whitespace, when it is submitted, then it is rejected with a field-level error and nothing is saved. |
| AC-22 | Given the IT Staff Ticket Queue, when a user searches by Ticket Number, then only matching Tickets across all Requesters are shown. |
| AC-23 | Given the IT Staff Ticket Queue, when filters for Category and Current Status are applied together, then only Tickets matching both are shown. |
| AC-24 | Given more Tickets than one page, when the Queue loads, then only the first page is shown with correct pagination metadata. |
| AC-25 | Given the Queue's filtered results are empty, when it renders, then a no-results state with a Clear Filters action is shown. |
| AC-26 | Given zero Tickets exist system-wide, when the Queue renders, then an empty state is shown, distinct from no-results. |
| AC-27 | Given an Administrator opens User Management, when the page loads, then the user list shows Name, Email, Role, Status, and an Edit action for every user. |
| AC-28 | Given an Administrator searches by partial name, when the search runs, then only matching users are shown, case-insensitively. |
| AC-29 | Given an Administrator creates a user with a password that lacks a special character, when the form is submitted, then it is rejected with a field-level password-rule error and no user is created. |
| AC-30 | Given an Administrator sets a new initial password for an existing user, when that user next logs in with it, then they are routed to the mandatory Change Password screen. |
| AC-31 | Given an Administrator's own account, when they attempt to deactivate it, then the action is rejected and the account remains active. |
| AC-32 | Given exactly one active Administrator, when an attempt is made to deactivate that account or change its role, then the action is rejected and at least one active Administrator remains. |
| AC-33 | Given an inactive user, when they attempt to log in with correct credentials, then access is denied with the inactive-account response. |
| AC-34 | Given the viewport is narrowed to mobile width, when the Ticket Queue and User Management screens are viewed, then no horizontal scrolling occurs and all controls remain reachable. |
| AC-35 | Given a direct API call to an IT-Staff-only endpoint made by an authenticated Requester, when the call is made, then it is rejected as forbidden regardless of any hidden or disabled UI control. |
| AC-36 | Given an Administrator session, when they call `GET /api/staff/tickets/:id` for an existing Ticket, then the response includes its Internal Notes (BR-04, BR-40). |
| AC-37 | Given an Administrator session, when they call `GET /api/staff/tickets` (the Queue) or any `/api/staff/tickets/:id/*` mutation endpoint, then it is rejected as forbidden (BR-40). |
| AC-38 | Given a Ticket owned by IT Staff member A, when IT Staff member B calls Claim (not Reassign) on it, then the claim is rejected, Ticket Owner remains A, and the error indicates Reassign should be used instead (BR-19). |

## 11. Definition of Done

### Product Completion

- [ ] All scoped screens implemented: Login, mandatory Change Password,
      updated authenticated shell, Create Ticket / My Tickets / Requester
      Ticket Detail (Lab 2 functions plus Public Comments and Problem
      Appears Resolved), IT Staff Ticket Queue, IT Staff Ticket Detail,
      Administrator User Management
- [ ] Every acceptance criterion (AC-01–AC-38) has passing, traceable
      automated test evidence per `tests.md`
- [ ] No required test is skipped, disabled, or commented out
- [ ] Every Lab 2 Requester function (create, list/search/filter/sort/
      paginate, view, attach/download/remove) still passes its original
      Lab 2 acceptance criteria under the authenticated identity — no
      regression from the `RequesterUser` → `User` migration
- [ ] Role and ownership authorization is verified by at least one direct
      API-level test per protected endpoint, independent of what the UI
      shows or hides (FR-06, FR-24)
- [ ] Password hashing, session issuance, session expiry, and logout
      invalidation all have passing automated test evidence
- [ ] The mandatory first-login password-change gate is verified against
      both a freshly Administrator-created user and a migrated Lab 2
      Requester account
- [ ] Administrator safety rules (no duplicate emails, no self-
      deactivation, no removing the last active Administrator) each have
      passing automated test evidence
- [ ] Ticket Status transitions match the matrix in §7 exactly — every
      permitted transition succeeds and every other transition is rejected
      with no status change
- [ ] Public Comment / Internal Note visibility (BR-04, BR-29) is verified
      by at least one direct API-level test proving a Requester never
      receives Internal Note content in any response
- [ ] Implemented screens and APIs conform to `ui-spec.md` and
      `api-spec.md`
- [ ] Zen Green tokens and components are reused, not reinvented, for every
      new screen; responsive rules hold with no clipping, overlap, or
      horizontal scrolling
- [ ] Success, failure, validation, loading, empty, no-results, and
      forbidden states are implemented and covered by tests for every
      screen that needs them
- [ ] Migration steps in §8.3 are captured as real Prisma migration files,
      run cleanly against a fresh Lab 2 database snapshot, and preserve
      every existing Ticket/Attachment row with no data loss
- [ ] `README.md` setup and test instructions are current for the Lab 3
      increment, reverified against a fresh clone
- [ ] All required tests pass from documented commands on the final `main`
      branch

### Course Delivery Requirements (checked separately from Product
Completion)

- [ ] Work delivered via GitHub Issues and feature branches into
      `lab3-staging`, then one release Pull Request into `main`
- [ ] Peer review completed and recorded in `reviewer.md` for every issue
- [ ] Review comments addressed
- [ ] Required repository documents present: `specification.md`,
      `tests.md`, `ui-spec.md`, `api-spec.md`, `reviewer.md`, `ai_use.md`

## 12. Assumptions and Decisions

Every item below is an interpretation this specification made where the
handout left the choice to the student. Anything marked **(reversible)** is
cheap to change before implementation; anything marked **(structural)**
touches the API/schema shape and is more costly to change after the coding
agent starts.

1. **(structural) Session strategy: httpOnly cookie backed by a database
   Session row**, not a JWT. Rejected JWT because logout has to be a real,
   immediate invalidation (BR-12) and a stateless JWT can't be revoked
   without either a blocklist (which reintroduces server-side state anyway)
   or waiting out the token's lifetime. An opaque, randomly generated
   session token is stored **hashed** (not raw) in the `Session` table, sent
   to the browser only as an httpOnly, `Secure` (in production), `SameSite=
   Lax` cookie. Logout deletes the row; Administrator-driven deactivation or
   role change deletes the target user's session rows (BR-34) for the same
   reason. A 12-hour fixed expiration (BR-13), not a sliding one, was chosen
   for simplicity — no refresh-token machinery for a lab-scale app.
2. **(reversible) CSRF**: not addressed with a dedicated token. The client
   and API are same-origin in both dev (Vite's `/api` proxy to Express, per
   `client/vite.config.ts`) and the expected production deployment (one
   origin serving both), and the session cookie is `SameSite=Lax`, which
   already blocks the cookie from riding along on a cross-site POST/PATCH
   from a foreign page. If the frontend is ever hosted on a different origin
   from the API, a CSRF token (or `SameSite=Strict` plus an explicit
   same-origin check) should be added at that point — flagged here rather
   than built speculatively now.
3. **(reversible) Password hashing: bcrypt**, industry-standard for this
   scale, well-supported in the existing Node/Express stack, no new
   infrastructure required.
4. **(reversible) Password complexity rule**: 8+ characters, upper, lower,
   digit, special character — taken directly from the handout's illustrative
   Change Password screenshot (§8.1) rather than invented.
5. **(structural) `RequesterUser` becomes `User` in place**, not a fresh
   table with re-keyed data. Preserving row ids means every existing
   `Ticket.requesterId` value is still valid with zero data rewrite —
   directly satisfies the handout's "without discarding existing Ticket or
   Attachment data" (§5) with the least migration risk. New IT Staff and
   Administrator rows are added fresh via seed, never derived from Lab 2
   data (Lab 2 had no concept of those roles).
6. **(structural) Migrated Lab 2 Requesters are forced through the
   first-login Change Password flow** (`mustChangePassword = true`,
   documented shared dev password) rather than being issued real passwords
   directly. This both answers the handout's explicit question ("how
   existing Requesters receive initial passwords") and gives the
   mandatory-change gate a real migrated-data test path, not just a
   freshly-seeded one.
7. **(structural) Ticket Owner is restricted, in practice, to active IT
   Staff.** The handout's §5.1 database-level language allows an
   Administrator as a legal Ticket Owner value, and the schema keeps that
   column type permissive for forward compatibility — but per the
   stakeholder's explicit instruction that "Administrator and IT Staff
   responsibilities should remain conceptually separate" and that an
   Administrator does not automatically get IT Staff Ticket operations,
   Lab 3's application layer never offers Administrators a Ticket Queue,
   never lets them claim/reassign, and the reassignment target list is
   IT Staff only. This is the single most consequential judgment call in
   this document — flag it for review before implementation if the intent
   was for Administrators to also work Tickets.
   **Correction after review**: BR-04 ("Internal Notes are visible only to
   IT Staff and Administrator") is a given, non-negotiable rule, and the
   first draft of this document made it unreachable — no endpoint an
   Administrator could call ever returned Comment or Note content. FR-28/
   BR-40 close that gap with one narrow, read-only exception:
   `GET /api/staff/tickets/:id` also accepts an Administrator session. It
   is the only Ticket-related access an Administrator has; the Queue and
   every mutation endpoint remain IT-Staff-only, so the "conceptual
   separation" this item argues for still holds for every operation that
   isn't pure retrieval.
8. **(reversible) Ticket Queue default sort: Created Date ascending (oldest
   first)**, not Lab 2's My Tickets default of newest-first. A shared work
   queue's natural default is "what's been waiting longest," to discourage
   Tickets going stale; any other sort remains one click away.
9. **(reversible) Ticket Queue pagination defaults match Lab 2's My
   Tickets**: page size 10 (default) / 50 (max), 1-based `page`, clamped
   rather than rejected — consistency over novelty, and Lab 2's tests
   already prove the pattern out.
10. **(reversible) Comments/Notes are one model with a `visibility`
    enum** (`PUBLIC`/`INTERNAL`), not two separate tables. They share every
    field except who's allowed to read them; a single model with a
    role-checked visibility filter is less duplication than two near-
    identical models, and matches how the handout itself describes them as
    two flavors of one "communicate/record" concept (§4.6).
11. **(reversible) "Problem Appears Resolved" is a one-way, non-resettable
    timestamp** (`requesterConfirmedResolvedAt`), not a boolean the
    Requester can toggle off, and it is not automatically cleared when IT
    Staff changes status. The handout describes it as a signal IT Staff act
    on, not a piece of state the Requester manages — the simplest field that
    satisfies that is a nullable timestamp, set once, re-settable only by
    posting again (BR-24).
12. **(reversible) Reference-data endpoints (`/api/categories`,
    `/api/related-systems`) now require authentication** (any active role),
    where Lab 2 left them open. They carry nothing role-sensitive, but
    Lab 3 has no legitimately unauthenticated screen left that needs them,
    so requiring a session is a small, consistent tightening rather than a
    functional change.
13. **(reversible) Field length limit for Comments/Notes: 1–2000
    characters** after trimming, matching Lab 2's Description field bound
    (`specification.md` §11-11 precedent) — not specified by the handout.
14. **(structural) Route namespaces split by audience**:
    `/api/tickets/*` stays Requester-scoped (ownership-checked from the
    session, direct continuation of Lab 2's shape), while
    `/api/staff/tickets/*` is the new IT-Staff-scoped, non-ownership-checked
    surface. This mirrors the handout's own bullet structure (separate
    "Requester Ticket" vs. "IT Staff Ticket Detail" retrieval requirements
    in §6) and keeps each namespace's authorization policy uniform instead
    of one endpoint branching on caller role internally.
15. **(reversible) Claim and Reassign are two separate endpoints, not
    one.** `PATCH .../claim` (self-only; rejected if someone else already
    owns the Ticket — BR-19) and `PATCH .../owner` (reassign to any active
    IT Staff id or `null`, no ownership precondition — BR-20) enforce two
    different rules with two different failure conditions. A single
    endpoint accepting an arbitrary `ownerId` can't enforce BR-19's
    "claiming someone else's Ticket is rejected" without either silently
    reinterpreting every self-assignment as a claim — which would break
    BR-20's unrestricted reassign-to-self case — or requiring the client to
    signal intent some other way. Two endpoints make each rule's
    precondition explicit and independently testable. (First draft had one
    combined endpoint with BR-20's unrestricted semantics, silently
    dropping BR-19's rejection case — caught in review.)
