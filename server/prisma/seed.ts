import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const categories = ["Account and Access", "Hardware", "Software", "Network"];

// Related Systems (specification.md §7.4).
const relatedSystems = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

// Lab 2 Development Requesters (specification.md §7.4): 4 active + 1 inactive.
// The inactive one must never reach the selection dropdown (BR-09/AC-22).
const requesters = [
  { name: "Jennifer Anderson", email: "jennifer.anderson@example.com", isActive: true },
  { name: "Michael Brown", email: "michael.brown@example.com", isActive: true },
  { name: "Siriporn Wattana", email: "siriporn.wattana@example.com", isActive: true },
  { name: "David Chen", email: "david.chen@example.com", isActive: true },
  { name: "Patricia Reyes", email: "patricia.reyes@example.com", isActive: false },
];

const STATUS_CYCLE = ["NEW", "OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED", "CANCELLED"] as const;
const PRIORITY_CYCLE = ["LOW", "MEDIUM", "HIGH"] as const;

// specification.md §7.4: a spread of seeded Tickets per active Requester —
// enough for one Requester to exceed a page (pagination demo), one
// Requester with zero Tickets (empty-state demo), and status/priority
// variety (filter/sort/badge demo). Keyed on ticketNumber so reruns upsert
// instead of duplicating; the "SEED" marker keeps these apart from any
// TKT-<year>-<id> row the app itself generates.
function ticketSpecs(requesterEmail: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ticketNumber: `TKT-SEED-${requesterEmail.split("@")[0]}-${String(i + 1).padStart(3, "0")}`,
    requesterEmail,
    categoryIndex: i % categories.length,
    relatedSystemIndex: i % relatedSystems.length,
    requestedPriority: PRIORITY_CYCLE[i % PRIORITY_CYCLE.length],
    currentStatus: STATUS_CYCLE[i % STATUS_CYCLE.length],
    summary: `Sample issue #${i + 1} for seed demo purposes`,
    description: `This is seeded demo Ticket #${i + 1}, included for filter, sort, and pagination demonstration.`,
    createdAt: new Date(Date.now() - (count - i) * 24 * 60 * 60 * 1000),
  }));
}

const ticketSeeds = [
  ...ticketSpecs("jennifer.anderson@example.com", 14), // exceeds page 1 at the default page size of 10
  ...ticketSpecs("michael.brown@example.com", 3),
  ...ticketSpecs("david.chen@example.com", 5),
  // siriporn.wattana@example.com deliberately gets zero Tickets (empty-state demo).
];

async function main() {
  // Re-runnable and convergent: isActive is re-applied so a row deactivated
  // by hand returns to the seeded state, matching the requester loop below.
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: { isActive: true },
      create: { name },
    });
  }

  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: { isActive: true },
      create: { name },
    });
  }

  // Re-runnable: keyed on the unique email, and isActive is re-applied so an
  // edited seed row converges instead of drifting.
  for (const requester of requesters) {
    await prisma.requesterUser.upsert({
      where: { email: requester.email },
      update: { name: requester.name, isActive: requester.isActive },
      create: requester,
    });
  }

  const categoryRows = await prisma.category.findMany({ where: { name: { in: categories } } });
  const relatedSystemRows = await prisma.relatedSystem.findMany({ where: { name: { in: relatedSystems } } });
  const requesterRows = await prisma.requesterUser.findMany({
    where: { email: { in: ticketSeeds.map((t) => t.requesterEmail) } },
  });

  for (const spec of ticketSeeds) {
    const requester = requesterRows.find((r) => r.email === spec.requesterEmail);
    const category = categoryRows[spec.categoryIndex];
    const relatedSystem = relatedSystemRows[spec.relatedSystemIndex];
    if (!requester || !category || !relatedSystem) continue;

    await prisma.ticket.upsert({
      where: { ticketNumber: spec.ticketNumber },
      update: {
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        requestedPriority: spec.requestedPriority,
        currentStatus: spec.currentStatus,
        summary: spec.summary,
        description: spec.description,
      },
      create: {
        ticketNumber: spec.ticketNumber,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        requestedPriority: spec.requestedPriority,
        currentStatus: spec.currentStatus,
        summary: spec.summary,
        description: spec.description,
        createdAt: spec.createdAt,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
