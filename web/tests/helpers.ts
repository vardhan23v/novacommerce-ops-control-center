import { spawn, type ChildProcess } from "child_process";
import path from "path";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { runSync } from "@/server/services/sync";
import type { Actor } from "@/server/auth";

const MOCK = path.resolve(__dirname, "../../attachments/mock_services.py");
let proc: ChildProcess | null = null;

/** Start a fresh copy of the supplied mock service (its state is in memory, so this resets it). */
export async function startMock() {
  await stopMock();
  proc = spawn("python3", [MOCK], { env: { ...process.env, MOCK_PORT: "8799" }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch("http://127.0.0.1:8799/health");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("mock did not start");
}

export async function stopMock() {
  if (!proc) return;
  const p = proc;
  proc = null;
  await new Promise<void>((resolve) => {
    p.once("exit", () => resolve());
    p.kill();
  });
}

export async function resetDb() {
  const tables = ["AuditLog", "IntegrationCall", "SyncRun", "WebhookEvent", "WorkflowExecution", "Workflow", "Operation", "SupportTicket", "Approval", "Refund", "Shipment", "Payment", "Order", "Customer", "Session", "User"];
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

export const users: Record<"manager" | "operator" | "viewer", Actor> = {} as never;

export async function freshWorld() {
  await startMock();
  await resetDb();
  const hash = await bcrypt.hash("pw", 4);
  for (const role of ["manager", "operator", "viewer"] as const) {
    const u = await db.user.create({ data: { email: `${role}@t.test`, name: `${role} user`, role, passwordHash: hash } });
    users[role] = { id: u.id, name: u.name, email: u.email, role };
  }
  await runSync(null, "seed");
}

export async function expectRejects(p: Promise<unknown>, status: number) {
  try {
    await p;
  } catch (e) {
    const s = (e as { status?: number }).status;
    if (s !== status) throw new Error(`expected ${status}, got ${s}: ${(e as Error).message}`);
    return e as Error;
  }
  throw new Error(`expected rejection with ${status}, but it resolved`);
}
