# Reviewer for Lab 4

Name: Noppawit Tanmanee
Student ID: 67070501082
GitHub Username: [FakeKase](https://github.com/FakeKase)

One reviewer for every Lab 4 issue. Each PR below lists the review comments, my responses, and the approval, in order. Comment excerpts are trimmed for length, and the full text is on GitHub at the linked PR. Six of the ten feature PRs had changes requested once before approval. The other four were approved on the first review with non-blocking notes.

Three PRs outside the issue list merged into `lab4-staging` without a review: [#73](https://github.com/gxjakkap/soften-toktickit/pull/73) and [#75](https://github.com/gxjakkap/soften-toktickit/pull/75) synced `main` into `lab4-staging`, and [#81](https://github.com/gxjakkap/soften-toktickit/pull/81) changed three CI test commands.

## Issue 1, Sprint 4 engineering contract: [PR #72](https://github.com/gxjakkap/soften-toktickit/pull/72)

- Changes requested, 6 Oct 2026: "The contract is consistent overall. [...] Three things to fix before merging. 1. The 'not before the Ticket's creation' rule is only in api-spec, and it rejects the form's default. [...] 2. The resolvedAt backfill depends on the database session time zone. [...] 3. An idempotent replay has no place in the check order." Also three smaller notes on seeded history, a hardcoded date in the empty history text, and open Actions assigned to a deactivated user.
- Response, 6 Oct 2026: "Thanks, all six are fixed in ef65d53." BR-05 compares `actionAt` to `createdAt` truncated to the minute, and API-07 tests both sides. The backfill uses `"updatedAt" AT TIME ZONE 'UTC'` and MIG-02 runs under Asia/Bangkok. The replay is step 4 in api-spec §0.4, before the state rules, and API-14 covers the resolved-in-between case. The three smaller notes are fixed too, including §11-20.
- Approved, 7 Oct 2026: "All three are fixed, thanks. [...] The smaller ones are done too." One non-blocking nit on the seeded history path.

## Issue 2, DB migration - Actions Taken and seed: [PR #76](https://github.com/gxjakkap/soften-toktickit/pull/76)

- Approved, 7 Oct 2026: "Read the migration, the down script, the seed and both test files. No blocking issues. The backfill is right and MIG-02 really tests it." Two non-blocking notes: a stray `// ponytail:` comment in `seed.ts`, and a heads-up for #64 that the `ON DELETE RESTRICT` keys mean every Ticket cleanup has to delete history and Actions first.

## Issue 3, Actions Taken API: [PR #77](https://github.com/gxjakkap/soften-toktickit/pull/77)

- Changes requested, 8 Oct 2026: "actionAt accepts dates that don't exist and stores a different day. [...] `2026-02-31T10:00Z` -> accepted, stored as `2026-03-03T10:00:00.000Z`. [...] BR-05 and API-07 say a bad actionAt is a 400." Non-blocking: the fraction regex accepts any number of digits.
- Response, 8 Oct 2026: "Fixed in 00f9477. `parseActionAt` now pulls each part out of the regex and rejects a month outside 1 to 12, a day past the end of that month, hour over 23, minute or second over 59, and an offset over 14:00 or with minutes over 59." All four strings are in API-07 and UNIT-04, and the fraction is now `\.\d{1,3}`.
- Approved, 8 Oct 2026: "Checked 00f9477. parseActionAt checks every part before parsing, the day is compared with the real length of the month, and the four strings from my review are in both the unit test and API-07."

## Issue 4, Ticket workflow and resolution gate: [PR #78](https://github.com/gxjakkap/soften-toktickit/pull/78)

- Approved, 9 Oct 2026: "No blocking issues. The order of checks is right on all four routes, the history row sits in the same transaction as the versioned write so a lost write takes it back out, and the resolve-versus-new-action race is closed." Three non-blocking notes: rewritten Lab 3 screenshots, a version bump when the owner or priority doesn't change, and a status select that saves on change (carried into Issue 9).

## Issue 5, Actions Taken UI: [PR #80](https://github.com/gxjakkap/soften-toktickit/pull/80)

- Changes requested, 9 Oct 2026: "The form can be closed while a save is in flight. [...] If the request then fails, the catch sets a banner on a component that is gone. [...] It also drops the clientRequestId." Non-blocking: crossing 768px while editing remounts the edit form and loses the typed values.
- Response, 9 Oct 2026: "Fixed in d606f2d. Cancel is disabled and Esc does nothing while a save is in flight, so a failed save keeps the form, the typed values, the error, and the `clientRequestId`. [...] The layout switch is fixed in c208215. The edit form renders once through a portal."
- Approved, 11 Oct 2026: "d606f2d: Esc waits for the save, Cancel is disabled while saving, and save() returns early. [...] c208215: rendering the edit form once through a portal and moving the host node into whichever row or card is on screen is a neat way to do it. [...] Approving."

## Issue 6, Dashboard APIs: [PR #79](https://github.com/gxjakkap/soften-toktickit/pull/79)

- Approved, 9 Oct 2026: "No blocking issues. The Requester route cannot be widened: requesterId is in every where and no query parameter is read. [...] API-41 and API-50 follow every link and compare totals, which is the test I'd want." Three non-blocking notes: PERF-02 is a single timed call, `previewDescription` can split a surrogate pair, and the staff queries don't share one snapshot.

## Issue 7, IT Staff Dashboard UI: [PR #82](https://github.com/gxjakkap/soften-toktickit/pull/82)

- Changes requested, 11 Oct 2026: "1. A page past the end shows a blank Queue (blocking). [...] 2. The search box does not follow the URL (should fix). [...] 3. An unknown filter value shows as 'undefined' in a chip (minor)." Also asked for the retry backoff commit to be explained in the PR body and its defaults tested.
- Response, 11 Oct 2026: "Thanks, all fixed in 4860efb and 4ff68be." The Queue moves a page past the end to the last page, the search box resyncs with the URL on both the Queue and User Management, and chips fall back to the raw value. While checking chips I also found that `?resolvedFrom=someday` blanked the Queue and fixed `formatBangkokDate`. The PR body now explains API-31 and a unit test pins the retry delays.
- Approved, 12 Oct 2026: "Page past the end: the Queue moves to the last page and corrects the URL [...] Search box: it follows the URL on the nav link and Back [...] Chips: the raw value shows instead of 'undefined'. Nice catch on ?resolvedFrom=someday blanking the Queue, I missed that one."

## Issue 8, Requester Dashboard UI: [PR #83](https://github.com/gxjakkap/soften-toktickit/pull/83)

- Changes requested, 14 Oct 2026: "Clear filters cannot clear a bad sort. /tickets?sortBy=password gets a 400 INVALID_FILTER from the route [...] But clearFilters only removes FILTER_PARAMS, which has no sortBy or sortDir. [...] The Queue from #82 has the same dead end."
- Response, 14 Oct 2026: "Fixed in a6142c7. The invalid-filter banner's Clear filters now drops every query param, sort included, on both My Tickets and the Queue. The no-results Clear Filters still keeps the sort, since that sort was valid." No client-side sort allowlist, because My Tickets accepts `updatedAt` from the drill-down without a column for it.
- Approved, 15 Oct 2026: "The invalid-filter banner's Clear filters now resets the whole URL on both screens, and the no-results Clear Filters still keeps a valid sort. That split is right."

## Issue 9, Final hardening and Zen Green polish: [PR #84](https://github.com/gxjakkap/soften-toktickit/pull/84)

- Changes requested, 18 Oct 2026: "Cancel closes a confirmation while its request is still out. In AttachmentSection.tsx the Remove button is disabled while removing, but Cancel is not [...] If the removal then fails, confirmRemove sets removeError on a dialog that is already gone." The Requester resolve confirmation had the same problem. Also asked whether an id past 2147483647 returns 500.
- Response, 18 Oct 2026: "Cancel during a confirmation (3e97d2d): while the request is out, both dialogs disable Cancel and Close and ignore Esc, so a failure stays in the dialog with the reason kept. [...] Ids (0e51c03): you were right, 17 routes returned 500. Route ids past Int4 now take the same 404 path as `/tickets/abc`. Covered by API-55."
- Approved, 22 Oct 2026: "UI-50 fails 2 of 2 without the dialog change and passes with it. API-55 fails 17 of 17 without toId and passes with it." Two non-blocking notes: ids from the query string and body still return 500 past int4, and one Lab 3 Queue test became flaky.

## Issue 10, Test DD and full regression coverage: [PR #85](https://github.com/gxjakkap/soften-toktickit/pull/85)

- Approved, 28 Oct 2026: "This closes the test plan well. The authorization matrix covers every role on every Lab 4 endpoint, including the 'reaches the handler' side [...] And the BR-29 flake from my note on #84 is fixed the right way." Three non-blocking notes: the int4 500s on query and body ids are still there, EVID-01 loops over the API's own breakdown entries, and the System Status page blames the API when only the database is down.

## Issue 11, Release integration: [PR #86](https://github.com/gxjakkap/soften-toktickit/pull/86)

- Changes requested, 30 Oct 2026: "Requesting changes, only for the two docs. The screenshots, the capture script and the `.gitignore` all look good." `ai_use.md` should be `ai-use.md`, it needs 6 to 10 key prompts and a My Reflection, this file needs the comments, responses, and approvals, and the PR description still lists both docs as missing. Also recommended fixing the Cancelled Ticket copy in Actions Taken.
- Response, 30 Oct 2026: Renamed the file to `ai-use.md`, cut it to ten prompts with a My Reflection at the end, added every review round to this file, and updated the PR description. A Cancelled Ticket's Actions Taken helper now says "This ticket is Cancelled. Actions can't be added." instead of telling staff to reopen it, with ui-spec §5.2, UI-21, and the `workflow/*-status-cancelled-final.png` screenshots updated to match. The specification status now reads Final.
- Approval: pending.
