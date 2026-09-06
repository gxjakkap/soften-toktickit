# Lab 2 UI Specification — Zen Green Theme

This document is the visual and behavioral contract for every Lab 2 screen.
Later labs reuse these tokens and component rules rather than inventing a
new visual system — only the four required screens change per sprint.

## 1. Color Tokens

Reproduced from the handout (§7), plus the concrete hex values this
specification commits to where the handout only gave a description
(flagged with a note — these are cheap to swap, they're just consistent
choices so every screen agrees).

| Token | Hex | Required use |
| --- | --- | --- |
| `--zg-primary` | `#006B3C` | App header, primary actions, strong emphasis |
| `--zg-secondary` | `#0B7A46` | Active tabs, focus accents, links, hover states |
| `--zg-pale` | `#EAF6EF` | Selected state, success surfaces, subtle section emphasis |
| `--zg-bg` | `#F5F7F6` | Page background |
| `--zg-surface` | `#FFFFFF` | Cards/panels, with a subtle 1px border and restrained shadow |
| `--zg-text` | `#1C2B24` *(chosen: dark charcoal-green, not pure black)* | Body text |
| `--zg-field-editable-bg` | `#FFFFFF` | Editable field background |
| `--zg-field-editable-border` | `#C9D6D0` *(chosen)* | Editable field border |
| `--zg-field-readonly-bg` | `#EDF3EF` *(chosen: soft gray-green)* | Read-only / system-generated field background |
| `--zg-field-readonly-border` | `#D7E3DD` *(chosen)* | Read-only field border |
| `--zg-error-text` / `--zg-error-border` | `#B3261E` | Error text/border; message directly below the field |
| `--zg-warning-bg` / `--zg-warning-text` | `#FCEED1` / `#8A5A00` *(chosen)* | Amber callout/badge only — never decorative |
| `--zg-success-bg` / `--zg-success-text` | `--zg-pale` (`#EAF6EF`) / `--zg-secondary` (`#0B7A46`) | Success confirmation, always paired with an icon/text, never color alone |

## 2. Typography and Spacing

- Base font: system UI stack (matches the existing Bootstrap baseline
  already in `client/package.json`; Zen Green layers tokens on top of it,
  it does not replace it).
- Screen title: 24px / semi-bold / `--zg-text`.
- Section heading (e.g. "Attachments", "Description"): 16px / semi-bold /
  `--zg-text`.
- Field label: 14px / medium weight / `--zg-text`, positioned directly
  above its control with 4px gap.
- Body / table text: 14px / regular / `--zg-text`.
- Helper / validation text: 13px.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32px. Cards use 16–24px internal
  padding; sections within a card are separated by 24px.

## 3. Field States

| State | Appearance |
| --- | --- |
| Editable | `--zg-field-editable-bg` fill, `--zg-field-editable-border` 1px border, `--zg-text` value color. |
| Read-only / system-generated | `--zg-field-readonly-bg` fill, `--zg-field-readonly-border` border, same text color but not focusable/typeable (e.g. Ticket Number, Ticket Date, Requester). A small label or icon may reinforce "read-only" but the background contrast is the primary signal. |
| Focused | 2px outline in `--zg-secondary`, always visible — never suppressed, including for keyboard-only navigation. |
| Invalid | `--zg-error-border` border, `--zg-error-text` message rendered immediately below the field (never only in a page-level summary — AC-26). The red asterisk on required fields is a separate, permanent marker and does not replace this message. |
| Disabled | Reduced-opacity fill and text, border in a muted neutral tone, `cursor: not-allowed`, and `aria-disabled="true"` — visually distinct enough that it does not read as an active editable field. |

**Required-field marker**: a red asterisk (`*`) directly after the label
text, on every required field, at all times — not only after a failed
validation attempt.

## 4. Button Hierarchy

