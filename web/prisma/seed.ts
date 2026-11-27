/**
 * Idempotent seed: demo users + two example workflows (only if missing), then an initial
 * import from the mock services. Re-running never overwrites existing users or workflows.
 */
import bcrypt from "bcryptjs";
import { PrismaClient, type Role } from "@prisma/client";
import { runSync } from "../src/server/services/sync";

const db = new PrismaClient();
const USERS: { email: string; name: string; role: Role }[] = [
  { email: "manager@nova.test", name: "Maya Manager", role: "manager" },
  { email: "operator@nova.test", name: "Omar Operator", role: "operator" },
  { email: "viewer@nova.test", name: "Vik Viewer", role: "viewer" },
];
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "nova-demo-2026";

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of USERS) {
    await db.user.upsert({ where: { email: u.email }, create: { ...u, passwordHash: hash }, update: {} });
  }
  if ((await db.workflow.count()) === 0) {
    await db.workflow.createMany({
      data: [
        {
          name: "Delayed high-value shipment → ticket",
          trigger: "shipment.updated",
          conditions: [
            { field: "shipment.status", op: "eq", value: "delayed" },
            { field: "order.amount_minor", op: "gt", value: 500000 },
          ],
          action: { type: "create_ticket", reason: "Shipment delayed on an order above ₹5,000 — contact customer" },
          createdBy: "seed",
        },
        {
          name: "Payment failure → ticket",
          trigger: "payment.failed",
          conditions: [{ field: "payment.status", op: "eq", value: "failed" }],
          action: { type: "create_ticket", reason: "Payment failed — follow up with customer for an alternate payment method" },
          createdBy: "seed",
        },
        {
          name: "Cancelled order with captured payment → full refund request",
          trigger: "order.cancelled",
          conditions: [{ field: "payment.status", op: "eq", value: "captured" }],
          action: { type: "request_refund", amount: "full", reason: "Automatic refund request on cancellation" },
          enabled: false,
          createdBy: "seed",
        },
      ],
    });
  }
  if (process.env.SKIP_SYNC !== "1") {
    const run = await runSync(null, "seed");
    console.log("Initial sync:", run.status, JSON.stringify(run.results));
  }
  console.log(`Seeded users (password: ${process.env.DEMO_PASSWORD ? "from DEMO_PASSWORD" : DEMO_PASSWORD}).`);
}

main().finally(() => db.$disconnect());
