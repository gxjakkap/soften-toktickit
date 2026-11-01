-- Rollback for migration 20261007101745_actions_taken_workflow
-- (Lab 4 specification.md §7.5 step 3).
--
-- Returns the database to the Lab 3 schema. Lab 1-3 rows and columns are not
-- touched. Every Action Taken and status history entry recorded after the
-- migration is lost by design, so take a pg_dump first if they matter
-- (README.md "Rollback and recovery").
--
-- Run from the repository root:
--   docker compose exec -T postgres psql -U postgres -d toktickit -v ON_ERROR_STOP=1 \
--     < server/prisma/rollback/20261007101745_actions_taken_workflow.down.sql

BEGIN;

DROP TABLE "TicketStatusHistory";
DROP TABLE "ActionTaken";
DROP TYPE "ActionStatus";

DROP INDEX "Ticket_currentStatus_ownerId_idx";
DROP INDEX "Ticket_currentStatus_itPriority_idx";
DROP INDEX "Ticket_resolvedAt_idx";
DROP INDEX "Ticket_requesterId_currentStatus_idx";
DROP INDEX "Ticket_updatedAt_idx";

ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_version_check";
ALTER TABLE "Ticket" DROP COLUMN "resolvedAt";
ALTER TABLE "Ticket" DROP COLUMN "version";

DELETE FROM "_prisma_migrations" WHERE migration_name = '20261007101745_actions_taken_workflow';

COMMIT;