| Role | Style | Example |
| --- | --- | --- |
| Primary | Solid `--zg-primary` fill, white text | Submit, Continue, Create Ticket |
| Secondary | White fill, `--zg-primary` border and text | Cancel, Back to My Tickets |
| Tertiary / link-style | No fill/border, `--zg-secondary` text, underline on hover | Clear Filters, Change Requester |
| Destructive | White fill, `--zg-error-text` border and text (confirmed via a dialog before the action fires) | Remove Attachment |
| Disabled | Reduced opacity, `cursor: not-allowed`, no hover/focus change until re-enabled | Submit while invalid, Upload at the 5-attachment cap |
| Busy | Primary style + inline spinner + "Submitting…" text, `disabled` attribute set so repeat clicks are impossible (BR-22/AC-07) | Submit while the create request is in flight |

Every button shows visible text. Icons may accompany text but never replace
it; any icon-only control (e.g. a table-row overflow menu) has an
accessible label and a tooltip.

## 5. Validation, Loading, and Result States

Applies to every screen that talks to the API:

| State | Behavior |
| --- | --- |
| Initial | Form/list rendered with no messages; read-only fields pre-filled where applicable (e.g. Requester on Create Ticket). |
| Loading | Skeleton or centered spinner with descriptive text (e.g. "Loading your tickets…"); interactive controls that depend on the data are disabled, not hidden (avoids layout shift). |
| Validating | Client-side checks run on blur and on submit attempt; failing fields get the Invalid state from §3 immediately, without waiting for a server round-trip. |
| Submitting | Primary action shows the Busy state (§4); the rest of the form remains visible but is not editable. |
| Success | A visible confirmation (icon + text, never color alone) — for Create Ticket, the generated Ticket Number and a clear next action ("View Ticket" / "Create Another"). |
| Failure (server/network) | A page-level error banner (not a silent console failure) using `--zg-error-text`, plus the form's entered values preserved exactly as typed (BR-23/AC-08). No dead-end: the Requester can retry without re-entering data. |
| Empty | Distinct copy + a primary action pointing at what to do next (e.g. Create Ticket). Used only when the Requester truly has zero of the resource, ignoring filters (BR-30). |
| No results | Distinct from Empty — used when filters/search produced zero matches despite the Requester owning data; always paired with a Clear Filters action. |

## 6. Attachment Presentation

| State | Appearance |
| --- | --- |
| Active | File name, size, uploaded date, a Download action, and a Remove action (destructive style, §4). |
| Uploading | Row shown immediately with the file name, a progress/busy indicator, no Download/Remove actions until it resolves. |
| Invalid (rejected client- or server-side) | Row shown with `--zg-error-text` message explaining why (type/size/limit), a Retry or Dismiss action, never silently dropped. |
| Removed | File name and size still shown (muted/secondary text), a "Removed" badge, removal date, no Download action present at all (not just disabled — BR-28/AC-15). |
| Upload control disabled | Once 5 active Attachments exist, the upload control shows a disabled state with adjacent copy explaining the 5-attachment limit, not just a silently-inert button. |

## 7. Accessibility

- Every form control has a programmatically associated `<label>` (not
  placeholder-only labeling).
- Icon-only controls carry `aria-label` and a visible tooltip on hover/focus.
- Focus indicators (§3) are never removed via CSS.
- Status/priority meaning is never conveyed by color alone — badges (§9)
  always pair color with text.
- All interactive controls (dropdowns, buttons, pagination, filters,
  attachment actions) are reachable and operable via keyboard alone (Tab /
  Shift+Tab / Enter / Space), matching the handout's requirement for the
  Development Requester Selection screen and extended to every screen built
  on the same components.
- Error and success messages use `role="alert"` / `aria-live="polite"` as
  appropriate so screen readers announce them without a page reload.

## 8. Responsive Rules

| Viewport | Required behavior |
| --- | --- |
| Desktop ≥ 992px | Multi-column layout as specified per screen below; content centered with a sensible max width (this spec uses 1140px). |
| Tablet 768–991px | Two-column layout where practical; Summary and Description keep full usable width. |
| Mobile < 768px | Fields stack vertically; buttons remain touch-friendly (min 44px tap target); no horizontal page scrolling under any circumstance. |
| All sizes | No clipped labels, overlapping messages, hidden buttons, or unreadable attachment names — verified visually per the checklist in §12. |

## 9. Badges

