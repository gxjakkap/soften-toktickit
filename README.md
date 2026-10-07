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

2. Install dependencies.

   ```bash
   cd client && pnpm install && cd ..
   cd server && pnpm install && cd ..
   ```

3. Configure environment variables.

   ```bash
   cp client/.env.example client/.env
   cp server/.env.example server/.env
   ```

   Adjust values if you changed the default Postgres credentials or ports in `docker-compose.yaml`.

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

   Seed dates are relative to the current Asia/Bangkok day, so "today" and "last 30 days" stay meaningful. Re-run the seed on a later day to move them forward. Accounts that demonstrate dashboard values:

   - `emma.watson@example.com`: a Requester with no Tickets (the Requester Dashboard empty state).
   - `michael.brown@example.com`: a Requester with open Tickets but nothing waiting and nothing resolved (Waiting for You and Resolved (Last 30 Days) are 0).
   - `nattapong.srisuk@example.com`: IT Staff who owns active Tickets but has no open Actions assigned (My Open Actions is 0).
   - `alex.morgan@example.com`: the Administrator, who owns an active Ticket and has an open Action assigned.
   - `linda.park@example.com` (inactive) is the assignee of an open Action, to show how an inactive assignee is displayed.

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

The app opens on the login screen (`/login`). Sign in with a seeded account's email and the shared dev password above. Each role lands on its default screen automatically: Requester on My Tickets, IT Staff on Ticket Queue, Administrator on User Management. An account with a mandatory password change goes to Change Password first. The Lab 1 system check lives at `/system-check`.

## Testing

```bash
cd client && pnpm test  # Vitest
cd server && pnpm test  # Vitest + Supertest
```

### End-to-end and visual/responsive tests (Playwright)

Requires the seeded database (`pnpm prisma:seed`, above); the suite signs in as seeded accounts by email and password. From the repo root, with the server and client already running (`pnpm exec playwright install chromium` once, first time only):

```bash
pnpm e2e
```

This runs the user-flow suites (`e2e/lab-02/requester-ticket-flow.spec.ts`, `e2e/lab-03/authentication.spec.ts`, `e2e/lab-03/requester-comments-and-resolved.spec.ts`, `e2e/lab-03/staff-ticket-flow.spec.ts`, `e2e/lab-03/user-administration.spec.ts`) and the screenshot/visual-regression suites (`e2e/lab-03/screenshots.spec.ts`, `e2e/lab-03/staff-and-admin-screenshots.spec.ts`), which write to `artifacts/lab-03/screenshots/`. If the server and client aren't already running, Playwright starts them itself (see `playwright.config.ts`).

### Everything, one command

```bash
pnpm test
```

Runs the server suite, the client suite, and the full Playwright suite, in that order, from the repo root.
