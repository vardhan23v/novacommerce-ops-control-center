import { Prisma } from "@prisma/client";
import { db } from "./db";
import type { Actor } from "./auth";

export type Outcome = "success" | "failure" | "denied" | "info";

export async function audit(
  actor: Actor | string,
  action: string,
  entity: string,
  entityId: string | null,
  outcome: Outcome,
  details?: Record<string, unknown>,
) {
  const a = typeof actor === "string" ? { name: actor, role: null } : { name: actor.name, role: actor.role };
  await db.auditLog.create({
    data: {
      actor: a.name,
      actorRole: a.role,
      action,
      entity,
      entityId,
      outcome,
      details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
