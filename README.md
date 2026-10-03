# TokTickIT

Full-stack monorepo:

- `client/` — Vite + React + TypeScript, styled with Bootstrap
- `server/` — Express + TypeScript, using Prisma as the ORM (`server/prisma/` holds the schema/models)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+
- [Docker](https://www.docker.com/) (for the local PostgreSQL database)

## Setup

1. Start the database:

   ```bash
   pnpm db:up
   ```

2. Install dependencies:

   ```bash
   cd client && pnpm install && cd ..
   cd server && pnpm install && cd ..
   ```

3. Configure environment variables:

   ```bash
   cp client/.env.example client/.env
   cp server/.env.example server/.env
   ```

   Adjust values if you changed the default Postgres credentials/ports in `docker-compose.yaml`.

4. Apply the Prisma schema to the database and generate the Prisma Client
   (run from `server/`):

   ```bash
   cd server
   pnpm prisma:migrate
   pnpm prisma:generate
   ```

   `prisma:generate` is required on a fresh clone even though `prisma:migrate`
   normally runs it too — pnpm blocks Prisma's install-time build scripts by
   default (you'll see an "Ignored build scripts" notice during `pnpm
   install`), so the client under `server/src/generated/` never gets written
   without this explicit step. Skipping it fails `prisma:seed` and every
   server command after it with a `Cannot find module
   '.../generated/prisma/client.js'` error.

5. Seed reference data, users, Tickets and comments (safe to re-run):

   ```bash
   cd server
   pnpm prisma:seed
   ```

   **Local development only.** Every seeded account (`*@example.com`: four
   active and one inactive Requester, three active and one inactive IT Staff,
   one Administrator) shares the password `DevPass123!`. It is not a secret,
   and it must never be used outside a local database. Passwords are stored
   as bcrypt hashes. Re-running the seed resets these accounts to that state.
   `siriporn.wattana@example.com` is seeded with a mandatory password change.
   Lab 2 Requesters migrated from an older database get the same password and
   the same forced change.

## Running the apps

In separate terminals:

```bash
cd server && pnpm dev   # http://localhost:3001
cd client && pnpm dev   # http://localhost:5173
```

The app opens on the Login screen (`/login`) — sign in with a seeded
account's email and the shared dev password above. A role's default landing
screen follows automatically (Requester -> My Tickets, IT Staff -> Ticket
Queue, Administrator -> User Management); an account with a mandatory
password change is routed to Change Password first. The Lab 1 system check
now lives at `/system-check`.

## Testing

```bash
cd client && pnpm test  # Vitest
cd server && pnpm test  # Vitest + Supertest
```

### End-to-end and visual/responsive tests (Playwright)

Requires the seeded database (`pnpm prisma:seed`, above) — the E2E suite
signs in as seeded accounts by email/password. From the repo root, with the
server and client already running (`pnpm exec playwright install chromium`
once, first time only):

```bash
pnpm e2e
```

This runs the full user-flow suites (`e2e/lab-02/requester-ticket-flow.spec.ts`,
`e2e/lab-03/requester-comments-and-resolved.spec.ts`,
`e2e/lab-03/staff-ticket-flow.spec.ts`, `e2e/lab-03/user-administration.spec.ts`)
and the screenshot/visual-regression suites (`e2e/lab-03/screenshots.spec.ts`,
`e2e/lab-03/staff-and-admin-screenshots.spec.ts`), which write to
`artifacts/lab-03/screenshots/`. If the server/client aren't already
running, Playwright starts them itself (see `playwright.config.ts`).

### Everything, one command

```bash
pnpm test
```

Runs the server suite, the client suite, and the full Playwright suite, in
that order, from the repo root.
