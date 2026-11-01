# Lab 4 Pull Requests

Source: `gh pr list --base lab4-staging --state all --limit 100 --json number,title,url,state,mergedAt,author,reviews`, captured 29 Oct 2026. Reviewer is every account that submitted a review, with its review states in order.

| # | Title | Link | Author | Reviewer (reviews) | Status | Merged (UTC) |
| --- | --- | --- | --- | --- | --- | --- |
| 72 | [Lab 4] 1: Sprint 4 engineering contract | https://github.com/gxjakkap/soften-toktickit/pull/72 | gxjakkap | FakeKase (CHANGES_REQUESTED → APPROVED) | MERGED | 2026-10-07 08:48:57 |
| 73 | chore: sync main into lab4-staging | https://github.com/gxjakkap/soften-toktickit/pull/73 | gxjakkap | none | MERGED | 2026-10-06 08:46:11 |
| 75 | chore: sync main into lab4-staging | https://github.com/gxjakkap/soften-toktickit/pull/75 | gxjakkap | none | MERGED | 2026-10-06 09:40:18 |
| 76 | [Lab 4] 2: DB migration: Actions Taken + seed | https://github.com/gxjakkap/soften-toktickit/pull/76 | gxjakkap | FakeKase (APPROVED) | MERGED | 2026-10-07 15:55:28 |
| 77 | [Lab 4] 3: Actions Taken API | https://github.com/gxjakkap/soften-toktickit/pull/77 | gxjakkap | FakeKase (CHANGES_REQUESTED → APPROVED) | MERGED | 2026-10-08 08:11:17 |
| 78 | [Lab 4] 4: Ticket workflow + resolution gate | https://github.com/gxjakkap/soften-toktickit/pull/78 | gxjakkap | FakeKase (APPROVED) | MERGED | 2026-10-09 06:47:52 |
| 79 | [Lab 4] 6: Dashboard APIs | https://github.com/gxjakkap/soften-toktickit/pull/79 | gxjakkap | FakeKase (APPROVED) | MERGED | 2026-10-09 08:44:18 |
| 80 | [Lab 4] 5: Actions Taken UI | https://github.com/gxjakkap/soften-toktickit/pull/80 | gxjakkap | FakeKase (CHANGES_REQUESTED → APPROVED) | MERGED | 2026-10-11 07:35:19 |
| 81 | fix: pass test reporter flags without a literal double dash | https://github.com/gxjakkap/soften-toktickit/pull/81 | gxjakkap | none | MERGED | 2026-10-09 15:57:43 |
| 82 | [Lab 4] 7: IT Staff Dashboard UI | https://github.com/gxjakkap/soften-toktickit/pull/82 | gxjakkap | FakeKase (CHANGES_REQUESTED → APPROVED) | MERGED | 2026-10-12 05:34:41 |
| 83 | [Lab 4] 8: Requester Dashboard UI | https://github.com/gxjakkap/soften-toktickit/pull/83 | gxjakkap | FakeKase (CHANGES_REQUESTED → APPROVED) | MERGED | 2026-10-15 07:09:40 |
| 84 | [Lab 4] 9: Final hardening + Zen Green polish | https://github.com/gxjakkap/soften-toktickit/pull/84 | gxjakkap | FakeKase (CHANGES_REQUESTED → APPROVED) | MERGED | 2026-10-22 04:12:17 |
| 85 | [Lab 4] 10: Test DD + full regression coverage | https://github.com/gxjakkap/soften-toktickit/pull/85 | gxjakkap | FakeKase (APPROVED) | MERGED | 2026-10-28 10:49:44 |

## Raw output

Columns: number, title, branch, state, created at.

```text
$ gh pr list --base lab4-staging --state all
85	[Lab 4] 10: Test DD + full regression coverage	lab4/feat/10-test-coverage	MERGED	2026-10-22T11:00:09Z
84	[Lab 4] 9: Final hardening + Zen Green polish	lab4/feat/9-final-hardening	MERGED	2026-10-15T08:47:06Z
83	[Lab 4] 8: Requester Dashboard UI	lab4/feat/8-requester-dashboard-ui	MERGED	2026-10-12T07:17:44Z
82	[Lab 4] 7: IT Staff Dashboard UI	lab4/feat/7-staff-dashboard-ui	MERGED	2026-10-11T07:57:48Z
81	fix: pass test reporter flags without a literal double dash	lab4/fix/ci-test-report	MERGED	2026-10-09T15:53:12Z
80	[Lab 4] 5: Actions Taken UI	lab4/feat/5-actions-taken-ui	MERGED	2026-10-09T09:03:21Z
79	[Lab 4] 6: Dashboard APIs	lab4/feat/6-dashboard-api	MERGED	2026-10-09T07:07:56Z
78	[Lab 4] 4: Ticket workflow + resolution gate	lab4/feat/4-ticket-workflow	MERGED	2026-10-07T18:04:54Z
77	[Lab 4] 3: Actions Taken API	lab4/feat/3-actions-taken-api	MERGED	2026-10-07T17:04:09Z
76	[Lab 4] 2: DB migration: Actions Taken + seed	lab4/feat/2-actions-taken-migration	MERGED	2026-10-07T10:26:14Z
75	chore: sync main into lab4-staging	main	MERGED	2026-10-06T09:26:16Z
73	chore: sync main into lab4-staging	main	MERGED	2026-10-06T08:45:55Z
72	[Lab 4] 1: Sprint 4 engineering contract	lab4/feat/1-engineering-contract	MERGED	2026-10-06T08:40:09Z
```
