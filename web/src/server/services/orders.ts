import { Prisma } from "@prisma/client";
import { db } from "../db";
import { api } from "../integrations/client";
import { audit } from "../audit";
import { authorize, type Actor } from "../auth";
import { conflict, notFound, upstream } from "../errors";

export type OrderQuery = {
  q?: string;
  status?: string;
  payment?: string;
  shipment?: string;
  page?: number;
  pageSize?: number;
  sort?: "createdAt" | "amountMinor" | "id";
  dir?: "asc" | "desc";
};

export async function listOrders(query: OrderQuery) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  const where: Prisma.OrderWhereInput = {};
  if (query.q) {
    const q = query.q.trim();
    where.OR = [
      { id: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { customerId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (query.status) where.status = query.status;
  if (query.payment) where.payment = { status: query.payment };
  if (query.shipment) where.shipment = { status: query.shipment };
  const sort = query.sort ?? "createdAt";
  const [total, items] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      include: { customer: true, payment: true, shipment: true },
      orderBy: { [sort]: query.dir ?? "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getOrder(id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      payment: true,
      shipment: true,
      refunds: { include: { approval: true }, orderBy: { createdAt: "desc" } },
      tickets: { orderBy: { createdAt: "desc" } },
      operations: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) throw notFound(`Order ${id} not found`);
  const audits = await db.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" }, take: 50 });
  const executions = await db.workflowExecution.findMany({ where: { orderId: id }, include: { workflow: true }, orderBy: { createdAt: "desc" }, take: 20 });
  return { ...order, audits, executions, eligibility: eligibility(order) };
}

type OrderWithRel = Prisma.OrderGetPayload<{ include: { payment: true; shipment: true; refunds: true } }>;

export function cancelBlockReason(order: { status: string; shipment: { status: string } | null }): string | null {
  if (order.status === "cancelled") return "Order is already cancelled";
  if (["shipped", "delivered"].includes(order.status)) return `Order is ${order.status} and can no longer be cancelled`;
  if (order.shipment && ["shipped", "delayed", "delivered"].includes(order.shipment.status))
    return `Shipment is ${order.shipment.status}; the carrier already has the parcel`;
  return null;
}

export function refundableMinor(order: OrderWithRel) {
  const captured = order.payment?.status === "captured" ? order.payment.amountMinor : 0;
  const committed = order.refunds
    .filter((r) => !["failed", "rejected"].includes(r.status))
    .reduce((s, r) => s + r.amountMinor, 0);
  return Math.max(0, captured - committed);
}

export function refundBlockReason(order: OrderWithRel): string | null {
  if (!order.payment) return "No payment on record";
  if (order.payment.status !== "captured") return `Payment is ${order.payment.status}, not captured`;
  if (!["cancelled", "delivered"].includes(order.status)) return `Order is ${order.status}; refunds need a cancelled or delivered order`;
  if (refundableMinor(order) <= 0) return "The captured amount is already fully refunded or reserved by pending refunds";
  return null;
}

function eligibility(order: OrderWithRel) {
  return {
    cancel: cancelBlockReason(order),
    refund: refundBlockReason(order),
    refundableMinor: refundableMinor(order),
  };
}

/**
 * Cancel through the Commerce API. Local state changes only when Commerce confirms (HTTP 200).
 */
export async function cancelOrder(actor: Actor, orderId: string, reason?: string) {
  await authorize(actor, "order.cancel", "order", orderId);
  const order = await db.order.findUnique({ where: { id: orderId }, include: { shipment: true } });
  if (!order) throw notFound(`Order ${orderId} not found`);

  const blocked = cancelBlockReason(order);
  if (blocked) {
    await db.operation.create({ data: { orderId, type: "cancel", status: "rejected", detail: blocked, actor: actor.name } });
    await audit(actor, "order.cancel", "order", orderId, "failure", { reason: blocked, stage: "local_rules" });
    throw conflict(blocked);
  }

  const res = await api.cancelOrder(orderId);
  if (!res.ok) {
    const definitive = res.status !== null && res.status < 500;
    const detail = `Commerce API ${res.status ?? "unreachable"}: ${res.error}`;
    await db.operation.create({ data: { orderId, type: "cancel", status: definitive ? "rejected" : "failed", detail, actor: actor.name } });
    await audit(actor, "order.cancel", "order", orderId, "failure", { upstreamStatus: res.status, error: res.error });
    if (res.status === 409) throw conflict(`Commerce rejected the cancellation: ${res.error}`);
    if (res.status === 404) throw notFound(`Commerce does not know order ${orderId}`);
    throw upstream(`Cancellation not confirmed by Commerce (${res.error}). The order was left unchanged; retry later.`);
  }

  const updated = await db.order.update({ where: { id: orderId }, data: { status: res.data.status, syncedAt: new Date() } });
  await db.operation.create({
    data: { orderId, type: "cancel", status: "succeeded", detail: reason ? `Reason: ${reason}` : null, actor: actor.name },
  });
  await audit(actor, "order.cancel", "order", orderId, "success", { reason, newStatus: res.data.status });
  // A confirmed cancellation is an order.cancelled event for workflows
  const { runWorkflowsFor } = await import("./workflows");
  await runWorkflowsFor({ eventId: `local-cancel-${orderId}-${Date.now()}`, trigger: "order.cancelled", orderId });
  return updated;
}
