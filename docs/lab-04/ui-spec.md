# Lab 4 UI Specification — Zen Green Theme

This document is the visual and behavioral contract for every new or
changed Lab 4 screen. It extends `docs/lab-03/ui-spec.md` and
`docs/lab-02/ui-spec.md`, which stay normative for every token, component,
and screen they already cover. Lab 4 adds no new visual language. Every new
element reuses the existing `--zg-*` tokens and `.zg-*` classes in
`client/src/zen-green.css` (`.zg-card`, `.zg-table`, `.zg-ticket-cards`,
`.zg-badge-*`, `.zg-btn-*`, `.zg-field*`, `.zg-chip`, `.zg-skeleton`,
`.zg-callout`, `.zg-banner-warning`, `.zg-success-banner`, `.zg-forbidden`,
`.zg-section-heading`). New rules are added to that file, with no inline
colors.

## 1. Application Shell and Navigation (updated)

- Role-scoped navigation, left to right:
  - **Requester**: Dashboard, My Tickets, Create Ticket.
  - **IT Staff**: Dashboard, Ticket Queue.
  - **Administrator**: Dashboard, Ticket Queue, User Management
    (specification.md BR-29).
- The wordmark links to `/dashboard` for every role.
- **Landing**: after login or a completed password change, every role
  lands on `/dashboard` (specification.md §11-8). `/dashboard` renders the
  Requester Dashboard for a Requester and the IT Staff Dashboard for IT
  Staff and Administrators.
- The active page is indicated as in Lab 2 §10: weight change plus an
  underline in `--zg-secondary`, and `aria-current="page"` on the active
  link. Never by color alone. Dashboard is active only on `/dashboard`.
  Ticket Queue stays active on `/staff/tickets/:id`, and My Tickets on
  `/tickets/:id`.
- Mobile (< 768px): unchanged collapse behind the menu toggle; every item
  reachable within one tap.

## 2. Shared Conventions (new)

### 2.1 Date/time display

Every date/time goes through one formatter module,
`client/src/lib/datetime.ts`, which uses `Intl.DateTimeFormat` with
`timeZone: 'Asia/Bangkok'` (specification.md BR-33). `toLocaleString()` and
`toLocaleDateString()` without a time zone are removed everywhere
(`MyTickets.tsx`, `RequesterTicketDetail.tsx`, `AttachmentSection.tsx`,
`CreateTicket.tsx`, and the rest).

- Date and time: `6 Oct 2026, 14:05`
- Date only: `6 Oct 2026`
- Each rendered timestamp is wrapped in
  `<time dateTime="<ISO UTC>">` so assistive tech and tests can read the
  exact instant.
- A single footnote-style hint, "Times shown in Bangkok time (UTC+7)", sits
  under the page title of both dashboards and both Ticket Detail screens.

### 2.2 Conflict state (`409 STALE_UPDATE`)

Used by every Ticket workflow control and the Actions Taken form:

- An inline `.zg-banner-warning` directly above the affected control or
  form: **"Someone else changed this ticket while you were editing."** For
  an Action the wording is "this action".
- Below the message, a short "Latest values" summary built from
  `error.details.current`. For a Ticket: status, owner, IT Priority. For an
  Action: status, assignee, updated time.
- Actions: **Reload latest** (secondary) refetches the record and resets
  the control or form to the fresh values. The user's unsaved input stays
  visible until they choose it, so nothing they typed is lost silently
  (specification.md BR-26, FR-20).
- The failed control does not show a stuck optimistic value. A select
  reverts to the last saved value, and a form keeps the user's input
  marked as not saved.

### 2.3 Busy and duplicate protection

Every submit button uses the Lab 2 §4 Busy state (spinner, verb-ing label,
`disabled`, `aria-busy="true"`) from click until the response settles
(specification.md BR-28). Selects that save on change (Owner, IT Priority,
Status) are disabled while their request is in flight.

### 2.4 Metric card component

A reusable `MetricCard` in `client/src/MetricCard.tsx`:

- `.zg-card` with a label (`.zg-label`, the exact metric name from
  specification.md §5.6), a large value (font-size 2rem, weight 600,
  `--zg-text`), an optional secondary line (`.zg-helper`), and a
  drill-down link.
