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

4. Apply the Prisma schema to the database (run from `server/`):

   ```bash
   cd server
   pnpm prisma:migrate
   ```

## Running the apps

In separate terminals:

```bash
cd server && pnpm dev   # http://localhost:3001
cd client && pnpm dev   # http://localhost:5173
```

## Testing

```bash
cd client && pnpm test  # Vitest
cd server && pnpm test  # Vitest + Supertest
```
