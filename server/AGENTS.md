# server

Express 5 + Prisma 7 (`@prisma/adapter-pg`) on Postgres. ESM under `NodeNext`, so relative imports end in `.js` (`'./lib/ticket-number.js'`) and the Prisma client comes from `./generated/prisma/client.js`.

## Routes

`src/app.ts` holds every route, each headed by a comment naming its `api-spec.md` section and IDs. Resolve the caller through `resolveActiveRequester(req)` from `lib/requester-context.ts`; handlers never read `requesterId` themselves. New routes follow the same shape.

Errors are `{ error: { code, message, field? } }`. A resource the caller does not own returns the same 404 as one that does not exist (BR-15), so ids cannot be enumerated.

## Data

- Schema changes go through `pnpm prisma:migrate`; commit the generated migration files.
- `prisma/seed.ts` is idempotent and tested as such (`seed-idempotency.integration.test.ts`); keep every insert an upsert or existence check.
- `ticketNumber` derives from the row id (BR-06), so `POST /api/tickets` inserts a `PENDING-<uuid>` placeholder and rewrites it inside the same transaction.
- Counts that gate an insert (the 5-attachment cap) run in a `Serializable` transaction wrapped in `withSerializableRetry`. Postgres can raise write conflicts between transactions that never raced, and the wrapper retries them.
- Uploads land in `server/uploads/` under a random UUID name; the original name is a display column only.

## Tests

Vitest + Supertest against the real database, with no per-test isolation. Two habits keep files from colliding:

- `vitest.config.ts` sets `fileParallelism: false`; leave it.
- Each file creates its fixtures under a unique `TAG` string in `beforeAll` and removes them in `afterAll`, children before parents (attachments, tickets, then users, categories, systems).
