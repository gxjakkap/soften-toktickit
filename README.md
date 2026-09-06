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

5. Seed reference data and the Lab 2 Development Requesters (safe to re-run):

   ```bash
   cd server
   pnpm prisma:seed
   ```

## Running the apps

In separate terminals:

```bash
cd server && pnpm dev   # http://localhost:3001
cd client && pnpm dev   # http://localhost:5173
```

The app opens on the Development Requester Selection screen
(`/select-requester`). Pick a seeded Requester to reach the requester-scoped
screens — this is a Lab 2 testing mechanism, not authentication. The Lab 1
system check now lives at `/system-check`.

## Testing

```bash
cd client && pnpm test  # Vitest
cd server && pnpm test  # Vitest + Supertest
```

### End-to-end and visual/responsive tests (Playwright)

Requires the seeded database (`pnpm prisma:seed`, above) — the E2E suite
logs in as the seeded Development Requesters by name/email. From the repo
root, with the server and client already running (`pnpm exec playwright
install chromium` once, first time only):

```bash
pnpm e2e
```

This runs the full user-flow suite (`e2e/lab-02/requester-ticket-flow.spec.ts`)
and the Section 14 screenshot/visual-regression suite
(`e2e/lab-02/screenshots.spec.ts`), which writes to
`artifacts/lab-02/screenshots/`. If the server/client aren't already
running, Playwright starts them itself (see `playwright.config.ts`).
