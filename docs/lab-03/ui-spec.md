# Lab 3 UI Specification — Zen Green Theme

This document is the visual and behavioral contract for every new or
changed Lab 3 screen. It extends `docs/lab-02/ui-spec.md`, which remains
normative for every token, component rule, and screen it already covers
(Create Ticket, My Tickets — unchanged in Lab 3 except for identity
source). Nothing here introduces a new visual system; every new screen
reuses the color tokens (§1), typography (§2), field states (§3), button
hierarchy (§4), state conventions (§5), accessibility rules (§7), and
responsive breakpoints (§8) already defined there.

## 1. Application Shell (updated)

Replaces Lab 2's Development Requester display and Change Requester action.

- Header: unchanged `--zg-primary` background, "TokTickIT" wordmark on the
  left.
- Navigation is role-scoped — only the current user's permitted
  destinations render:
  - **Requester**: My Tickets, Create Ticket.
  - **IT Staff**: Ticket Queue.
  - **Administrator**: User Management.
  - No role ever sees another role's nav items (specification.md §12-7).
- Right side: a "Profile" menu showing the authenticated user's name and
  role (e.g. *"Michael Brown · IT Staff"*), containing a single Logout
  action. No password/profile-editing controls exist here — an
  Administrator resets a password from User Management, not the user
  themself (Lab 3 has no voluntary password-change screen — specification
  §3 Excluded).
- Active page indicated the same way as Lab 2 (§10): underline/weight
  change in `--zg-secondary`, never color alone.
- Mobile (< 768px): nav collapses behind the existing menu toggle; user
  name/role and Logout remain reachable within one tap.
- Displayed on every authenticated screen; not shown on Login or Change
  Password.

## 2. Login

- Centered card, no application shell chrome above it except the
  TokTickIT wordmark — replaces Lab 2's Development Requester Selection
  screen at the same entry point.
- Fields: Email address (required), Password (required, masked with a
  show/hide toggle — matches the handout's illustrative screenshot).
- Primary action: **Sign In**. No secondary action (there is no
  self-registration to link to — specification §3 Excluded).
- **Validating**: client-side required-field checks before submit; a
  field-level error appears immediately below the field per Lab 2's §3
  Invalid state.
- **Submitting**: Sign In shows the Busy state (Lab 2 §4) — spinner + "Signing
  in…" text, disabled, preventing duplicate submissions.
- **Failure (invalid credentials)**: a single inline banner directly above
  the form — *"Invalid email or password. Please try again."* — matching
  the handout's illustrative screenshot. Never indicates which field was
  wrong (BR-06). Password field is cleared; email is preserved.
  **Failure (inactive account)**: a distinct banner — *"This account is
  inactive. Contact an Administrator."* — no other account detail is shown
  (BR-07).
- **Failure (server/network)**: a safe generic error banner, retry
  available, entered email preserved.
- On success: if `mustChangePassword` is `true`, the client routes directly
  to Change Password (§3) with no intermediate screen; otherwise it routes
  to each role's default landing screen (Requester → My Tickets, IT Staff →
  Ticket Queue, Administrator → User Management).
- No "Forgot your password?" action is wired to anything (the handout's
  illustrative screenshot shows the link; Lab 3 explicitly excludes
  password-reset email — specification §3). If shown at all, it is
  disabled/inert with a tooltip explaining resets are Administrator-only,
  rather than left silently broken.

## 3. Change Password (mandatory first-login)

- Reachable only when the authenticated user's `mustChangePassword` is
  `true`; direct navigation to any other authenticated screen while this
  is true redirects back here (FR-02, AC-02).
- Fields: Current (temporary) password, New password, Confirm new password
  — all required, masked with show/hide toggles.
- Live password-rule checklist below New Password (matches the handout's
  illustrative screenshot): at least 8 characters; upper- and lower-case
  letters; a number and a special character — each item shows a check mark
  once satisfied, evaluated live as the user types, not only on submit.
- Confirm new password shows an inline mismatch error as soon as it no
  longer matches New Password (no need to wait for blur/submit).
- Primary action: **Continue**, disabled until Current, New, and Confirm
  are all present, New satisfies every rule, and Confirm matches New.
