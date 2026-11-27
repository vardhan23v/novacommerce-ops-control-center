import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { runWorkflowsFor } from "./workflows";

export const SHIPMENT_STATUSES = ["pending", "shipped", "delayed", "delivered", "cancelled"] as const;

export const eventSchema = z.object({
  event_id: z.string().min(1).max(200),
  type: z.enum(["payment.failed", "shipment.updated", "order.cancelled"]),
  occurred_at: z.string().datetime({ offset: true }),
  order_id: z.string().min(1),
  data: z.object({ status: z.string().min(1) }).passthrough(),
});

export type WebhookResult = { status: "processed" | "duplicate" | "ignored" | "rejected"; detail: string; eventId?: string; executions?: number };

/**
 * Process one incoming event. Idempotent on event_id: the unique insert is the dedupe lock,
 * so concurrent redeliveries can't both apply.
 */
export async function processWebhook(raw: unknown): Promise<WebhookResult> {
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    await audit("webhook", "webhook.receive", "webhook", (raw as { event_id?: string })?.event_id ?? null, "failure", { detail });
    return { status: "rejected", detail };
  }
  const evt = parsed.data;

  try {
    await db.webhookEvent.create({
      data: { eventId: evt.event_id, type: evt.type, orderId: evt.order_id, occurredAt: new Date(evt.occurred_at), payload: raw as Prisma.InputJsonValue, status: "received" },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: "duplicate", detail: `Event ${evt.event_id} was already received; not processed again`, eventId: evt.event_id };
    }
    throw e;
  }

  const order = await db.order.findUnique({ where: { id: evt.order_id }, include: { shipment: true, payment: true } });
  const finish = async (status: "processed" | "ignored" | "failed", detail: string, executions = 0) => {
    await db.webhookEvent.update({ where: { eventId: evt.event_id }, data: { status, detail } });
    await audit("webhook", `webhook.${evt.type}`, "order", evt.order_id, status === "processed" ? "success" : status === "ignored" ? "info" : "failure", {
      eventId: evt.event_id,
      detail,
      executions,
    });
    return { status: status === "failed" ? ("rejected" as const) : status, detail, eventId: evt.event_id, executions };
  };

  if (!order) return finish("ignored", `Unknown order ${evt.order_id}; stored for reference, no state changed`);

  const occurred = new Date(evt.occurred_at);
  let change = "";
  if (evt.type === "shipment.updated") {
    if (!(SHIPMENT_STATUSES as readonly string[]).includes(evt.data.status)) return finish("failed", `Unsupported shipment status '${evt.data.status}'`);
    if (!order.shipment) return finish("ignored", "Order has no shipment record");
    if (order.shipment.updatedAt > occurred) {
      change = `stale event (shipment last updated ${order.shipment.updatedAt.toISOString()}); projection kept`;
    } else {
      await db.shipment.update({ where: { orderId: order.id }, data: { status: evt.data.status, updatedAt: occurred } });
      change = `shipment ${order.shipment.status} → ${evt.data.status}`;
    }
  } else if (evt.type === "payment.failed") {
    if (!order.payment) return finish("ignored", "Order has no payment record");
    await db.payment.update({ where: { orderId: order.id }, data: { status: "failed" } });
    change = `payment ${order.payment.status} → failed`;
  } else {
    await db.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
    change = `order ${order.status} → cancelled`;
  }

  const execs = await runWorkflowsFor({ eventId: evt.event_id, trigger: evt.type, orderId: order.id });
  return finish("processed", change, execs.length);
}
