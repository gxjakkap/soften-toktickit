# Visual and Accessibility Checklist, Release Check

Issue #71 re-checked the `docs/lab-04/ui-spec.md` §12 checklist that
Issue #69 completed, on `lab4/feat/11-release-integration` (from
`lab4-staging` `db60408`), 29 Oct 2026. Every item still holds. Screenshot
paths are relative to `artifacts/lab-04/screenshots/`.

The screenshots were taken in a browser whose time zone was UTC, so every
time on them is also evidence for item 12.

| # | Item (ui-spec.md §12) | Still holds | Tests | Screenshots |
| --- | --- | --- | --- | --- |
| 1 | Both dashboards and both Ticket Detail screens use the same Zen Green tokens, card style, and badges as Lab 2/3 | Yes | HARD-01 (axe), STYLE-03 | [staff-dashboard/desktop-with-data.png](../screenshots/staff-dashboard/desktop-with-data.png), [requester-dashboard/desktop-with-data.png](../screenshots/requester-dashboard/desktop-with-data.png), [actions-taken/desktop-multiple-actions-different-staff.png](../screenshots/actions-taken/desktop-multiple-actions-different-staff.png), [actions-taken/desktop-requester-read-only.png](../screenshots/actions-taken/desktop-requester-read-only.png) |
| 2 | Metric cards readable and unclipped at three widths; value never color-only | Yes | STYLE-01, HARD-01, UI-02 | [staff-dashboard/desktop-with-data.png](../screenshots/staff-dashboard/desktop-with-data.png), [tablet](../screenshots/staff-dashboard/tablet-with-data.png), [mobile](../screenshots/staff-dashboard/mobile-with-data.png); [requester-dashboard/mobile-with-data.png](../screenshots/requester-dashboard/mobile-with-data.png) |
| 3 | Zero cards and empty lists show helper text | Yes | UI-03, UI-08, E2E-09 | [staff-dashboard/desktop-empty-my-open-actions.png](../screenshots/staff-dashboard/desktop-empty-my-open-actions.png), [requester-dashboard/desktop-zero-metric-cards.png](../screenshots/requester-dashboard/desktop-zero-metric-cards.png), [requester-dashboard/desktop-zero-data-empty-state.png](../screenshots/requester-dashboard/desktop-zero-data-empty-state.png) |
| 4 | Editable, read-only (locked), invalid, and disabled Action fields are distinct | Yes | UI-16 | [actions-taken/desktop-edit-mode-in-progress.png](../screenshots/actions-taken/desktop-edit-mode-in-progress.png), [actions-taken/desktop-edit-mode-done-locked-fields.png](../screenshots/actions-taken/desktop-edit-mode-done-locked-fields.png), [actions-taken/desktop-follow-up-note-required-error.png](../screenshots/actions-taken/desktop-follow-up-note-required-error.png) |
| 5 | Validation messages sit directly under their field with no overlap | Yes | HARD-01 (validation states at 1440/768/375) | [actions-taken/mobile-follow-up-note-required-error.png](../screenshots/actions-taken/mobile-follow-up-note-required-error.png), [actions-taken/desktop-status-done-requires-result.png](../screenshots/actions-taken/desktop-status-done-requires-result.png), [actions-taken/desktop-inactive-assignee-rejected.png](../screenshots/actions-taken/desktop-inactive-assignee-rejected.png) |
| 6 | Cancelled Actions and inactive assignees distinguishable without color | Yes | UI-11 | [actions-taken/desktop-status-cancelled-action.png](../screenshots/actions-taken/desktop-status-cancelled-action.png), [actions-taken/desktop-inactive-assignee-badge.png](../screenshots/actions-taken/desktop-inactive-assignee-badge.png) |
| 7 | Shared vs. private content distinct; Actions Taken helper about Requester visibility present | Yes | UI-12 | [regression/desktop-staff-public-comments-vs-internal-notes.png](../screenshots/regression/desktop-staff-public-comments-vs-internal-notes.png), [actions-taken/desktop-create-mode.png](../screenshots/actions-taken/desktop-create-mode.png) |
| 8 | Status, IT Priority, Action Status, and Follow-Up badges carry text and an icon | Yes | UI-48, UI-11 | [staff-dashboard/desktop-with-data.png](../screenshots/staff-dashboard/desktop-with-data.png), [workflow/desktop-status-history-staff.png](../screenshots/workflow/desktop-status-history-staff.png) |
| 9 | Keyboard reaches every dashboard link and Actions Taken control in order with visible focus; the form returns focus on close | Yes | A11Y-02, HARD-03, UI-23, UI-47 | Focus order is behavior, so the tests are the evidence. [actions-taken/desktop-create-mode.png](../screenshots/actions-taken/desktop-create-mode.png) shows focus moved to the New Action heading. |
| 10 | No clipping, overlap, or horizontal scroll at desktop, tablet, and mobile | Yes | HARD-01, STYLE-01, STYLE-02, E2E-01 | Every capture asserts `scrollWidth` ≤ viewport before saving; see any `mobile-*.png`, for example [actions-taken/mobile-multiple-actions-different-staff.png](../screenshots/actions-taken/mobile-multiple-actions-different-staff.png) |
| 11 | Navigation shows exactly the permitted items per role, active page not by color alone | Yes | UI-32, E2E-11 | [requester-dashboard/desktop-with-data.png](../screenshots/requester-dashboard/desktop-with-data.png), [staff-dashboard/desktop-with-data.png](../screenshots/staff-dashboard/desktop-with-data.png), [staff-dashboard/desktop-admin-with-user-accounts.png](../screenshots/staff-dashboard/desktop-admin-with-user-accounts.png) |
| 12 | Every date/time shows Bangkok time under a different browser time zone | Yes | HARD-02, E2E-13, UNIT-07 | All screenshots (browser in UTC), for example [workflow/desktop-status-history-staff.png](../screenshots/workflow/desktop-status-history-staff.png) |

## Hardening E2E re-run

`pnpm e2e` on the same branch, Linux, Chromium headless, against a freshly
migrated and seeded database: **67 passed, 0 failed, 0 flaky, 0 skipped**
(10.2 min). The Issue #69 hardening and accessibility tests, which fail on
any console error or warning, unexpected failed request, horizontal page
scroll, or serious/critical axe violation:

| Test | Result |
| --- | --- |
| HARD-01: login, change password, and system check | Pass |
| HARD-01: Requester screens | Pass |
| HARD-01: IT Staff screens | Pass |
| HARD-01: Administrator screens | Pass |
| HARD-02: dates render in Bangkok time under a non-Bangkok browser zone | Pass |
| HARD-03: focus ring is visible on header and page links | Pass |
| A11Y-02: Tab reaches every staff dashboard card in order, visibly, and Enter drills down | Pass |
| A11Y-02: the Actions Taken form opens, saves, and closes by keyboard with focus return | Pass |