- **Submitting**: Continue shows the Busy state.
- **Failure (wrong current password)**: field-level error under Current
  password — *"Current password is incorrect."*
- **Failure (weak password)**: field-level error under New password
  reiterating which rule(s) failed, in addition to the live checklist.
- **Success**: the application shell renders immediately at the role's
  default landing screen — no separate confirmation screen, since reaching
  the app is itself the confirmation.
- This screen has no Cancel/Back action — a user who must change their
  password cannot use the application until they do (BR-02).

## 4. Requester Ticket Detail (extended)

Everything from `docs/lab-02/ui-spec.md` §11.4 (Ticket information card,
read-only fields, Attachments section) is unchanged. This adds two things
below the Attachments section:

- **Public Comments**: a card labeled "Public Comments", visually distinct
  from Attachments (separate heading/card boundary). Below any existing
  comments (author name + role badge + timestamp + content, oldest first):
  a "Add a comment" textarea (required, 1–2000 chars, live character count
  near the limit) and a primary **Post Comment** action, disabled while
  empty/whitespace-only or in flight (Busy state while submitting). A newly
  posted comment appears at the bottom immediately on success, no page
  reload.
- **Problem Appears Resolved**: a single secondary-style action near the
  top of the Ticket information card, visible only while Current Status is
  not Closed or Cancelled. Clicking it opens a confirmation dialog ("This
  tells IT Staff your issue looks fixed — it does not close the Ticket.
  IT Staff will confirm and formally resolve it."), then shows a small
  inline success badge next to the action ("Marked resolved by you on
  <date>") replacing the button once confirmed. The action remains
  available to click again (BR-24 — idempotent), simply updating the date
  shown.
- No Internal Notes, IT Priority, Ticket Owner, or status-change controls
  are rendered anywhere on this screen, even as disabled placeholders —
  those belong exclusively to the IT Staff Ticket Detail screen (§6).

## 5. IT Staff Ticket Queue

- Page header: "Ticket Queue" title + one-line subtitle; no "Create
  Ticket" action (IT Staff don't file Tickets).
- Filter row: search input (placeholder "Search by ticket number or
  summary…"), and a **Filters** control opening Category / Requested
  Priority / IT Priority / Current Status / Owner (including an
  "Unassigned" option) — collapsed behind one control rather than five
  always-visible dropdowns, since the handout explicitly calls out
  avoiding "an unreadable mega-grid." Active filters show as removable
  chips below the search row.
- **Desktop/tablet**: sortable table — columns Ticket No. (linked to
  Ticket Detail), Created Date, Summary, Category, Req. Priority (badge),
  IT Priority (badge), Status (badge), Owner (name, or "Unassigned" in
  muted text). Sortable column headers show a direction indicator; default
  sort is Created Date ascending (oldest first — specification.md §12-8),
  shown with an "oldest first" indicator on first load so the ordering
  isn't mistaken for a bug.
- **Mobile (< 768px)**: table becomes a stacked card list, same
  transformation rule as Lab 2's My Tickets (§11.3) — Ticket No. and
  Summary prominent, badges for both priorities and Status, Owner shown
  secondary, whole card tappable to open Ticket Detail.
- Pagination: identical control to Lab 2's My Tickets §11.3 (Previous/Next,
  page numbers, "Showing X to Y of Z tickets").
- **Loading**: skeleton rows/cards, filters remain interactive.
- **Empty** (zero Tickets system-wide): illustration/icon + "No tickets
  exist yet" — no action button, since IT Staff don't create Tickets.
- **No results** (filters produce zero matches): "No tickets match your
  filters" + Clear Filters action.
- **Forbidden** (a Requester or Administrator reaches this route directly):
  a full-page forbidden state — icon + "You don't have access to this
  page." + a link back to the caller's own default landing screen. Never a
  silent redirect with no explanation (specification.md §12-14 — the API
  already returns `403`, so the client has a real reason to show).
- **Failure**: safe error banner with retry; filter/search values
  preserved.

## 6. IT Staff Ticket Detail

Extends the same Ticket information card pattern as Lab 2's Requester
Ticket Detail, but with operational fields editable and additional
sections. This screen and its route exist for IT Staff only — an
Administrator has no navigation entry point to it in Lab 3, even though
the underlying `GET` endpoint also accepts an Administrator session at the
API level so BR-04's Internal Note visibility promise is actually
reachable (specification.md BR-40). That API-only access has no UI here by
design; it's covered by direct API-level tests, not a screen.

- **Ticket information card**: Ticket No., Created Date, Category, Related
  System, Requester (name — read-only), Requested Priority (badge,
  read-only), Summary, Description — all read-only exactly as in the
  Requester view.
- **Operational row**, visually distinct from the read-only card above it
  (matches the handout's illustrative screenshot grouping): **Ticket
  Owner** (dropdown of active IT Staff, plus "Unassigned" — this is the
  Reassign control, and accepts any target with no ownership precondition
  — api-spec.md §4.4); a separate **Claim** button, shown only while the
  Ticket is unassigned or already owned by the current user, sets the
  Owner to the current user in one click (api-spec.md §4.3) and disappears
  once claimed by someone else. Taking over a Ticket someone else already
  owns is done through the Owner dropdown (Reassign), not Claim — Claim
  rejects with an error if another active IT Staff user owns the Ticket
  (BR-19), rather than silently reassigning it. **IT Priority**
  (dropdown, editable field styling per Lab 2 §3), **Current Status**
  (dropdown, editable field styling; only transitions permitted by
  specification.md §7 from the Ticket's current status are enabled/listed
  — a disallowed transition simply isn't offered as an option, though the
  server remains the actual enforcement per FR-06).
- If the Requester has marked "Problem Appears Resolved," a small badge
  next to Current Status reads "Requester confirms resolved · <date>" —
  informational only, not a control.
- **Tabbed or sectioned communication area**, below the operational row:
  - **Public Comments**: identical presentation and posting behavior to
    §4's Requester view, plus the author's role badge on every entry so
    "who said what" is unambiguous in a shared queue.
  - **Internal Notes**: visually distinct from Public Comments — a
    different background tint (`--zg-warning-bg`-family tint, reserved for
    this contrast, not reused as a generic warning elsewhere on this
    screen) and a persistent "Internal only — not visible to the
    Requester" label above the composer, so private text can't be typed by
    mistake into the public one. Same posting mechanics (required,
    1–2000 chars, author + timestamp shown, append-only).
  - **Attachments**: same list/download presentation as Lab 2's Requester
    view; IT Staff can view and download but Lab 3 does not grant IT Staff
    an upload/remove control here (attachment management stays a Requester
    action — not in the handout's IT Staff bullet list).
- **Forbidden** (non-IT-Staff direct access): same full-page forbidden
  state as §5.
- **Failure**: safe error banner with retry on any operational action
  (owner/priority/status/comment/note), each field reverting to its
  last-known-saved value rather than showing a stuck optimistic update.

## 7. Administrator User Management

One screen, two panels on desktop/tablet (list + create/edit side panel,
matching the handout's illustrative screenshot), stacked on mobile.

- **Users list** (left/primary panel): search input (placeholder "Search
  users…"), a **Filters** control for Role, a **+ Create User** primary
  action top-right. Table columns: Name, Email, Role (badge — reuse the
  same badge component family as Ticket Status/Priority, distinct colors
  per role), Status ("Active"/"Inactive" badge), and an Edit action per
  row. No pagination controls (BR-39 — the full matching list renders at
  once). Ordered by name ascending.
- **Create User** (side panel, opened by + Create User): Full Name
  (required), Email Address (required), Role (required, single-select:
  Requester / IT Staff / Administrator — no multi-select control exists,
  since the model has no concept of more than one role), Active toggle
  (defaults on), Initial Password (required, with the same live
  password-rule checklist as Change Password §3). Primary action **Save
  User**; secondary **Cancel** closes the panel and discards input.
  Successful creation closes the panel and the new user appears in the
  list immediately, with a success toast.
- **Edit User** (same side panel, opened from a row's Edit action):
  Full Name, Email Address, Role, Active toggle — all editable, pre-filled
  with current values. A separate **Set New Password** control (collapsed
  by default, expands to one password field + the same rule checklist)
  handles BR-37 without cluttering the main edit form. Primary action
  **Save Changes**.
- **Self-row behavior**: when the row being edited is the acting
  Administrator's own account, the Active toggle is disabled with adjacent
  copy — *"You can't deactivate your own account."* — not just silently
  rejected on save (BR-35, matches Lab 2 §3's rule that a disabled control
  always carries explanatory copy).
- **Last-Administrator behavior**: if this is the only active
  Administrator, both the Active toggle and the Role select show the same
  kind of disabled-with-explanation treatment — *"At least one active
  Administrator is required."* — when the change being attempted would
  violate it. This is a client-side convenience; the server enforces it
  regardless (FR-06, FR-26).
- **Validation**: field-level errors per Lab 2 §3 for every field; a
  duplicate-email submission shows its error under Email Address
  specifically, not as a page-level banner.
- **Empty** (search/filter matches nothing): "No users match your search."
  + a Clear Filters action. There is no true system-wide empty state for
  this screen (an Administrator viewing it always has at least their own
  account to see).
- **Forbidden** (non-Administrator direct access): same full-page forbidden
  state as §5/§6.
- **Failure**: safe error banner with retry; entered form values in the
  open panel (if any) are preserved.

## 8. Badges (additions)

Extends Lab 2 `ui-spec.md` §9. IT Priority reuses the exact same
Low/Medium/High colors as Requested Priority (same enum, same meaning
scale — no reason to invent a second color mapping for the same three
values). New badges:

| Current Status (new values) | Color |
| --- | --- |
| Waiting for Requester | `--zg-warning-bg` background, `--zg-warning-text` text, with a distinct icon from In Progress (replaces Lab 2's "Pending" badge one-for-one) |
| Reopened | Light purple background (`#EFE7FB`), purple text (`#5B3FA8`) — deliberately distinct from every other status color, since it signals "needs re-triage," not routine progress |

| Role | Color |
| --- | --- |
| Requester | Light blue-gray background (`#E7EEF5`), dark blue-gray text (`#33475B`) |
| IT Staff | `--zg-pale` background, `--zg-secondary` text |
| Administrator | Light amber background (`#FCEED1`), dark amber text (`#8A5A00`) — reserved for the role badge only, distinct usage from the Medium-priority badge's identical color pair since they never appear in the same context |

## 9. Responsive Rules

No new breakpoints — Lab 2 `ui-spec.md` §8 applies unchanged: desktop ≥
992px, tablet 768–991px, mobile < 768px, no horizontal scrolling at any
size. Specifically extended to:

- The Ticket Queue table ↔ mobile card transformation (§5), same rule as
  My Tickets.
- The User Management two-panel layout collapses to a single column on
  mobile: the side panel becomes a full-screen sheet over the list rather
  than a side-by-side column, dismissible via its own Cancel/back action.
- The IT Staff Ticket Detail operational row (Owner/Priority/Status)
  stacks vertically on mobile, same as the Requester Ticket Detail
  information grid already does.

## 10. Visual Inspection Checklist

To be completed with dated screenshot evidence during implementation:

- [ ] No clipped labels at any viewport, on any new screen
- [ ] No overlapping messages (validation, badges, toasts) on Login, Change
      Password, Ticket Queue, Ticket Detail (IT Staff), User Management
- [ ] No unintended horizontal scrolling at any viewport
- [ ] Consistent field styling (editable vs. read-only vs. invalid vs.
      disabled) between the Requester and IT Staff Ticket Detail screens
- [ ] Badge colors/labels consistent between the Ticket Queue and both
      Ticket Detail screens for the same Priority/Status/Role values
- [ ] Public Comments and Internal Notes are visually unmistakable from
      each other at every viewport — a screenshot review must confirm no
      color-only distinction
- [ ] Role-based navigation shows only permitted destinations for each of
      the three roles, verified by screenshot per role
- [ ] Filters, pagination, and Queue/User Management controls remain
      usable at all three viewports

## 11. Screenshot Paths

Per the required repository structure, implementation-phase Playwright
screenshots are saved to:

- `artifacts/lab-03/screenshots/authentication/{desktop,tablet,mobile}.png`
- `artifacts/lab-03/screenshots/staff-queue/{desktop,tablet,mobile}.png`
- `artifacts/lab-03/screenshots/staff-ticket-detail/{desktop,tablet,mobile}.png`
- `artifacts/lab-03/screenshots/user-management/{desktop,tablet,mobile}.png`