| Requested Priority / IT Priority | Color |
| --- | --- |
| Low | `--zg-pale` background, `--zg-secondary` text |
| Medium | `--zg-warning-bg` background, `--zg-warning-text` text |
| High | Light red background (`#FBE7E5`), `--zg-error-text` text |

| Current Status | Color |
| --- | --- |
| New | Light blue-gray background (`#E7EEF5`), dark blue-gray text (`#33475B`) |
| Open | Light blue background (`#DCEBFB`), blue text (`#1B5FA8`) |
| In Progress | `--zg-warning-bg` background, `--zg-warning-text` text |
| Pending | `--zg-warning-bg` background, `--zg-warning-text` text, with a distinct icon from In Progress since color alone repeats |
| Resolved | `--zg-pale` background, `--zg-secondary` text |
| Closed | Light neutral gray background (`#EAEAEA`), gray text (`#5A5A5A`) |
| Cancelled | Light neutral gray background (`#EAEAEA`), gray text (`#5A5A5A`), with a distinct icon from Closed |

Every badge shows its label text; color is a reinforcement, never the only
signal (§7).

## 10. Application Shell and Navigation

- Header: `--zg-primary` background, white "TokTickIT" wordmark/icon on the
  left, "My Tickets" and "Create Ticket" nav items, current Requester name
  + a "Profile"-style menu containing "Change Requester" on the right.
- Active page indicated by an underline/weight change in `--zg-secondary`
  on the corresponding nav item (never color alone — the active item's text
  weight also changes).
- Mobile (< 768px): nav collapses behind a menu control; the current
  Requester name and Change Requester action remain reachable within one
  tap.
- Displayed everywhere except the Development Requester Selection screen
  itself (which has no meaningful "current Requester" yet).

## 11. Screen-by-Screen Layout

### 11.1 Development Requester Selection

- Centered card on the page background, no application shell chrome above
  it except the TokTickIT wordmark.
- Icon + "Select Development Requester" heading + one sentence of
  explanatory copy: *"Select a Development Requester to test
  requester-specific ticket behavior. This is not a login screen.
  Authentication and role-based access will be introduced in Lab 3."*
- Required `Development Requester` dropdown (label + red asterisk),
  populated only with active Requesters (BR-09), sorted by name.
- An info callout: *"Only active development requesters are shown."*
- A secondary callout explaining the Lab 3 transition (shield icon +
  "Authentication coming in Lab 3" text), matching the handout's
  illustrative screenshot.
- Cancel (secondary) / Continue (primary, disabled until a Requester is
  chosen) actions.
- **Loading**: dropdown area shows a loading skeleton while active
  Requesters are fetched; Continue stays disabled.
- **Empty** (no active Requesters returned): dropdown replaced by a message
  stating no active Development Requesters are configured, with no path
  forward other than contacting course staff — Continue stays disabled.
- **API failure**: safe error banner, retry action, no crash (AC-21).
- After Continue: the app shell renders with the chosen Requester's name
  shown and a Change Requester action available (§10); all
  Requester-scoped data (My Tickets, etc.) loads fresh for the new
  selection.

### 11.2 Create Ticket

Top to bottom, single card, full width up to the max content width:

1. **System-generated row** (read-only style, §3): Ticket Number
   ("Generated after submission" placeholder text pre-success — never
   blank-looking), Ticket Date (shows "Generated after submission"
   pre-success, the actual timestamp after), Requester (pre-filled from the
   current selection, read-only).
2. **Classification group**: Category, Related System (both required
   dropdowns, side by side on desktop/tablet, stacked on mobile),
   Requested Priority (required, no default — §3 of `specification.md`
   §11-7).
3. **Summary**: full-width single-line input, required, 5–120 chars, live
   character count shown once near the limit.
4. **Description**: full-width multiline textarea, required, 10–2000
   chars, resizable vertically only, live character count shown once near
   the limit.
5. **Attachments**: file picker below Description, showing selected files
   in the states from §6, capped at 5 total (existing active + newly
   selected in this session).
6. **Actions row**: Cancel (secondary) on the left, Submit (primary) on
   the right; Submit shows the Busy state (§4) while in flight.
