-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "resolvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "performedById" INTEGER NOT NULL,
    "assignedToId" INTEGER NOT NULL,
    "actionAt" TIMESTAMPTZ(3) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "result" VARCHAR(2000),
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" VARCHAR(1000),
    "attachmentNotes" VARCHAR(500),
    "clientRequestId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatusHistory" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "fromStatus" "TicketStatus",
    "toStatus" "TicketStatus" NOT NULL,
    "changedById" INTEGER NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "id");

-- CreateIndex
CREATE INDEX "ActionTaken_assignedToId_status_idx" ON "ActionTaken"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_status_followUpRequired_idx" ON "ActionTaken"("ticketId", "status", "followUpRequired");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTaken_performedById_clientRequestId_key" ON "ActionTaken"("performedById", "clientRequestId");

-- CreateIndex
CREATE INDEX "TicketStatusHistory_ticketId_changedAt_id_idx" ON "TicketStatusHistory"("ticketId", "changedAt", "id");

-- CreateIndex
CREATE INDEX "Ticket_currentStatus_ownerId_idx" ON "Ticket"("currentStatus", "ownerId");

-- CreateIndex
CREATE INDEX "Ticket_currentStatus_itPriority_idx" ON "Ticket"("currentStatus", "itPriority");

-- CreateIndex
CREATE INDEX "Ticket_resolvedAt_idx" ON "Ticket"("resolvedAt");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_currentStatus_idx" ON "Ticket"("requesterId", "currentStatus");

-- CreateIndex
CREATE INDEX "Ticket_updatedAt_idx" ON "Ticket"("updatedAt");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusHistory" ADD CONSTRAINT "TicketStatusHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketStatusHistory" ADD CONSTRAINT "TicketStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lab 4 specification.md §7.4 step 3: backfill resolvedAt for Tickets that
-- are already Resolved or Closed. Lab 3 never stored the resolution time, so
-- updatedAt (the latest workflow write) is the closest available upper bound
-- (§11-9). "updatedAt" is timestamp(3) holding UTC wall-clock values, so it is
-- read explicitly as UTC; a plain assignment would shift it by the session
-- TimeZone. Every other Ticket keeps resolvedAt NULL.
UPDATE "Ticket"
SET "resolvedAt" = "updatedAt" AT TIME ZONE 'UTC'
WHERE "currentStatus" IN ('RESOLVED', 'CLOSED');

-- §7.4 step 5: no status history backfill. Legacy Tickets start with an empty
-- history; inventing entries would put fabricated rows in an append-only log.

-- §7.2 CHECK constraints (Prisma cannot express them).
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_followUpNote_check"
  CHECK ("followUpRequired" = false OR ("followUpNote" IS NOT NULL AND length(btrim("followUpNote")) > 0));
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_doneResult_check"
  CHECK ("status" <> 'DONE' OR ("result" IS NOT NULL AND length(btrim("result")) > 0));
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_description_check"
  CHECK (length(btrim("description")) > 0);
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_version_check" CHECK ("version" >= 1);
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_version_check" CHECK ("version" >= 1);
