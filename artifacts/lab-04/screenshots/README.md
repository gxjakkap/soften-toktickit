# Lab 4 Screenshots

Captured by `e2e/lab-04/capture-screenshots.ts` against a freshly migrated
and seeded database (`pnpm screenshots`, see the README's Testing section).
Each file is named `<viewport>-<state>.png`:

- `desktop`: 1440 px wide
- `tablet`: 768 px wide
- `mobile`: 375 px wide

Every capture is a full-page screenshot, taken only after the script has
asserted that the page has no horizontal scroll at that width (STYLE-01,
STYLE-02, AC-41).

Grading parts follow handout §14. Every state captured at all three widths
also supports Part 9 (responsive layout).

Notes on how some states are produced:

- **Loading** holds the dashboard request open, and **safe failure**
  answers it with a `500`, using Playwright request routing. Every other
  screen shows real server responses.
- **Status options**: a native `<select>` popup never appears in a page
  screenshot, so the Current Status control is shown as an open list
  (`size` attribute) for the capture. The options listed are exactly the
  ones the app rendered.
- `/dashboard` renders by role, so no role can open the other role's
  dashboard screen. The **forbidden** captures show the other role
  following a drill-down link (full-page forbidden state), and calling the
  other dashboard's API directly (`403 FORBIDDEN`, no metrics).
- Seeded data is only read. Writes (conflict, rejections, status changes,
  comments, attachments) use fixture Tickets and a fixture user that the
  script deletes afterwards.

## staff-dashboard/

| State | Files | Shows | Part |
| --- | --- | --- | --- |
| with-data | [desktop](staff-dashboard/desktop-with-data.png), [tablet](staff-dashboard/tablet-with-data.png), [mobile](staff-dashboard/mobile-with-data.png) | Sarah Johnson (IT Staff): six metric cards, both breakdowns, My Open Actions, and Recently Updated from the seed | 5 |
| empty-my-open-actions | [desktop](staff-dashboard/desktop-empty-my-open-actions.png), [tablet](staff-dashboard/tablet-empty-my-open-actions.png), [mobile](staff-dashboard/mobile-empty-my-open-actions.png) | Seeded zero-data scope: Nattapong Srisuk's My Open Actions card is 0 with its helper text and the list shows its empty message | 5 |
| loading | [desktop](staff-dashboard/desktop-loading.png), [tablet](staff-dashboard/tablet-loading.png), [mobile](staff-dashboard/mobile-loading.png) | Skeleton cards at final size while the dashboard request is pending | 5 |
| safe-failure | [desktop](staff-dashboard/desktop-safe-failure.png), [tablet](staff-dashboard/tablet-safe-failure.png), [mobile](staff-dashboard/mobile-safe-failure.png) | The API fails: safe error banner with Retry and no partial numbers | 5 |
| admin-with-user-accounts | [desktop](staff-dashboard/desktop-admin-with-user-accounts.png), [tablet](staff-dashboard/tablet-admin-with-user-accounts.png), [mobile](staff-dashboard/mobile-admin-with-user-accounts.png) | Alex Morgan (Administrator): the staff dashboard plus the User Accounts card | 5 |
| drilldown-unassigned-queue | [desktop](staff-dashboard/desktop-drilldown-unassigned-queue.png), [tablet](staff-dashboard/tablet-drilldown-unassigned-queue.png), [mobile](staff-dashboard/mobile-drilldown-unassigned-queue.png) | The Unassigned card opens the Ticket Queue filtered to unassigned active Tickets, with filter chips and a total equal to the card | 5 |
| drilldown-my-open-actions-queue | [desktop](staff-dashboard/desktop-drilldown-my-open-actions-queue.png), [tablet](staff-dashboard/tablet-drilldown-my-open-actions-queue.png), [mobile](staff-dashboard/mobile-drilldown-my-open-actions-queue.png) | The My Open Actions card opens the Queue filtered to Tickets with open Actions assigned to the caller | 5 |
| forbidden-requester-on-staff-drilldown | [desktop](staff-dashboard/desktop-forbidden-requester-on-staff-drilldown.png), [tablet](staff-dashboard/tablet-forbidden-requester-on-staff-drilldown.png), [mobile](staff-dashboard/mobile-forbidden-requester-on-staff-drilldown.png) | A Requester opening a staff dashboard drill-down URL gets the full-page forbidden state | 5 |
| forbidden-requester-api-403 | [desktop](staff-dashboard/desktop-forbidden-requester-api-403.png) | A Requester calling `GET /api/dashboard/staff` directly gets `403 FORBIDDEN` and no metrics | 5 |

## requester-dashboard/

| State | Files | Shows | Part |
| --- | --- | --- | --- |
| with-data | [desktop](requester-dashboard/desktop-with-data.png), [tablet](requester-dashboard/tablet-with-data.png), [mobile](requester-dashboard/mobile-with-data.png) | Jennifer Anderson: Open Tickets, Waiting for You (warning cue), Resolved (Last 30 Days), Recently Updated, and Recently Resolved, all from her own Tickets | 8 |
| attention-waiting-for-you | [desktop](requester-dashboard/desktop-attention-waiting-for-you.png), [tablet](requester-dashboard/tablet-attention-waiting-for-you.png), [mobile](requester-dashboard/mobile-attention-waiting-for-you.png) | The Waiting for You card opens My Tickets filtered to the Tickets that need the Requester's reply | 8 |
| drilldown-open-tickets | [desktop](requester-dashboard/desktop-drilldown-open-tickets.png), [tablet](requester-dashboard/tablet-drilldown-open-tickets.png), [mobile](requester-dashboard/mobile-drilldown-open-tickets.png) | The Open Tickets card opens My Tickets with the Active filter chip | 8 |
| zero-metric-cards | [desktop](requester-dashboard/desktop-zero-metric-cards.png), [tablet](requester-dashboard/tablet-zero-metric-cards.png), [mobile](requester-dashboard/mobile-zero-metric-cards.png) | Michael Brown: Waiting for You and Resolved (Last 30 Days) are 0 with their helper text | 8 |
| zero-data-empty-state | [desktop](requester-dashboard/desktop-zero-data-empty-state.png), [tablet](requester-dashboard/tablet-zero-data-empty-state.png), [mobile](requester-dashboard/mobile-zero-data-empty-state.png) | Emma Watson has no Tickets: the dashboard empty state with Create Ticket | 8 |
| forbidden-staff-on-requester-drilldown | [desktop](requester-dashboard/desktop-forbidden-staff-on-requester-drilldown.png), [tablet](requester-dashboard/tablet-forbidden-staff-on-requester-drilldown.png), [mobile](requester-dashboard/mobile-forbidden-staff-on-requester-drilldown.png) | IT Staff opening a Requester dashboard drill-down URL (My Tickets) get the full-page forbidden state | 8 |
| forbidden-staff-api-403 | [desktop](requester-dashboard/desktop-forbidden-staff-api-403.png) | IT Staff calling `GET /api/dashboard/requester` directly get `403 FORBIDDEN` and no metrics | 8 |

## actions-taken/

| State | Files | Shows | Part |
| --- | --- | --- | --- |
| multiple-actions-different-staff | [desktop](actions-taken/desktop-multiple-actions-different-staff.png), [tablet](actions-taken/tablet-multiple-actions-different-staff.png), [mobile](actions-taken/mobile-multiple-actions-different-staff.png) | "Laptop battery drains within an hour": Done, Cancelled, In Progress, and Planned Actions performed by Sarah Johnson, Nattapong Srisuk, Ahmed Hassan, and Alex Morgan; table on desktop and tablet, cards on mobile | 6 |
| create-mode | [desktop](actions-taken/desktop-create-mode.png), [tablet](actions-taken/tablet-create-mode.png), [mobile](actions-taken/mobile-create-mode.png) | The New Action form opened with focus on its heading | 6 |
| follow-up-note-required-error | [desktop](actions-taken/desktop-follow-up-note-required-error.png), [tablet](actions-taken/tablet-follow-up-note-required-error.png), [mobile](actions-taken/mobile-follow-up-note-required-error.png) | Follow-Up Required checked with no note: the field error under Follow-Up Note, nothing saved | 6 |
| edit-mode-in-progress | [desktop](actions-taken/desktop-edit-mode-in-progress.png), [tablet](actions-taken/tablet-edit-mode-in-progress.png), [mobile](actions-taken/mobile-edit-mode-in-progress.png) | Edit mode on an In Progress Action: every field editable | 6 |
| edit-mode-done-locked-fields | [desktop](actions-taken/desktop-edit-mode-done-locked-fields.png), [tablet](actions-taken/tablet-edit-mode-done-locked-fields.png), [mobile](actions-taken/mobile-edit-mode-done-locked-fields.png) | Edit mode on a Done Action: description, result, status, and assignee read-only with the reason; follow-up still editable | 6 |
| status-done-requires-result | [desktop](actions-taken/desktop-status-done-requires-result.png), [tablet](actions-taken/tablet-status-done-requires-result.png), [mobile](actions-taken/mobile-status-done-requires-result.png) | Status changed to Done without a Result: field error under Result | 6 |
| conflict-409-stale-update | [desktop](actions-taken/desktop-conflict-409-stale-update.png), [tablet](actions-taken/tablet-conflict-409-stale-update.png), [mobile](actions-taken/mobile-conflict-409-stale-update.png) | A colleague saved the Action first: the `409 STALE_UPDATE` notice with the latest values and Reload latest, the user's input kept | 6 |
| status-cancel-confirmation | [desktop](actions-taken/desktop-status-cancel-confirmation.png), [tablet](actions-taken/tablet-status-cancel-confirmation.png), [mobile](actions-taken/mobile-status-cancel-confirmation.png) | Setting an Action to Cancelled asks for inline confirmation, because Cancelled is final | 6 |
| status-cancelled-action | [desktop](actions-taken/desktop-status-cancelled-action.png), [tablet](actions-taken/tablet-status-cancelled-action.png), [mobile](actions-taken/mobile-status-cancelled-action.png) | The cancelled Action stays visible, struck through, with a Cancelled badge and no edit control | 6 |
| inactive-assignee-badge | [desktop](actions-taken/desktop-inactive-assignee-badge.png), [tablet](actions-taken/tablet-inactive-assignee-badge.png), [mobile](actions-taken/mobile-inactive-assignee-badge.png) | "VPN disconnects every hour": an open Action still assigned to the deactivated Linda Park, marked Inactive | 6 |
| inactive-assignee-rejected | [desktop](actions-taken/desktop-inactive-assignee-rejected.png), [tablet](actions-taken/tablet-inactive-assignee-rejected.png), [mobile](actions-taken/mobile-inactive-assignee-rejected.png) | The chosen assignee was deactivated before the save: the server rejects it (`INVALID_ASSIGNEE`) and the error shows under Assigned To | 6 |
| requester-read-only | [desktop](actions-taken/desktop-requester-read-only.png), [tablet](actions-taken/tablet-requester-read-only.png), [mobile](actions-taken/mobile-requester-read-only.png) | David Chen (the Requester) sees every Action field on his own Ticket, with no create or edit control | 6 |
| resolve-blocked-open-action | [desktop](actions-taken/desktop-resolve-blocked-open-action.png), [tablet](actions-taken/tablet-resolve-blocked-open-action.png), [mobile](actions-taken/mobile-resolve-blocked-open-action.png) | A Planned Action blocks Resolved; the callout names the failed condition | 6, 7 |
| resolve-available-gate-met | [desktop](actions-taken/desktop-resolve-available-gate-met.png), [tablet](actions-taken/tablet-resolve-available-gate-met.png), [mobile](actions-taken/mobile-resolve-available-gate-met.png) | After that Action is marked Done, the callout is gone and Resolved is offered, without a page reload | 6, 7 |

## workflow/

| State | Files | Shows | Part |
| --- | --- | --- | --- |
| status-options-new | [desktop](workflow/desktop-status-options-new.png), [tablet](workflow/tablet-status-options-new.png), [mobile](workflow/mobile-status-options-new.png) | A New Ticket offers only Open, In Progress, and Cancelled | 7 |
| status-options-in-progress-resolve-blocked | [desktop](workflow/desktop-status-options-in-progress-resolve-blocked.png), [tablet](workflow/tablet-status-options-in-progress-resolve-blocked.png), [mobile](workflow/mobile-status-options-in-progress-resolve-blocked.png) | IT Staff on an In Progress Ticket: Waiting for Requester, Resolved (blocked, disabled), and Cancelled, with the gate callout | 7 |
| status-options-admin-in-progress | [desktop](workflow/desktop-status-options-admin-in-progress.png), [tablet](workflow/tablet-status-options-admin-in-progress.png), [mobile](workflow/mobile-status-options-admin-in-progress.png) | The Administrator gets the same control and options as IT Staff | 7 |
| status-options-resolved | [desktop](workflow/desktop-status-options-resolved.png), [tablet](workflow/tablet-status-options-resolved.png), [mobile](workflow/mobile-status-options-resolved.png) | A Resolved Ticket offers only Closed and Reopened | 7 |
| status-cancelled-final | [desktop](workflow/desktop-status-cancelled-final.png), [tablet](workflow/tablet-status-cancelled-final.png), [mobile](workflow/mobile-status-cancelled-final.png) | A Cancelled Ticket: final, no further transitions and no Action writes | 7 |
| resolution-gate-error-409 | [desktop](workflow/desktop-resolution-gate-error-409.png), [tablet](workflow/tablet-resolution-gate-error-409.png), [mobile](workflow/mobile-resolution-gate-error-409.png) | The page loaded with the gate met, a colleague then added a Planned Action, and the server refused Resolved (`409 RESOLUTION_BLOCKED`); the callout switches to the server's reason | 7 |
| status-history-staff | [desktop](workflow/desktop-status-history-staff.png), [tablet](workflow/tablet-status-history-staff.png), [mobile](workflow/mobile-status-history-staff.png) | Status History with eight entries (creation plus seven changes), oldest first, each with who and when | 7 |
| status-history-requester | [desktop](workflow/desktop-status-history-requester.png), [tablet](workflow/tablet-status-history-requester.png), [mobile](workflow/mobile-status-history-requester.png) | The Requester sees the same history, read-only, with no status control | 7 |
| requester-advisory-confirm | [desktop](workflow/desktop-requester-advisory-confirm.png), [tablet](workflow/tablet-requester-advisory-confirm.png), [mobile](workflow/mobile-requester-advisory-confirm.png) | The Requester's "Problem Appears Resolved" confirmation dialog | 7 |
| requester-advisory-recorded-status-unchanged | [desktop](workflow/desktop-requester-advisory-recorded-status-unchanged.png), [tablet](workflow/tablet-requester-advisory-recorded-status-unchanged.png), [mobile](workflow/mobile-requester-advisory-recorded-status-unchanged.png) | After confirming, the note is recorded and Current Status is unchanged | 7 |
| requester-advisory-staff-view | [desktop](workflow/desktop-requester-advisory-staff-view.png), [tablet](workflow/tablet-requester-advisory-staff-view.png), [mobile](workflow/mobile-requester-advisory-staff-view.png) | IT Staff see "Requester confirms resolved" as information only; the Ticket stays Reopened | 7 |

## regression/

Desktop only, one per earlier-lab feature (handout §14 Part 8).

| File | Shows | Part |
| --- | --- | --- |
| [desktop-login.png](regression/desktop-login.png) | Login screen | 8 |
| [desktop-change-password.png](regression/desktop-change-password.png) | Mandatory password change for Siriporn Wattana, redirected from My Tickets | 8 |
| [desktop-my-tickets.png](regression/desktop-my-tickets.png) | My Tickets for Jennifer Anderson with search, filters, sorting, and pagination | 8 |
| [desktop-create-ticket.png](regression/desktop-create-ticket.png) | Create Ticket form | 8 |
| [desktop-requester-ticket-detail-attachments.png](regression/desktop-requester-ticket-detail-attachments.png) | Requester Ticket Detail with two attachments, a Public Comment, and no Internal Note | 8 |
| [desktop-staff-public-comments-vs-internal-notes.png](regression/desktop-staff-public-comments-vs-internal-notes.png) | Staff Ticket Detail: the shared Public Comments section next to the private Internal Notes panel | 8 |
| [desktop-ticket-queue.png](regression/desktop-ticket-queue.png) | IT Staff Ticket Queue | 8 |
| [desktop-admin-user-management.png](regression/desktop-admin-user-management.png) | Administrator User Management | 8 |
