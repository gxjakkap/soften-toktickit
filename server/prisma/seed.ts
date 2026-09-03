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
