# TokTickIT

Full-stack monorepo.

- `client/`: Vite + React + TypeScript, styled with Bootstrap
- `server/`: Express + TypeScript, Prisma as the ORM (`server/prisma/` holds the schema)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+
- [Docker](https://www.docker.com/), for the local PostgreSQL database

## Setup

1. Start the database.

   ```bash
   pnpm db:up
   ```

2. Install dependencies for the whole workspace (`client/`, `server/`, and the root Playwright suite), from the repository root.

   ```bash
   pnpm install
   ```

3. Configure environment variables.

   ```bash
   cp client/.env.example client/.env
   cp server/.env.example server/.env
   ```

   Adjust values if you changed the default Postgres credentials or ports in `docker-compose.yaml`.

   | File | Variable | Default | Used for |
   | --- | --- | --- | --- |
   | `server/.env` | `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/toktickit?schema=public` | Prisma connection for the API, migrations, seed, and server tests |
   | `server/.env` | `PORT` | `3001` | API port. The client's Vite dev server proxies `/api` to `http://localhost:3001`, so change both together. |
   | `client/.env` | `VITE_API_URL` | `http://localhost:3001` | Kept from Lab 1. The client calls relative `/api/...` URLs through the Vite proxy and does not read it. |

4. Apply the Prisma schema and generate the Prisma Client, from `server/`. If the database already holds data you want to keep (for example a Lab 3 database before the Lab 4 migration), back it up first, as described in [Rollback and recovery](#rollback-and-recovery).

   ```bash
   cd server
   pnpm prisma:migrate
   pnpm prisma:generate
   ```

   Run `prisma:generate` even though `prisma:migrate` normally runs it too. pnpm blocks Prisma's install-time build scripts by default (you'll see an "Ignored build scripts" notice during `pnpm install`), so `server/src/generated/` never gets written without this explicit step. Skip it and `prisma:seed` and every later server command fail with `Cannot find module '.../generated/prisma/client.js'`.

5. Seed reference data, users, tickets, comments, Actions Taken, and status history. Safe to re-run.

   ```bash
   cd server
   pnpm prisma:seed
   ```

   Local development only. Every seeded account (`*@example.com`: five active and one inactive Requester, three active and one inactive IT Staff, one Administrator) shares the password `DevPass123!`. Not a secret, never use it outside a local database. Passwords are stored as bcrypt hashes. Re-running the seed resets these accounts to that state. `siriporn.wattana@example.com` is seeded with a mandatory password change, as are Lab 2 Requesters migrated from an older database.

   Seed dates are relative to the current Asia/Bangkok day, so "today" and "last 30 days" stay meaningful. Re-run the seed on a later day to move them forward.

   Demo accounts (all `*@example.com`, password `DevPass123!`):

   | Role | Account | What it shows |
   | --- | --- | --- |
   | Requester | `jennifer.anderson@example.com` | 14 Tickets (more than one page), non-zero Requester Dashboard cards and both recent lists |
   | Requester | `michael.brown@example.com` | Open Tickets only: Waiting for You and Resolved (Last 30 Days) are 0 |
   | Requester | `emma.watson@example.com` | No Tickets: the Requester Dashboard and My Tickets empty states |
   | Requester | `david.chen@example.com` | Owner of the Lab 4 demo Tickets with several Actions each |
   | Requester | `siriporn.wattana@example.com` | Must change the password before anything else |
   | Requester | `patricia.reyes@example.com` | Inactive: sign-in is refused |
   | IT Staff | `sarah.johnson@example.com` | Non-zero staff dashboard, including My Open Actions and Follow-Ups Pending |
   | IT Staff | `ahmed.hassan@example.com` | A second staff member who performs Actions on other people's Tickets |
   | IT Staff | `nattapong.srisuk@example.com` | Owns active Tickets but has no open Actions assigned: My Open Actions is 0 |
   | IT Staff | `linda.park@example.com` | Inactive: sign-in is refused; still the assignee of an open Action, shown with an Inactive badge |
   | Administrator | `alex.morgan@example.com` | Staff dashboard plus User Accounts; owns an active Ticket and has an open Action |

## Rollback and recovery

Prisma Migrate has no down migrations, so recovery for the Lab 4 migration (`20261007101745_actions_taken_workflow`) is manual. Run these commands from the repository root with the Docker database up.

1. Back up before migrating any database that holds data worth keeping. This dump is the recovery point for every case below.

   ```bash
   docker compose exec -T postgres pg_dump -U postgres --format=custom toktickit > toktickit-backup.dump
   ```

2. If the forward migration fails, it runs in one transaction, so the Lab 3 schema is left intact. Fix the cause, mark the attempt rolled back, and migrate again:

   ```bash
   cd server
   pnpm exec prisma migrate resolve --rolled-back 20261007101745_actions_taken_workflow
   pnpm prisma:migrate
   ```

3. To undo a successful migration, run the rollback script. It drops `TicketStatusHistory`, `ActionTaken`, the `ActionStatus` enum, `Ticket.version`, `Ticket.resolvedAt`, and the new indexes, then removes the migration's row from `_prisma_migrations`. Lab 1–3 rows and columns are not touched. Actions Taken and status history recorded after the migration are lost, so take the backup in step 1 first if they matter. Regenerate the Prisma Client on the Lab 3 code afterward.

   ```bash
   docker compose exec -T postgres psql -U postgres -d toktickit -v ON_ERROR_STOP=1 \
     < server/prisma/rollback/20261007101745_actions_taken_workflow.down.sql
   ```

4. If the rollback script can't be applied, restore the backup:

   ```bash
   docker compose exec -T postgres pg_restore -U postgres -d toktickit --clean --if-exists < toktickit-backup.dump
   ```

`server/tests/lab-04/migration.integration.test.ts` checks the migration, the rollback script, and a re-apply against a scratch database holding Lab 3 data.

## Running the apps

In separate terminals:

```bash
cd server && pnpm dev   # http://localhost:3001
cd client && pnpm dev   # http://localhost:5173
```

The app opens on the login screen (`/login`). Sign in with a seeded account's email and the shared dev password above. Every role lands on `/dashboard`: the Requester Dashboard for a Requester, the IT Staff Dashboard for IT Staff and the Administrator. An account with a mandatory password change goes to Change Password first. Every date and time is shown in Bangkok time, whatever the browser's time zone. The Lab 1 system check lives at `/system-check`, off the navigation.

## Demo script (Lab 4)

Run the seed first so the numbers below hold. Each step names the account to sign in as.

1. **IT Staff dashboard** (`sarah.johnson@example.com`). Read the six cards, the two breakdowns, My Open Actions, and Recently Updated. Open any card: the Ticket Queue opens with the card's filters as chips, and its total matches the card. Press Refresh to reload the numbers. Sign in as `nattapong.srisuk@example.com` to show My Open Actions at 0 with its helper text.
2. **Actions Taken** (Sarah). From My Open Actions, open "Laptop battery drains within an hour". The section lists Done, Cancelled, In Progress, and Planned Actions performed by different staff. Use + Add Action, save with an empty Follow-Up Note while Follow-Up Required is checked to show the field error, then save a valid Action. Then open "VPN disconnects every hour" and edit its Done Action: the description and result are locked with a one-line reason, while the follow-up can still be cleared. The same Ticket shows an open Action assigned to the inactive Linda Park.
3. **Ticket workflow** (Sarah, same Ticket). Open Current Status: Resolved is listed as "Resolved (blocked)", with the failed conditions under it. Mark the In Progress and Planned Actions Done or Cancelled, then set Resolved. The status badge and Status History update in place. Open the Ticket in a second browser as `ahmed.hassan@example.com`, change its status there, then change it again in the first window to see the conflict notice and Reload latest.
4. **Requester dashboard** (`jennifer.anderson@example.com`). Read Open Tickets, Waiting for You, and Resolved (Last 30 Days), then open a card to land on My Tickets with the matching chips. Open a Ticket to see its Actions Taken and Status History read-only. Sign in as `michael.brown@example.com` for zero Waiting and Resolved cards, and `emma.watson@example.com` for the empty dashboard with Create Ticket.
5. **Administrator** (`alex.morgan@example.com`). The dashboard adds User Accounts. Each row opens User Management filtered by role. The Ticket Queue and Ticket Detail work exactly as for IT Staff.

## Testing

Server tests and the Playwright suite need the Docker database up and seeded (`pnpm db:up`, then `pnpm prisma:seed` in `server/`).

```bash
pnpm --filter server test   # unit, API/integration, authorization, migration, seed, performance smoke (Vitest + Supertest)
pnpm --filter client test   # unit and UI component tests (Vitest + Testing Library)
```

Add `--reporter=verbose` to either command to list every test by name, as the saved run output in `artifacts/lab-04/test-output/` does.

Tests live by lab: `server/tests/lab-NN/`, `client/tests/lab-NN/`, and `e2e/lab-NN/`. `docs/lab-04/tests.md` maps each test ID to its file and acceptance criteria.

The server suite includes a dashboard evidence check that recomputes every dashboard metric for the seeded accounts with raw SQL and compares it with the API. Run it on its own to print the comparison table:

```bash
pnpm --filter server exec vitest run tests/lab-04/dashboard-metrics-evidence.test.ts
```

### End-to-end and visual/responsive tests (Playwright)

Requires the seeded database (`pnpm prisma:seed`, above); the suite signs in as seeded accounts by email and password. From the repo root, with the server and client already running (`pnpm exec playwright install chromium` once, first time only):

```bash
pnpm e2e
```

This runs every spec under `e2e/`:

- Lab 2 and Lab 3 user flows and screenshot suites (`e2e/lab-02/`, `e2e/lab-03/`). The screenshot suites write to `artifacts/lab-03/screenshots/`.
- Lab 4 flows: Actions Taken (`e2e/lab-04/actions-taken-flow.spec.ts`), the resolution gate and conflicts (`e2e/lab-04/ticket-resolution.spec.ts`), both dashboards with their drill-downs (`e2e/lab-04/dashboards.spec.ts`), keyboard-only use of the dashboard and the Actions Taken form (`e2e/lab-04/accessibility.spec.ts`), and a cross-role regression journey through Lab 2-4 features plus a New York browser time zone check (`e2e/lab-04/regression.spec.ts`).
- The hardening sweep (`e2e/lab-04/hardening.spec.ts`): every major screen for every role at 1440, 768, and 375 px, failing on any console error, unexpected failed request, horizontal page scroll, or serious/critical `@axe-core/playwright` violation, plus a Bangkok-time check with the browser set to New York.

The E2E flows create their own Tickets and remove them afterwards (`pnpm --filter server clean:e2e-fixtures` runs in global setup and teardown). If the server and client aren't already running, Playwright starts them itself (see `playwright.config.ts`). Run one file with `pnpm e2e e2e/lab-04/hardening.spec.ts`.

### Everything, one command

```bash
pnpm test
```

Runs the server suite, the client suite, and the full Playwright suite, in that order, from the repo root.