7. **Success state** replaces the form actions with the generated Ticket
   Number, a success confirmation, and "View Ticket" / "Create Another"
   actions.

Desktop (≥992px): classification group is a 2–3 column row. Tablet: 2
columns. Mobile: every field full width, stacked in the same top-to-bottom
order.

### 11.3 My Tickets

- Page header: "My Tickets" title + one-line subtitle, "Clear Filters"
  (tertiary) and "Create Ticket" (primary) actions top-right.
- Filter row: search input (placeholder "Search by ticket number or
  summary…"), Category / Requested Priority / Current Status dropdowns
  (each defaulting to "All …"). Row wraps to multiple lines on tablet,
  stacks fully on mobile.
- **Desktop/tablet**: sortable table with columns Ticket No. (linked to
  Ticket Detail), Created Date, Summary, Category, Requested Priority
  (badge), Current Status (badge), Last Updated. Sortable column headers
  show a direction indicator.
- **Mobile (< 768px)**: table becomes a stacked card list — one card per
  Ticket, Ticket No. and Summary prominent, badges for Priority/Status,
  Created/Updated dates secondary, whole card tappable to open Ticket
  Detail. No horizontal scroll is introduced as a substitute for this
  transformation.
- Pagination control below the list: Previous/Next, page numbers, "Showing
  X to Y of Z tickets" text — matches the handout's illustrative
  screenshot.
- **Loading**: skeleton rows/cards, filters remain interactive.
- **Empty** (BR-30, §5 of this doc): illustration/icon + "You haven't
  created any tickets yet" + Create Ticket primary action; filters are
  hidden or disabled since there's nothing to filter.
- **No results** (BR-30): "No tickets match your filters" + Clear Filters
  action; filters remain visible/interactive.
- **Failure**: safe error banner with retry; existing filter/search values
  are preserved so the Requester doesn't lose their query.

### 11.4 Requester Ticket Detail

- Breadcrumb: "My Tickets > Ticket Detail", with a "Back to My Tickets"
  action top-right.
- **Ticket information card** (read-only, §3, grouped separately from
  Attachments): Ticket No., Ticket Date, Category, Related System,
  Requester, Requested Priority (badge), Current Status (badge), Summary,
  Description. No Public Comments, Internal Notes, Actions Taken, IT
  Priority, or Ticket Owner fields are rendered — those belong to a later
  lab and must not appear even as disabled placeholders (matches handout
  §8.5: "must not implement Public Comments, Internal Notes, Actions Taken
  or later status-workflow features").
- **Attachments section**, visually distinct from the Ticket information
  card (separate heading/card boundary): list of Attachments in the states
  from §6, an upload control (disabled at the 5-active cap), and per-file
  Download/Remove actions where applicable.
- Removing an Attachment opens a confirmation dialog with an optional
  reason field (§11-2 of `specification.md`) before the soft-remove call
  fires.
- Desktop/tablet: information card fields laid out in a responsive grid
  (2–4 columns depending on width, matching the handout's illustrative
  screenshot grouping). Mobile: single column, same field order.

## 12. Visual Inspection Checklist

To be completed with dated screenshot evidence during implementation, not
during this specification task:

- [ ] No clipped labels at any viewport
- [ ] No overlapping messages (validation, badges, toasts)
- [ ] No unintended horizontal scrolling at any viewport
- [ ] Consistent field styling (editable vs. read-only vs. invalid vs.
      disabled) across Create Ticket and Ticket Detail
- [ ] Badge colors/labels consistent between My Tickets and Ticket Detail
      for the same Priority/Status values
- [ ] Filters, pagination, attachment controls remain usable at all three
      viewports
- [ ] Desktop table ↔ mobile card transformation on My Tickets shows the
      same information, not a subset

## 13. Screenshot Paths

Per the required repository structure, implementation-phase Playwright
screenshots are saved to:

- `artifacts/lab-02/screenshots/create-ticket/{desktop,tablet,mobile}.png`
- `artifacts/lab-02/screenshots/my-tickets/{desktop,tablet,mobile}.png`
- `artifacts/lab-02/screenshots/ticket-detail/{desktop,tablet,mobile}.png`
