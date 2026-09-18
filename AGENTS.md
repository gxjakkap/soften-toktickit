# TokTickIT

IT ticketing app built as a sequence of course labs. `docs/lab-NN/` holds each lab's contract (`specification.md`, `api-spec.md`, `ui-spec.md`); code follows the contract, and the latest lab directory is the one in flight. When code and contract disagree, surface the conflict instead of picking a side.

`client/` and `server/` each have their own `CLAUDE.md`. Setup, run, and test commands live in `README.md` and each `package.json`.

## Traceability

Requirement IDs (`FR-`, `BR-`, `AC-`, `API-`, `UI-`) tie code to contract. Cite the doc section and IDs in comments (`// api-spec.md §5 (FR-05, BR-14)`) and open each test file with its `API-nn`/`UI-nn` and `AC-nn` line. Tests sit in `{client,server}/tests/lab-NN/` and `e2e/lab-NN/`.

Earlier labs' acceptance criteria stay in force. A new lab extends the previous tests and keeps them green.

## Identity seam

Each side reaches "who is asking?" through one file: `server/src/lib/requester-context.ts` and `client/src/apiClient.ts` (BR-31). Handlers and screens go through these, so an auth change lands in two files.

## Attachment rules live twice

`server/src/lib/attachment-validation.ts` and `client/src/lib/attachment-validation.ts` encode the same BR-25 limits and types. Edit both together.

## Commits and branches

- One-line Angular header (`feat: add ticket queue`); commitlint rejects a body, a footer, or any AI-tool credit. The pre-commit hook runs oxlint and oxfmt (no semicolons, single quotes).
- Feature branches merge into `labN-staging`; one release PR takes it to `main`.
- Feature branches are `labN/{feat,docs,chore,fix}/{issue-idx-optional}-{issue-name}`. `labN/` is the lab number, `feat|docs|chore|fix` is the type, and `{issue-idx-optional}-{issue-name}` is a short description of the work. Example: `lab3/feat/4-ticket-queue`.

## Pull requests

- When submitting a PR, if you know the GitHub issue number, mention it in the PR description, add it to the "Development" section of the PR, and move the issue to "PR Review" in the project board.
- When submitting a PR, always pass the texts through `unslop` skill, and remove any AI-generated content. The PR description should be clear, concise, and clean of any AI references.
- When receiving review, fix the code, commit, and push. Don't reply to the comment right away, pass the text through `unslop` skill, and remove any AI-generated content. Then print it to the user to confirm the changes, and only then reply to the comment.

## Fresh clone

pnpm blocks Prisma's install scripts, so run `pnpm prisma:generate` in `server/` before anything else. `server/src/generated/` is gitignored, and a missing client surfaces as `Cannot find module '.../generated/prisma/client.js'`.

Server tests and Playwright e2e need Postgres up (`pnpm db:up`) and seeded.
