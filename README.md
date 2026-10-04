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

4. Apply the Prisma schema and generate the Prisma Client, from `server/`.

   ```bash
   cd server
   pnpm prisma:migrate
   pnpm prisma:generate
   ```

   Run `prisma:generate` even though `prisma:migrate` normally runs it too. pnpm blocks Prisma's install-time build scripts by default (you'll see an "Ignored build scripts" notice during `pnpm install`), so `server/src/generated/` never gets written without this explicit step. Skip it and `prisma:seed` and every later server command fail with `Cannot find module '.../generated/prisma/client.js'`.

5. Seed reference data, users, tickets, and comments. Safe to re-run.

   ```bash
   cd server
   pnpm prisma:seed
   ```

   Local development only. Every seeded account (`*@example.com`: five active and one inactive Requester, three active and one inactive IT Staff, one Administrator) shares the password `DevPass123!`. Not a secret, never use it outside a local database. Passwords are stored as bcrypt hashes. Re-running the seed resets these accounts to that state. `siriporn.wattana@example.com` is seeded with a mandatory password change, as are Lab 2 Requesters migrated from an older database.

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
