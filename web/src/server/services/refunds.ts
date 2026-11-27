import { db } from "../db";
import { api } from "../integrations/client";
import { audit } from "../audit";
import { authorize, type Actor } from "../auth";
import { badRequest, conflict, notFound } from "../errors";
import { refundBlockReason, refundableMinor } from "./orders";

/**
 * Step 1: request. Validates eligibility locally, creates Refund(pending_approval) + Approval(pending).
 * Never calls the Payment API.
 */
export async function requestRefund(
  actor: Actor,
  input: { orderId: string; amountMinor: number; reason?: string },
  source: "manual" | "workflow" | "assistant" = "manual",
) {
  await authorize(actor, "refund.request", "order", input.orderId);
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw badRequest("Refund amount must be a positive whole number of paise");

  // Serializable transaction so two concurrent requests can't both reserve the same captured amount.
  const result = await db.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { payment: true, shipment: true, refunds: true } });
      if (!order) throw notFound(`Order ${input.orderId} not found`);
      const blocked = refundBlockReason(order);
      if (blocked) throw conflict(blocked);
      const available = refundableMinor(order);
      if (input.amountMinor > available)
        throw conflict(`Requested ${input.amountMinor} paise exceeds the refundable ${available} paise`, { availableMinor: available });
      const refund = await tx.refund.create({
        data: {
          orderId: order.id,
          amountMinor: input.amountMinor,
          status: "pending_approval",
          reason: input.reason,
          requestedById: actor.id === "system" ? null : actor.id,
          requestedBy: actor.name,
          source,
          approval: { create: { status: "pending" } },
        },
        include: { approval: true },
      });
      return refund;
    },
    { isolationLevel: "Serializable" },
  ).catch(async (e) => {
    await audit(actor, "refund.request", "order", input.orderId, "failure", { amountMinor: input.amountMinor, error: (e as Error).message });
    throw e;
  });

  await audit(actor, "refund.request", "order", input.orderId, "success", {
    refundId: result.id,
    approvalId: result.approval?.id,
    amountMinor: input.amountMinor,
    source,
  });
  return result;
}

export async function listApprovals(status?: string) {
  return db.approval.findMany({
    where: status ? { status } : undefined,
    include: { refund: { include: { order: { include: { customer: true, payment: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/**
 * Step 2: decision. Only managers. The pending->approved transition is a conditional update so
 * double clicks / concurrent managers execute the refund at most once.
 */
export async function decideApproval(actor: Actor, approvalId: string, decision: "approve" | "reject", note?: string) {
  await authorize(actor, "refund.approve", "approval", approvalId);
  const approval = await db.approval.findUnique({ where: { id: approvalId }, include: { refund: true } });
  if (!approval) throw notFound("Approval not found");

  const claimed = await db.approval.updateMany({
    where: { id: approvalId, status: "pending" },
    data: { status: decision === "approve" ? "approved" : "rejected", decidedById: actor.id, decidedBy: actor.name, decidedAt: new Date(), decisionNote: note },
  });
  if (claimed.count !== 1) throw conflict(`Approval already ${approval.status}`);

  const refundId = approval.refundId;
  const orderId = approval.refund.orderId;

  if (decision === "reject") {
    await db.refund.update({ where: { id: refundId }, data: { status: "rejected" } });
    await audit(actor, "refund.reject", "order", orderId, "success", { refundId, approvalId, note });
    return db.refund.findUnique({ where: { id: refundId }, include: { approval: true } });
  }

  await audit(actor, "refund.approve", "order", orderId, "success", { refundId, approvalId, note });
  return executeRefund(actor, refundId);
}

/** Step 3: execution against the Payment API. The refund *status in the body* decides the outcome. */
async function executeRefund(actor: Actor, refundId: string) {
  const refund = await db.refund.update({ where: { id: refundId }, data: { status: "executing" } });
  const res = await api.createRefund(refund.orderId, refund.amountMinor);

  let status: string;
  let error: string | null = null;
  let externalId: string | null = null;

  if (res.ok) {
    externalId = res.data.id;
    if (res.data.status === "succeeded") status = "succeeded";
    else {
      status = "failed";
      error = `Payment API returned refund ${res.data.id} with status '${res.data.status}'`;
    }
  } else if (res.status !== null && res.status < 500) {
    status = "failed"; // definitive rejection (400/404/409): no money moved
    error = `Payment API ${res.status}: ${res.error}`;
  } else {
    // Timeout / 5xx: we don't know if the refund was created upstream. Do NOT retry blindly
    // (could pay twice). Mark unconfirmed; sync reconciles against GET /payments/refunds.
    status = "unconfirmed";
    error = `Payment API did not confirm (${res.error}). Will reconcile on next sync.`;
  }

  const updated = await db.refund.update({
    where: { id: refundId },
    data: { status, error, externalId, executedAt: new Date() },
    include: { approval: true },
  });
  await audit(actor, "refund.execute", "order", refund.orderId, status === "succeeded" ? "success" : "failure", {
    refundId,
    externalId,
    amountMinor: refund.amountMinor,
    status,
    error,
  });
  return updated;
}

/** Link 'unconfirmed' refunds to upstream refunds created for the same order and amount. */
export async function reconcileUnconfirmed() {
  const pending = await db.refund.findMany({ where: { status: "unconfirmed" } });
  if (!pending.length) return 0;
  const up = await api.refunds();
  if (!up.ok) return 0;
  let n = 0;
  for (const r of pending) {
    const linked = new Set((await db.refund.findMany({ where: { externalId: { not: null } }, select: { externalId: true } })).map((x) => x.externalId));
    const match = up.data.find((u) => u.order_id === r.orderId && u.amount_minor === r.amountMinor && !linked.has(u.id));
    if (match) {
      await db.refund.update({ where: { id: r.id }, data: { externalId: match.id, status: match.status === "succeeded" ? "succeeded" : "failed", error: match.status === "succeeded" ? null : `Upstream status ${match.status}` } });
      n++;
    }
  }
  return n;
}
