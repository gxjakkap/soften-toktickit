-- Lab 3 (specification.md §8.3): RequesterUser becomes User in place, so every
-- existing Ticket.requesterId stays valid and no Ticket/Attachment row moves.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- TicketStatus: PENDING keeps its meaning under the new name; REOPENED is
-- inserted before CANCELLED so the enum sort order matches schema.prisma.
ALTER TYPE "TicketStatus" RENAME VALUE 'PENDING' TO 'WAITING_FOR_REQUESTER';
ALTER TYPE "TicketStatus" ADD VALUE 'REOPENED' BEFORE 'CANCELLED';

-- RequesterUser -> User (rename table, key, index and id sequence).
ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "RequesterUser_id_seq" RENAME TO "User_id_seq";

-- New User columns: add nullable, backfill, then tighten.
ALTER TABLE "User"
    ADD COLUMN "passwordHash" TEXT,
    ADD COLUMN "role" "UserRole",
    ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Every Lab 2 Requester becomes a REQUESTER who must change the shared local-dev
-- password on first login. The hash is bcrypt (cost 10) of the documented
-- local-dev password `DevPass123!`; it is not a secret.
UPDATE "User"
SET "role" = 'REQUESTER',
    "passwordHash" = '$2b$10$OnhuAW1Hjm8tKYGFKKYz2uEfEwWd8i/ciCw7yWj1LJnUX/veshRVK',
    "mustChangePassword" = true,
    "email" = lower("email");

ALTER TABLE "User"
    ALTER COLUMN "passwordHash" SET NOT NULL,
    ALTER COLUMN "role" SET NOT NULL,
    ALTER COLUMN "updatedAt" DROP DEFAULT;

-- BR-15: emails are stored lower-case, which makes the unique index case-insensitive.
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" = lower("email"));

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- Ticket: Owner, IT Priority (defaults to Requested Priority, BR-21), resolved signal.
ALTER TABLE "Ticket"
    ADD COLUMN "ownerId" INTEGER,
    ADD COLUMN "itPriority" "RequestedPriority",
    ADD COLUMN "requesterConfirmedResolvedAt" TIMESTAMP(3);

UPDATE "Ticket" SET "itPriority" = "requestedPriority";

ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");

-- CreateIndex
CREATE INDEX "Ticket_itPriority_idx" ON "Ticket"("itPriority");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "visibility" "CommentVisibility" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_idx" ON "TicketComment"("ticketId");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_visibility_idx" ON "TicketComment"("ticketId", "visibility");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
