import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { authorize, systemActor, type Actor } from "../auth";
import { notFound } from "../errors";
import { createTicket } from "./tickets";
import { requestRefund } from "./refunds";
import { refundableMinor } from "./orders";

export const TRIGGERS = ["payment.failed", "shipment.updated", "order.cancelled"] as const;
export const FIELDS = ["order.amount_minor", "order.status", "payment.status", "shipment.status", "order.channel"] as const;
export const OPS = ["eq", "neq", "gt", "gte", "lt", "lte"] as const;

export const conditionSchema = z.object({
  field: z.enum(FIELDS),
  op: z.enum(OPS),
  value: z.union([z.string().min(1), z.number().int()]),
});

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_ticket"), reason: z.string().min(1).max(500) }),
  z.object({
    type: z.literal("request_refund"),
    amount: z.union([z.literal("full"), z.number().int().positive()]), // paise or remaining refundable
    reason: z.string().max(500).optional(),
  }),
]);

export const workflowSchema = z.object({
  name: z.string().min(1).max(120),
  trigger: z.enum(TRIGGERS),
  conditions: z.array(conditionSchema).min(1, "At least one condition is required"),
  action: actionSchema,
  enabled: z.boolean().default(true),
});

export type WorkflowInput = z.infer<typeof workflowSchema>;
export type Condition = z.infer<typeof conditionSchema>;

export async function listWorkflows() {
  const wfs = await db.workflow.findMany({ orderBy: { createdAt: "desc" } });
  const stats = await db.workflowExecution.groupBy({ by: ["workflowId", "status"], _count: true });
  return wfs.map((w) => ({
    ...w,
    stats: Object.fromEntries(stats.filter((s) => s.workflowId === w.id).map((s) => [s.status, s._count])),
  }));
}

export async function createWorkflow(actor: Actor, input: WorkflowInput) {
  await authorize(actor, "workflow.manage", "workflow");
  const w = await db.workflow.create({
    data: { ...input, conditions: input.conditions as Prisma.InputJsonValue, action: input.action as Prisma.InputJsonValue, createdBy: actor.name },
  });
  await audit(actor, "workflow.create", "workflow", w.id, "success", { name: w.name, trigger: w.trigger });
  return w;
}

export async function updateWorkflow(actor: Actor, id: string, input: Partial<WorkflowInput>) {
  await authorize(actor, "workflow.manage", "workflow", id);
  if (!(await db.workflow.findUnique({ where: { id } }))) throw notFound("Workflow not found");
  const w = await db.workflow.update({
    where: { id },
    data: {
      ...input,
      conditions: input.conditions as Prisma.InputJsonValue | undefined,
      action: input.action as Prisma.InputJsonValue | undefined,
    },
  });
  const what = Object.keys(input).length === 1 && "enabled" in input ? (input.enabled ? "workflow.enable" : "workflow.disable") : "workflow.update";
  await audit(actor, what, "workflow", id, "success", { changes: Object.keys(input) });
  return w;
}

type Ctx = { order: { amount_minor: number; status: string; channel: string }; payment: { status: string | null }; shipment: { status: string | null } };

export function evaluate(conditions: Condition[], ctx: Ctx): { pass: boolean; failed: string[] } {
  const failed: string[] = [];
  for (const c of conditions) {
    const [scope, key] = c.field.split(".") as [keyof Ctx, string];
    const actual = (ctx[scope] as Record<string, unknown>)[key];
    const v = c.value;
    let ok: boolean;
    switch (c.op) {
      case "eq": ok = String(actual) === String(v); break;
      case "neq": ok = String(actual) !== String(v); break;
      case "gt": ok = typeof actual === "number" && actual > Number(v); break;
      case "gte": ok = typeof actual === "number" && actual >= Number(v); break;
      case "lt": ok = typeof actual === "number" && actual < Number(v); break;
      case "lte": ok = typeof actual === "number" && actual <= Number(v); break;
    }
    if (!ok) failed.push(`${c.field} ${c.op} ${v} (actual: ${actual ?? "none"})`);
  }
  return { pass: failed.length === 0, failed };
}

/**
 * Run every enabled workflow for a trigger against the *current* local data for the order.
 * (workflowId, eventId) is unique, so a redelivered event can never execute a workflow twice.
 */
export async function runWorkflowsFor(evt: { eventId: string; trigger: (typeof TRIGGERS)[number]; orderId: string }) {
  const workflows = await db.workflow.findMany({ where: { trigger: evt.trigger, enabled: true } });
  const out: { id: string; status: string }[] = [];
  for (const wf of workflows) {
    // Claim the (workflow, event) slot first.
    let exec;
    try {
      exec = await db.workflowExecution.create({ data: { workflowId: wf.id, eventId: evt.eventId, orderId: evt.orderId, status: "running" } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // already executed
      throw e;
    }
    const finish = async (status: "succeeded" | "failed" | "skipped", detail: string) => {
      const r = await db.workflowExecution.update({ where: { id: exec.id }, data: { status, detail } });
      await audit(`workflow:${wf.name}`, "workflow.execute", "order", evt.orderId, status === "failed" ? "failure" : status === "succeeded" ? "success" : "info", {
        workflowId: wf.id,
        eventId: evt.eventId,
        status,
        detail,
      });
      out.push(r);
    };

    const order = await db.order.findUnique({ where: { id: evt.orderId }, include: { payment: true, shipment: true, refunds: true } });
    if (!order) {
      await finish("failed", `Order ${evt.orderId} is not in the local database`);
      continue;
    }
    const ctx: Ctx = {
      order: { amount_minor: order.amountMinor, status: order.status, channel: order.channel },
      payment: { status: order.payment?.status ?? null },
      shipment: { status: order.shipment?.status ?? null },
    };
    const res = evaluate(wf.conditions as Condition[], ctx);
    if (!res.pass) {
      await finish("skipped", `Conditions not met: ${res.failed.join("; ")}`);
      continue;
    }
    const action = actionSchema.safeParse(wf.action);
    if (!action.success) {
      await finish("failed", "Workflow action configuration is invalid");
      continue;
    }
    const actor = systemActor(`workflow:${wf.name}`);
    try {
      if (action.data.type === "create_ticket") {
        const t = await createTicket(actor, order.id, action.data.reason, "workflow");
        await finish("succeeded", `Support ticket ${t.externalId} created`);
      } else {
        const amount = action.data.amount === "full" ? refundableMinor(order) : action.data.amount;
        const r = await requestRefund(actor, { orderId: order.id, amountMinor: amount, reason: action.data.reason ?? `Automated by ${wf.name}` }, "workflow");
        await finish("succeeded", `Refund of ${amount} paise requested; awaiting manager approval (${r.approval?.id})`);
      }
    } catch (e) {
      await finish("failed", (e as Error).message);
    }
  }
  return out;
}

export async function listExecutions(limit = 100) {
  return db.workflowExecution.findMany({ include: { workflow: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: limit });
}