- The **whole card is one link** (`<a>` wrapping the content). Its
  accessible name is "<Label>: <value>. View tickets", for example
  "Unassigned: 5. View tickets". There are no nested interactive
  elements.
- Zero value: shows `0` and the metric's empty helper text from
  specification.md §5.6. The link stays active (specification.md BR-37).
- Hover/focus: `--zg-pale` background and the Lab 2 focus ring. No color-only
  meaning; the value is always text.
- Breakdown rows (By Status, By IT Priority) are a `<ul>` of links, each
  "<badge> <label> <value>", reusing `StatusBadge` and `PriorityBadge` from
  `client/src/badges.tsx`.

### 2.5 URL-driven filters (drill-down destinations)

My Tickets, Ticket Queue, and User Management read their filter, sort, and
page state from the URL query string on load and write every change back
with `replace` navigation (specification.md FR-16):

- Opening a drill-down link applies its filters and shows each one as a
  removable chip, using the existing `.zg-chip` row.
- New chip labels: `statusGroup=active` → "Active only";
  `resolvedFrom`/`resolvedTo` → "Resolved 6 Oct 2026" when both are equal,
  "Resolved since 7 Sep 2026" when only `resolvedFrom` is set;
  `followUp=pending` → "Follow-up pending";
  `openActionAssigneeId=<id>` → "Open actions: <name>" ("Open actions:
  me" when it is the caller); `ownerId=<id>` → "Owner: <name>".
- These new filters appear only as chips that came from a link. They are
  not added to the Filters panel, which keeps the Lab 3 controls.
  Clearing a chip removes the param.
- An invalid param (`400 INVALID_FILTER`) shows the existing safe error
  banner with a **Clear filters** action, not a blank screen.

## 3. Requester Dashboard (`/dashboard`, Requester)

- Page header: title "Dashboard", subtitle "Your tickets at a glance",
  the Bangkok-time hint (§2.1), "Updated 14:05" from `generatedAt`, and a
  tertiary **Refresh** button.
- **Cards row**: Open Tickets, Waiting for You, Resolved (Last 30 Days),
  in that order. Labels, calculations, helpers, and links come from
  specification.md BR-39, BR-41, and BR-42. "Waiting for You" gets a
  `--zg-warning-bg` left border and an icon (non-color cue) when its value
  is above 0, because it is the one card asking the Requester to act.
- **Lists** (two `.zg-card` columns below the cards):
  - **Recently Updated** (BR-43): up to 5 rows, each Ticket Number
    (link to `/tickets/:id`), Summary (single line, ellipsis), Status
    badge, updated time. Footer link "View all my tickets" →
    `/tickets?sortBy=updatedAt&sortDir=desc`.
  - **Recently Resolved** (BR-44): same row layout with the resolved time.
- **Primary action**: **Create Ticket** button top-right, same as My
  Tickets.
- **Empty (no Tickets at all, BR-40)**: cards and lists are replaced by
  one centered `.zg-card`: icon, "You haven't submitted any tickets yet.",
  and a primary **Create Ticket** button.
- **Empty list**: the list card shows its one-line message from
  specification.md BR-43/BR-44.
- **Loading**: skeleton cards (`.zg-skeleton`) at final size, so the
  layout doesn't shift when data arrives.
- **Failure**: safe error banner "We couldn't load your dashboard." with
  **Retry**. No partial numbers are shown.
- **Forbidden**: not reachable for other roles, since `/dashboard`
  renders by role. A direct API call by a non-Requester is covered by API
  tests.
- This screen duplicates no My Tickets features: no search, filters, or
  pagination.

## 4. IT Staff Dashboard (`/dashboard`, IT Staff and Administrator)

- Page header: title "Dashboard", subtitle "Operational overview", the
  Bangkok-time hint, "Updated" time, and **Refresh**.
- **Cards** (specification.md BR-45–BR-50), in this order, because the
  first row is "my work" and the second is "team attention":
  1. My Open Actions (secondary line "across N tickets")
  2. My Active Tickets
  3. Follow-Ups Pending
  4. Unassigned
  5. High Priority (High priority badge icon as a non-color cue)
  6. Resolved Today
- **Breakdowns** (one `.zg-card` each, side by side on desktop):
  **Tickets by Status** (all eight, BR-51) and **Active Tickets by IT
  Priority** (BR-52). Each row is a link (§2.4).
- **Lists**:
  - **My Open Actions** (BR-53): up to 5 rows, each Ticket Number, Action
    Description (80 characters), Action Status badge, Action Date/Time.
    Each row links to `/staff/tickets/:ticketId#actions-taken`, and Ticket
    Detail scrolls to and focuses the Actions Taken heading. Footer link
    "View all" uses the BR-45 drill-down.
  - **Recently Updated** (BR-54): up to 5 rows, each Ticket Number, Summary,
    Status badge, Owner ("Unassigned" in muted text), updated time. Footer
    "View all in Ticket Queue".
- **Administrator only**: a **User Accounts** card (BR-55), a three-row
  table (Requester, IT Staff, Administrator) × (Active, Inactive) using the
  Role badges, each row linking to `/admin/users?role=<ROLE>`. Shown after
  the lists. Absent for IT Staff, with no empty placeholder.
- **Loading / Failure**: as §3.
- **Forbidden**: a Requester never reaches this view (§1). The API `403`
  is covered by API tests, and if one is ever received the Lab 3
  full-page forbidden state is shown.
- **Empty**: no whole-dashboard empty state. Zero cards and empty lists
  follow §2.4 and specification.md BR-37.

## 5. IT Staff Ticket Detail (extended)

Reachable by IT Staff and Administrators (BR-29). Everything in Lab 3
ui-spec §6 stays, and the Administrator now sees the same screen with the
same controls. Section order: Ticket information card → Ownership,
Priority & Status → **Actions Taken** (new) → Public Comments → Internal
Notes → Attachments → **Status History** (new).

### 5.1 Ownership, Priority & Status (changed)

- Every control sends the Ticket `version` from the last load
  (specification.md BR-24). On success the response's
  `TicketWorkflowState` updates the version, the page header's Status
  badge, the info card, and the Status History list in place, with no full
  reload (handout §8.4).
- **Owner dropdown** lists active IT Staff and Administrators from
  `/api/staff/it-staff-users`, each with a role suffix ("Alex Morgan ·
  Administrator").
- **Status select**: shows the current status as the selected option, plus
  only the permitted transitions from `permittedTransitions()`
  (`client/src/lib/ticket-status.ts`), as in Lab 3.
  - When Resolved is a permitted transition but `resolutionGate.canResolve`
    is false, the Resolved option is present but `disabled`, labelled
    "Resolved (blocked)". A `.zg-callout` directly under the select,
    linked by `aria-describedby`, lists the failed conditions in plain
    words:
    - `NO_DONE_ACTION` → "Record at least one action as Done."
    - `OPEN_ACTIONS` → "Finish or cancel every Planned or In Progress action."
    - `PENDING_FOLLOW_UPS` → "Clear every pending follow-up."
    Each line links to `#actions-taken`.
  - If the server still returns `409 RESOLUTION_BLOCKED`, because an
    Action changed in another tab, the select reverts and the same
    callout appears from `details.reasons`.
  - `409 STALE_UPDATE` → conflict state (§2.2).
- Requester "Problem Appears Resolved" badge (Lab 3 §6) is unchanged and
  stays informational. It sits next to the status and never enables
  Resolved (specification.md BR-20).

### 5.2 Actions Taken section (new)

`<section id="actions-taken" aria-labelledby="actions-taken-heading">`
inside a `.zg-card`, heading "Actions Taken" with a count ("Actions Taken
(4)").

**Toolbar**: primary **+ Add Action** (top-right of the section). Hidden
when the Ticket is not active (BR-10) and replaced by the helper "This
ticket is <status>. Reopen it to record more actions."

**List mode**:

- **Desktop/tablet**: `.zg-table` with columns Date/Time, Description,
  Result, Performed By, Assigned To, Status, Follow-Up, and an **Edit**
  action per row. Rows are ordered as returned (BR-13, oldest first), not
  re-sorted in the client.
  - Description and Result wrap (no truncation in the table) to a 3-line
    clamp with a "Show more" toggle button.
  - Performed By: name + role badge.
  - Assigned To: name + role badge. An inactive assignee shows the name
    followed by an "Inactive" `.zg-badge` (text, not just gray).
  - Status: Action Status badge (§8).
  - Follow-Up: "Required" badge with an icon plus the Follow-Up Note
    under it, or "—" when not required.
  - Attachment Notes: shown on its own line under Description, prefixed
    by a paperclip icon and "Files:".
  - Cancelled rows: whole row text in muted color **and** the Cancelled
    badge, with the Description struck through. Strikethrough plus badge
    gives two non-color cues.
  - Edit action: hidden for Cancelled rows. For Done rows it is labelled
    "Edit follow-up" because only those fields are editable (BR-09).
- **Mobile (< 768px)**: stacked `.zg-ticket-cards`-style cards, each
  showing Date/Time and Status badge on top, Description, Result, Performed
  By → Assigned To, Follow-Up block, Attachment Notes, Edit button.
- **Empty**: "No actions recorded yet." For a legacy Ticket the same text
  applies (specification.md §7.4).
- **Loading**: three skeleton rows. **Failure**: inline safe error with
  **Retry**, scoped to this section only.

**Create mode** (**+ Add Action**):

- An inline form panel opens **above** the table, inside the section.
  It is not a modal, so no focus trap is needed (handout §7: no
  inaccessible modals). Focus moves to the panel heading "New Action".
- Fields, top to bottom:
  1. **Action Date/Time**: required, `<input type="datetime-local">`,
     default "now" in Bangkok time, helper "Bangkok time (UTC+7)". The
     input holds minutes only, and the server compares it with the
     Ticket's creation time to the minute (specification.md BR-05), so the
     default is always accepted.
  2. **Action Description**: required textarea, 1–2000, live count near
     the limit.
  3. **Status**: select of Planned (default), In Progress, Done.
  4. **Result**: textarea, 0–2000. The label gains the required marker
     when Status is Done (BR-08).
  5. **Assigned To**: select of active IT Staff and Administrators, default
     the current user, labelled "<name> (me)".
  6. **Follow-Up Required?**: checkbox.
  7. **Follow-Up Note**: textarea, revealed and required only while the
     checkbox is checked (BR-06). The checkbox carries `aria-controls`
     pointing at the note field.
  8. **Attachment Notes**: single-line input, 0–500, placeholder "e.g.
     battery-diagnostic.pdf in Ticket attachments".
  - A static helper under the form heading: "Requesters can see every
    field of an action. Use Internal Notes for staff-only details."
    (specification.md §11-6).
- Read-only line "Performed by: <current user>" (BR-03); there is no
  input for it.
- Actions: primary **Save Action** (Busy: "Saving…"), secondary **Cancel**
  (discards input, closes, returns focus to **+ Add Action**).
- A `clientRequestId` is generated when the form opens and reused for
  every retry of that form (BR-14, BR-28).
- **Validation**: client-side checks mirror BR-05/BR-06/BR-08, with
  field-level errors under each field (Lab 2 §3). Server field errors map
  to the field named by `error.field`.
- **Success**: panel closes, the new row appears in its sorted position,
  and is briefly highlighted with `--zg-pale` and announced through an
  `aria-live="polite"` region ("Action added."). Focus returns to
  **+ Add Action**. The Ticket's `resolutionGate` and status options are
  refetched.
- **Failure**: `409 TICKET_NOT_ACTIONABLE` → banner "This ticket is no
  longer open for actions." with **Reload ticket**. `400 INVALID_ASSIGNEE`
  → error under Assigned To. Network or server error → safe banner inside
  the panel. In every case the entered values stay (FR-20).

**Edit mode** (row **Edit**):

- The same panel opens in place of the row (desktop) or card (mobile),
  heading "Edit Action", pre-filled with current values. Focus moves to
  the heading.
- Fields locked by BR-09 are shown with read-only styling
  (`.zg-field-readonly`) and a one-line reason, for example "Done actions
  keep their description and result." They are not shown as disabled
  inputs without explanation (Lab 2 §3 rule).
- Status select offers only the BR-07 transitions from the current status,
  plus "Cancelled", which asks for confirmation inline ("Cancel this
  action? It will stay visible but can't be edited.") before saving.
- Performed By is shown read-only.
- **Save Changes** sends `version` and only the changed fields. On success
  the row updates in place, the live region announces "Action updated.",
  and focus returns to the row's Edit button (or its replacement text when
  the row became Cancelled).
- `409 STALE_UPDATE` → conflict state (§2.2) inside the panel.
  `409 ACTION_LOCKED` / `INVALID_ACTION_TRANSITION` → banner with the
  server message, and the panel reloads that Action's current values on
  **Reload latest**.

### 5.3 Status History section (new)

`<section aria-labelledby="status-history-heading">`, heading "Status
History".

- An ordered list (`<ol>`), oldest first (BR-22), each entry:
  "<from badge> → <to badge> · <name> (<role>) · <date/time>". The creation
  entry reads "Created as <New badge> · <name> · <date/time>".
- No edit or delete control exists.
- Empty (legacy Ticket): "No status changes recorded yet." No date is
  shown, because the migration date differs per database.
- Long histories: show the latest 10 by default with a **Show all
  (n)** toggle that expands the list in place, keeping order.

## 6. Requester Ticket Detail (extended)

Lab 3 ui-spec §4 is unchanged. Added below Attachments and above Public
Comments, so the work log is close to the conversation:

- **Actions Taken** (read-only): the same table/card layout as §5.2 list
  mode with no **+ Add Action**, no **Edit**, and no form. Every field is
  shown (specification.md §11-6). Heading helper: "Work recorded by IT
  Staff on your ticket."
- **Status History** (read-only): the same as §5.3.
- The "Problem Appears Resolved" control and its confirmation copy are
  unchanged (Lab 3 §4). The confirmation text keeps "it does not close the
  Ticket" (BR-20).
- Empty, loading, and failure states as §5.2, scoped per section.

## 7. List Screens as Drill-Down Destinations

- **My Tickets** (`/tickets`): URL filters per §2.5. New chips "Active
  only" and "Resolved since …". The Lab 2 empty state (no Tickets at all)
  and no-results state (filters match nothing) are unchanged.
- **Ticket Queue** (`/staff/tickets`): URL filters per §2.5. Now reachable
  by Administrators. New chips per §2.5. A drill-down that matches nothing
  shows the Lab 3 no-results state with **Clear Filters**.
- **User Management** (`/admin/users`): reads `role` (and `search`) from
  the URL, and the existing role chip appears when arriving from the
  dashboard User Accounts card.

## 8. Badges (additions)

Action Status, extending Lab 3 §8. Each badge has a text label and an
icon, never color alone:

| Action Status | Colors | Icon |
| --- | --- | --- |
| Planned | `--zg-field-readonly-bg` background, `--zg-text` text | outline circle |
| In Progress | Reuses the Ticket "In Progress" badge colors | half-filled circle |
| Done | `--zg-success-bg` background, `--zg-success-text` text | check |
| Cancelled | Reuses the Ticket "Cancelled" badge colors | slash |

Other additions:

- **Follow-Up Required**: `--zg-warning-bg` / `--zg-warning-text`, flag icon,
  label "Follow-up".
- **Inactive** (assignee): Lab 3 "Inactive" user status badge reused as-is.
- **Resolved (blocked)** option: no badge, only text.

## 9. Accessibility (Lab 4 additions)

Lab 2 §7 and Lab 3 rules stay. In addition:

- Every metric card link and breakdown link has a descriptive accessible
  name including its value (§2.4).
- Both dashboards use one `<h1>`, `<h2>` per card group and list, and
  `<section aria-labelledby>` per region.
- The Actions Taken form moves focus to its heading on open and back to
  the trigger on close. `Esc` is equivalent to **Cancel** when focus is
  inside the form.
- The Follow-Up Note field is announced as required when it appears.
  Validation errors are linked with `aria-describedby` and announced via
  the existing error pattern.
- The disabled "Resolved (blocked)" option has its reason in the
  `aria-describedby` callout, so screen-reader users hear why.
- Success and failure of Action saves and status changes are announced
  through one `aria-live="polite"` region per Ticket Detail screen.
- Focus is visible on every new control (Lab 2 focus ring), including
  whole-card links.
- Table headers use `<th scope="col">`. Mobile cards keep label/value
  pairs as `<dl>`.

## 10. Responsive Rules

Breakpoints unchanged (desktop ≥ 992px, tablet 768–991px, mobile < 768px),
and no horizontal page scrolling at any width.

| Element | Desktop | Tablet | Mobile |
| --- | --- | --- | --- |
| Dashboard metric cards | 3 per row | 2 per row | 1 per row |
| Breakdown cards | side by side | side by side | stacked |
| Dashboard lists | side by side (2 columns) | stacked | stacked |
| User Accounts table | 3 × 2 table | 3 × 2 table | 3 rows, each "Active n · Inactive n" |
| Actions Taken | table | table, Result and Follow-Up wrap | stacked cards |
| Actions Taken form | two-column grid (Date/Time + Status, Assigned To + Follow-Up) | two-column | single column |
| Status History | single list | single list | single list, badges wrap |

Long Ticket Numbers, names, and unbroken strings in Description, Result, or
Attachment Notes use `overflow-wrap: anywhere` so they can't force
horizontal scroll.

## 11. Final Hardening (applies to every screen)

- Every screen that calls the API shows the full set of states: loading,
  validation, success, empty or no-results, forbidden, conflict, not
  found, and safe failure. The not-found state for a Ticket (`404`) is the
  Lab 2 "Ticket not found" card with a link back to the role's list,
  never a blank page.
- No raw server error text, stack trace, or `undefined`/`null` is ever
  rendered. Unknown errors fall back to "Something went wrong. Please try
  again."
- Forms keep entered data after any recoverable failure (FR-20). This
  covers Create Ticket, comments and notes, the Actions Taken form, User
  Management, and Change Password.
- Remove temporary, duplicate, or obsolete UI: rename
  `.zg-badge-status-pending` to `.zg-badge-status-waiting` (it still styles
  Waiting for Requester under Lab 2's old "Pending" name), and remove any
  placeholder text or unwired button found during the Issue #69 audit. `/system-check` and `CategoryList` stay as Lab 1
  requires (specification.md §11-14) and stay off the navigation.
- No console errors or React warnings during the E2E suite.
- Every internal link resolves (dashboard drill-downs, "View all", Ticket
  links, `#actions-taken` anchors).

## 12. Visual and Accessibility Inspection Checklist

To be completed with dated screenshot evidence during Issues #65, #67, #68,
and #69:

- [ ] Both dashboards and both Ticket Detail screens use the same Zen Green
      tokens, card style, and badge components as the Lab 2/3 screens
- [ ] Metric cards: label, value, and drill-down are readable and not
      clipped at all three viewports, and the value is never color-only
- [ ] Zero-value cards and empty lists show their helper text, not a blank
      card
- [ ] Actions Taken: editable vs. read-only (locked) vs. invalid vs.
      disabled fields are visually distinct and consistent with Lab 2 §3
- [ ] Validation messages appear directly under their field, with no
      overlap with the next field at any viewport
- [ ] Cancelled Actions and inactive assignees are distinguishable without
      color
- [ ] Shared (Actions Taken, Public Comments) vs. private (Internal Notes)
      content is visually distinct, and the Actions Taken helper text about
      Requester visibility is present
- [ ] Status, IT Priority, Action Status, and Follow-Up badges carry text
      and an icon
- [ ] Keyboard: every dashboard link and Actions Taken control reachable
      in a logical order with visible focus; the form returns focus on close
- [ ] No clipping, overlap, or horizontal page scroll at desktop, tablet,
      and mobile on any Lab 4 screen
- [ ] Navigation shows exactly the permitted items per role, with the
      active page indicated without color alone
- [ ] Every date/time shows Bangkok time, checked with the browser set to
      a different time zone

## 13. Screenshot Paths

Captured by Playwright (`e2e/lab-04/screenshots.spec.ts`) at desktop
(1280 × 800), tablet (820 × 1180), and mobile (390 × 844), each with a
`document.body.scrollWidth` ≤ viewport assertion:

- `artifacts/lab-04/screenshots/staff-dashboard/{desktop,tablet,mobile}.png`
  plus `admin-{desktop,tablet,mobile}.png` (with User Accounts) and
  `empty-list.png`
- `artifacts/lab-04/screenshots/requester-dashboard/{desktop,tablet,mobile}.png`
  plus `empty-state.png`
- `artifacts/lab-04/screenshots/actions-taken/{desktop,tablet,mobile}.png`
  (IT Staff Ticket Detail with several Actions), plus `create-form.png`,
  `edit-done-locked.png`, `validation.png`, `conflict.png`,
  `resolution-blocked.png`, and `requester-readonly-{desktop,mobile}.png`
